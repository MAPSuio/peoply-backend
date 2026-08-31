import { BlockList, isIP } from "node:net";

/* From https://www.cloudflare.com/ips-v4 and ips-v6, fetched 2026-08-16.
   A missing range makes an edge address look like a visitor, so re-fetch
   both lists when Cloudflare announces a change. */
const CLOUDFLARE_IP_RANGES = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

const PLATFORM_IP_RANGES = [
  "127.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16",
  "::1/128",
  "fc00::/7",
  "fe80::/10",
];

function blockListFor(ranges: string[]) {
  const list = new BlockList();

  for (const range of ranges) {
    const [address, prefix] = range.split("/");
    list.addSubnet(
      address,
      Number(prefix),
      isIP(address) === 6 ? "ipv6" : "ipv4",
    );
  }

  return list;
}

const platformOnly = blockListFor(PLATFORM_IP_RANGES);
const platformAndCloudflare = blockListFor([
  ...PLATFORM_IP_RANGES,
  ...CLOUDFLARE_IP_RANGES,
]);

export function normalizeIp(address: string) {
  const trimmed = address.trim();
  const unmapped = trimmed.replace(/^::ffff:/i, "");

  return isIP(unmapped) === 4 ? unmapped : trimmed;
}

export function isTrustedProxy(address: string, trustCloudflare: boolean) {
  const normalized = normalizeIp(address);
  const family = isIP(normalized);

  if (family === 0) return false;

  const list = trustCloudflare ? platformAndCloudflare : platformOnly;

  return list.check(normalized, family === 6 ? "ipv6" : "ipv4");
}

export function trustProxyHop(address: string) {
  return isTrustedProxy(address, false);
}
