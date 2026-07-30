import {
  BadRequestException,
  Injectable,
  RequestTimeoutException,
} from "@nestjs/common";
import { lookup } from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
import { isIP } from "node:net";
import { isPrivateOrReservedAddress } from "../util/ip-address";

const MAX_REDIRECTS = 3;
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
/**
 * REQUEST_TIMEOUT_MS is a socket-idle timeout: a server that dribbles one byte
 * just under every 15s holds the connection open forever, and each redirect
 * starts a fresh one. The feed URL is chosen by the caller, so this needs a
 * ceiling on the whole operation, not on each hop.
 */
const TOTAL_DEADLINE_MS = 45_000;

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

interface CalendarResponse {
  url: string;
  body: string;
  contentType?: string;
}

@Injectable()
export class IcsFetchService {
  async fetchCalendar(url: string): Promise<CalendarResponse> {
    return this.fetchWithRedirects(url, 0, Date.now() + TOTAL_DEADLINE_MS);
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
      if (isPrivateOrReservedAddress(address)) {
        throw new BadRequestException("ICS URL points to a blocked address");
      }
    }

    return addresses;
  }

  private async resolveAddresses(rawHostname: string) {
    /* URL keeps the brackets on an IPv6 literal, and isIP rejects them - so
       https://[::1]/ used to miss the address check entirely and get stopped
       only by the DNS lookup failing, which is not a guarantee. */
    const hostname = rawHostname.replace(/^\[|\]$/g, "");

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
