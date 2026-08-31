import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { isTrustedProxy, normalizeIp } from "./trusted-proxies";

const ORIGIN_SECRET_HEADER = "x-cf-origin-secret";
const FORWARDED_FOR_HEADER = "x-forwarded-for";
const CLOUDFLARE_CLIENT_HEADER = "cf-connecting-ip";
const UNKNOWN_CLIENT = "unknown";

export interface ClientIpRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string | undefined };
}

function headerValues(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];

  return (Array.isArray(value) ? value : [value])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function secretsMatch(presented: string, expected: string) {
  const presentedDigest = createHash("sha256").update(presented).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();

  return timingSafeEqual(presentedDigest, expectedDigest);
}

function cameThroughCloudflare(req: ClientIpRequest) {
  const expected = process.env.CLOUDFLARE_ORIGIN_SECRET;
  if (!expected) return true;

  const presented = headerValues(req.headers[ORIGIN_SECRET_HEADER])[0];
  if (!presented) return false;

  return secretsMatch(presented, expected);
}

function isAddress(value: string) {
  return isIP(normalizeIp(value)) !== 0;
}

function forwardingChain(req: ClientIpRequest): string[] {
  const peer = req.socket?.remoteAddress ?? req.ip;
  const hops = [...headerValues(req.headers[FORWARDED_FOR_HEADER])];
  if (peer) hops.push(peer);

  return hops.filter(isAddress).map(normalizeIp);
}

function claimedByCloudflare(req: ClientIpRequest): string | undefined {
  const header = req.headers[CLOUDFLARE_CLIENT_HEADER];
  const claimed = Array.isArray(header) ? header[0] : header;

  return claimed && isAddress(claimed) ? normalizeIp(claimed) : undefined;
}

export function resolveClientIp(req: ClientIpRequest): string {
  const trustCloudflare = cameThroughCloudflare(req);
  const chain = forwardingChain(req);

  for (let hop = chain.length - 1; hop >= 0; hop -= 1) {
    if (!isTrustedProxy(chain[hop], trustCloudflare)) return chain[hop];
  }

  const claimed = trustCloudflare ? claimedByCloudflare(req) : undefined;

  return claimed ?? chain[0] ?? UNKNOWN_CLIENT;
}

export function isOriginSecretConfigured() {
  return Boolean(process.env.CLOUDFLARE_ORIGIN_SECRET);
}
