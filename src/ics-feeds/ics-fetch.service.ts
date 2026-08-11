import {
  BadRequestException,
  Injectable,
  RequestTimeoutException,
} from "@nestjs/common";
import { lookup } from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
/**
 * REQUEST_TIMEOUT_MS is a socket-idle timeout: a server that dribbles one byte
 * just under every 15s holds the connection open forever, and each redirect
 * starts a fresh one. The feed URL is chosen by the caller, so this needs a
 * ceiling on the whole operation, not on each hop.
 */
export const TOTAL_DEADLINE_MS = 45_000;

// Node >= 20 (autoSelectFamily) calls lookup with { all: true } and expects an
// array of { address, family }; older callers expect (err, address, family).
export function createPinnedLookup(resolvedAddress: string) {
  return (_hostname: string, options: unknown, callback: any) => {
    const family = resolvedAddress.includes(":") ? 6 : 4;

    if ((options as { all?: boolean } | undefined)?.all) {
      callback(null, [{ address: resolvedAddress, family }]);
      return;
    }

    callback(null, resolvedAddress, family);
  };
}

/**
 * Splits an IPv6 address into its eight numeric groups, expanding `::`.
 * Returns null for anything that does not have exactly eight groups, so
 * callers can fail closed rather than guess.
 */
function ipv6Groups(address: string): number[] | null {
  // A trailing dotted quad ("::ffff:1.2.3.4") spells out the last two groups.
  // Fold it back into hex first so the group count comes out at eight.
  const dotted = address.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  let expanded = address;

  if (dotted) {
    const [a, b, c, d] = dotted[1].split(".").map(Number);
    const asGroups = `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
    expanded = address.slice(0, -dotted[1].length) + asGroups;
  }

  const halves = expanded.split("::");

  if (halves.length > 2) {
    return null;
  }

  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];

  let groups: string[];

  if (halves.length === 1) {
    groups = head;
  } else {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    groups = [...head, ...Array<string>(fill).fill("0"), ...tail];
  }

  if (groups.length !== 8) {
    return null;
  }

  const parsed = groups.map((group) => Number.parseInt(group, 16));
  return parsed.some(Number.isNaN) ? null : parsed;
}

function isBlockedIpv4(a: number, b: number) {
  return (
    a === 0 || // 0.0.0.0/8   "this network"
    a === 10 || // 10.0.0.0/8  RFC1918
    a === 127 || // 127.0.0.0/8 loopback - the whole range, not just .0.0.1
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 RFC1918
    (a === 192 && b === 0) || // 192.0.0.0/16 protocol assignments + TEST-NET-1
    (a === 192 && b === 168) || // 192.168.0.0/16 RFC1918
    a >= 224 // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved, broadcast
  );
}

/**
 * True for any address that is not routable on the public internet.
 *
 * This used to be a set of string prefix comparisons, which let through
 * everything that was not spelled exactly the way the list expected:
 * `127.0.0.2` and the rest of 127.0.0.0/8, `0.0.0.1`, `100.64.0.0/10`,
 * `fe90::` and the rest of fe80::/10, `::`, `FE80::1` in uppercase, and every
 * IPv4-mapped form except `::ffff:127.` - so `::ffff:169.254.169.254` and
 * `::ffff:10.0.0.5` both passed.
 *
 * Ranges are checked numerically instead. IPv4-mapped and IPv4-compatible IPv6
 * carry an embedded IPv4 address and route as IPv4, so they are judged as the
 * address they actually reach - which covers `::ffff:a.b.c.d`, its hex form
 * `::ffff:7f00:1`, `::1` and `::` in one rule.
 *
 * Anything that does not parse is blocked. A denylist that cannot understand
 * an address has no basis for allowing it.
 */
export function isBlockedAddress(address: string): boolean {
  // A zone id ("fe80::1%eth0") is not part of the address itself.
  const normalized = address.trim().toLowerCase().split("%")[0];
  const version = isIP(normalized);

  if (version === 0) {
    return true;
  }

  if (version === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return isBlockedIpv4(a, b);
  }

  const groups = ipv6Groups(normalized);

  if (!groups) {
    return true;
  }

  const [g0, g1, g2, g3, g4, g5, g6] = groups;

  // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible) both reach an IPv4
  // destination. ::1 and :: fall out of this as 0.0.0.1 and 0.0.0.0.
  const hasIpv4Prefix =
    g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;

  if (hasIpv4Prefix && (g5 === 0xffff || g5 === 0)) {
    return isBlockedIpv4(g6 >> 8, g6 & 0xff);
  }

  return (
    (g0 & 0xfe00) === 0xfc00 || // fc00::/7  unique local
    (g0 & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (g0 & 0xff00) === 0xff00 // ff00::/8  multicast
  );
}

interface CalendarResponse {
  url: string;
  body: string;
  contentType?: string;
}

@Injectable()
export class IcsFetchService {
  async fetchCalendar(url: string): Promise<CalendarResponse> {
    const deadline = Date.now() + TOTAL_DEADLINE_MS;
    let deadlineTimer: NodeJS.Timeout | undefined;
    const deadlineExceeded = new Promise<never>((_, reject) => {
      deadlineTimer = setTimeout(
        () => reject(new RequestTimeoutException("ICS request took too long")),
        TOTAL_DEADLINE_MS,
      );
    });

    try {
      return await Promise.race([
        this.fetchWithRedirects(url, 0, deadline),
        deadlineExceeded,
      ]);
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
    }
  }

  private async fetchWithRedirects(
    rawUrl: string,
    redirectCount: number,
    deadline: number,
  ): Promise<CalendarResponse> {
    if (redirectCount > MAX_REDIRECTS) {
      throw new BadRequestException("ICS URL redirects too many times");
    }

    if (Date.now() >= deadline) {
      throw new RequestTimeoutException("ICS request took too long");
    }

    const url = new URL(rawUrl);
    const validatedAddresses = await this.assertSafeUrl(url);

    if (Date.now() >= deadline) {
      throw new RequestTimeoutException("ICS request took too long");
    }

    const response = await this.makeRequest(
      url,
      validatedAddresses[0],
      deadline,
    );
    const statusCode = response.statusCode ?? 0;

    if (statusCode >= 300 && statusCode < 400 && response.location) {
      const nextUrl = new URL(response.location, url);
      return this.fetchWithRedirects(
        nextUrl.toString(),
        redirectCount + 1,
        deadline,
      );
    }

    if (statusCode !== 200) {
      throw new BadRequestException(
        `ICS URL returned ${response.statusCode ?? "unknown"}`,
      );
    }

    const body = response.body.toString("utf8");
    const contentType = Array.isArray(response.contentType)
      ? response.contentType[0]
      : response.contentType;

    if (
      !contentType?.includes("text/calendar") &&
      !body.trimStart().startsWith("BEGIN:VCALENDAR")
    ) {
      throw new BadRequestException("URL does not return a valid ICS calendar");
    }

    return {
      url: url.toString(),
      body,
      contentType,
    };
  }

  private async assertSafeUrl(url: URL) {
    if (url.protocol !== "https:") {
      throw new BadRequestException("Only HTTPS ICS URLs are supported");
    }

    if (!url.hostname) {
      throw new BadRequestException("ICS URL is missing a hostname");
    }

    const addresses = await this.resolveAddresses(url.hostname);
    if (!addresses.length) {
      throw new BadRequestException("Could not resolve ICS host");
    }

    for (const address of addresses) {
      if (isBlockedAddress(address)) {
        throw new BadRequestException("ICS URL points to a blocked address");
      }
    }

    return addresses;
  }

  private async resolveAddresses(rawHostname: string) {
    /* URL keeps the brackets on an IPv6 literal, and isIP rejects them - so
       https://[::1]/ used to miss the address check entirely and get stopped
       only by the DNS lookup failing, which is not a guarantee. */
    const hostname =
      rawHostname.startsWith("[") && rawHostname.endsWith("]")
        ? rawHostname.slice(1, -1)
        : rawHostname;

    if (isIP(hostname)) {
      return [hostname];
    }

    try {
      const addresses = await lookup(hostname, { all: true });
      return addresses.map(({ address }) => address);
    } catch {
      throw new BadRequestException("Could not resolve ICS host");
    }
  }

  private makeRequest(url: URL, resolvedAddress: string, deadline: number) {
    const transport = url.protocol === "https:" ? https : http;

    return new Promise<{
      statusCode?: number;
      location?: string;
      contentType?: string | string[];
      body: Buffer;
    }>((resolve, reject) => {
      /* The socket timeout below only fires on idleness, so a drip-feeding
         server never trips it. This one is wall-clock and shared across every
         redirect in the chain. */
      const deadlineTimer = setTimeout(
        () => {
          request.destroy();
          reject(new RequestTimeoutException("ICS request took too long"));
        },
        Math.max(0, deadline - Date.now()),
      );

      const settle = <T>(fn: (value: T) => void) => {
        return (value: T) => {
          clearTimeout(deadlineTimer);
          fn(value);
        };
      };
      const resolveOnce = settle(resolve);
      const rejectOnce = settle(reject);

      const request = transport.request(
        url.toString(),
        {
          method: "GET",
          /* Never 0 - node reads a 0 timeout as "no timeout at all". */
          timeout: Math.max(
            1,
            Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now()),
          ),
          lookup: createPinnedLookup(resolvedAddress),
          headers: {
            Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1",
            "User-Agent": "Peoply-ICS-Importer/1.0",
          },
        } as any,
        (response) => {
          const chunks: Buffer[] = [];
          let totalLength = 0;
          const contentLength = Number(response.headers["content-length"] ?? 0);

          if (contentLength > MAX_SIZE_BYTES) {
            response.destroy();
            rejectOnce(new BadRequestException("ICS file exceeds 5 MB"));
            return;
          }

          response.on("data", (chunk: Buffer) => {
            totalLength += chunk.length;
            if (totalLength > MAX_SIZE_BYTES) {
              response.destroy();
              rejectOnce(new BadRequestException("ICS file exceeds 5 MB"));
              return;
            }

            chunks.push(chunk);
          });

          response.on("end", () => {
            resolveOnce({
              statusCode: response.statusCode,
              location: response.headers.location,
              contentType: response.headers["content-type"],
              body: Buffer.concat(chunks),
            });
          });
        },
      );

      request.on("timeout", () => {
        request.destroy();
        rejectOnce(
          new RequestTimeoutException("Timed out while fetching ICS URL"),
        );
      });
      request.on("error", rejectOnce);
      request.end();
    });
  }
}
