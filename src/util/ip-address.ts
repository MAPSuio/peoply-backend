import { isIP } from "node:net";

/**
 * IPv4 ranges that must never be reachable from a server-side fetch of a
 * user-supplied URL. Beyond RFC1918 this covers the ranges that actually carry
 * cloud metadata and host-local services.
 */
const BLOCKED_IPV4_CIDRS: ReadonlyArray<[string, number]> = [
  ["0.0.0.0", 8], // "this network" - 0.0.0.0 reaches localhost on Linux
  ["10.0.0.0", 8], // RFC1918
  ["100.64.0.0", 10], // RFC6598 CGNAT - used as the node network by several k8s CNIs
  ["127.0.0.0", 8], // loopback, all of it: 127.1 and 127.0.0.2 are localhost too
  ["169.254.0.0", 16], // link-local, incl. 169.254.169.254 cloud metadata
  ["172.16.0.0", 12], // RFC1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.168.0.0", 16], // RFC1918
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. 255.255.255.255
];

/**
 * Azure's Wire Server. It is a routable-looking address outside every private
 * range, and it answers on the host network of any Azure VM - which is where
 * this app runs.
 */
const BLOCKED_IPV4_HOSTS = new Set(["168.63.129.16"]);

function ipv4ToInt(address: string) {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }

  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return null;
    }
    value = value * 256 + octet;
  }
  return value;
}

function isBlockedIpv4(address: string) {
  if (BLOCKED_IPV4_HOSTS.has(address)) {
    return true;
  }

  const value = ipv4ToInt(address);
  if (value === null) {
    /* Not a shape we recognise - refusing beats guessing. */
    return true;
  }

  return BLOCKED_IPV4_CIDRS.some(([network, bits]) => {
    const networkValue = ipv4ToInt(network);
    if (networkValue === null) {
      return false;
    }
    /* >>> 0 because a /8 mask is negative as a signed 32-bit int. */
    const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === (networkValue & mask) >>> 0;
  });
}

/**
 * Expands an IPv6 address to its eight 16-bit groups. Returns null for
 * anything that does not parse, so callers can fail closed.
 */
function expandIpv6(address: string): number[] | null {
  const zoneStripped = address.split("%")[0];
  const halves = zoneStripped.split("::");
  if (halves.length > 2) {
    return null;
  }

  const parseGroups = (part: string): number[] | null => {
    if (!part) {
      return [];
    }
    const groups: number[] = [];
    for (const chunk of part.split(":")) {
      if (chunk.includes(".")) {
        /* Trailing dotted-quad, as in ::ffff:127.0.0.1 */
        const value = ipv4ToInt(chunk);
        if (value === null) {
          return null;
        }
        groups.push(value >>> 16, value & 0xffff);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(chunk)) {
        return null;
      }
      groups.push(Number.parseInt(chunk, 16));
    }
    return groups;
  };

  const head = parseGroups(halves[0]);
  const tail = halves.length === 2 ? parseGroups(halves[1]) : [];
  if (head === null || tail === null) {
    return null;
  }

  if (halves.length === 1) {
    return head.length === 8 ? head : null;
  }

  const missing = 8 - head.length - tail.length;
  if (missing < 0) {
    return null;
  }
  return [...head, ...new Array(missing).fill(0), ...tail];
}

function isBlockedIpv6(address: string) {
  const groups = expandIpv6(address);
  if (groups === null) {
    return true;
  }

  /* IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) both reach an
     IPv4 destination, so they get the IPv4 rules rather than a prefix test. */
  const isMapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const isCompatible =
    groups.slice(0, 6).every((group) => group === 0) &&
    !(groups[6] === 0 && groups[7] === 0);

  if (isMapped || isCompatible) {
    const high = groups[6];
    const low = groups[7];
    return isBlockedIpv4(
      [high >>> 8, high & 0xff, low >>> 8, low & 0xff].join("."),
    );
  }

  /* :: (unspecified) and ::1 (loopback) */
  if (groups.slice(0, 7).every((group) => group === 0)) {
    return true;
  }

  const first = groups[0];
  if ((first & 0xfe00) === 0xfc00) {
    return true; // fc00::/7 unique local
  }
  if ((first & 0xffc0) === 0xfe80) {
    return true; // fe80::/10 link-local
  }

  return false;
}

/**
 * True when an address belongs to a range a server-side fetch of a
 * user-supplied URL must never reach: loopback, private, link-local, CGNAT,
 * multicast, reserved, or a known cloud metadata endpoint.
 *
 * Fails closed - anything that does not parse as an IP is treated as blocked,
 * because a caller reaching this point has already decided it is one.
 */
export function isPrivateOrReservedAddress(address: string) {
  const version = isIP(address);

  if (version === 4) {
    return isBlockedIpv4(address);
  }
  if (version === 6) {
    return isBlockedIpv6(address);
  }
  return true;
}
