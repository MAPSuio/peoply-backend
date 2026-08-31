import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { isTrustedProxy, normalizeIp } from "./trusted-proxies";

const ORIGIN_SECRET_HEADER = "x-cf-origin-secret";
const CLIENT_IP_HEADER = "x-peoply-client-ip";
const FORWARDED_FOR_HEADER = "x-forwarded-for";
const CLOUDFLARE_CLIENT_HEADER = "cf-connecting-ip";
const UNKNOWN_CLIENT = "unknown";
const MAX_INSPECTED_HOPS = 32;

export interface ClientIpRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string | undefined };
}

function singleHeaderValue(
  req: ClientIpRequest,
  name: string,
): string | undefined {
  const header = req.headers[name];
  const value = Array.isArray(header) ? header[0] : header;

  return value?.trim() || undefined;
}

function listHeaderValues(req: ClientIpRequest, name: string): string[] {
  const header = req.headers[name];
  if (header === undefined) return [];

  return (Array.isArray(header) ? header : [header])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function secretsMatch(presented: string, expected: string) {
  const presentedDigest = createHash("sha256").update(presented).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();

  return timingSafeEqual(presentedDigest, expectedDigest);
}

function isAddress(value: string) {
  return isIP(normalizeIp(value)) !== 0;
}

function addressHeader(req: ClientIpRequest, name: string) {
  const value = singleHeaderValue(req, name);

  return value && isAddress(value) ? normalizeIp(value) : undefined;
}

function configuredOriginSecret() {
  return process.env.CLOUDFLARE_ORIGIN_SECRET?.trim() || undefined;
}

/* Proof that the request crossed our own Cloudflare zone, which is the only
   thing that makes the headers that zone writes worth reading. Requests to the
   *.ondigitalocean.app origin bypass the zone entirely and cannot present it. */
function provenOwnZone(req: ClientIpRequest) {
  const expected = configuredOriginSecret();
  if (!expected) return false;

  const presented = singleHeaderValue(req, ORIGIN_SECRET_HEADER);

  return presented ? secretsMatch(presented, expected) : false;
}

function forwardingChain(req: ClientIpRequest): string[] {
  const peer = req.socket?.remoteAddress ?? req.ip;
  const hops = listHeaderValues(req, FORWARDED_FOR_HEADER);
  if (peer) hops.push(peer);

  return hops.filter(isAddress).map(normalizeIp).slice(-MAX_INSPECTED_HOPS);
}

export function resolveClientIp(req: ClientIpRequest): string {
  const proven = provenOwnZone(req);

  const stamped = proven ? addressHeader(req, CLIENT_IP_HEADER) : undefined;
  if (stamped) return stamped;

  const chain = forwardingChain(req);
  const trustCloudflare = proven || configuredOriginSecret() === undefined;

  for (let hop = chain.length - 1; hop >= 0; hop -= 1) {
    if (!isTrustedProxy(chain[hop], trustCloudflare)) return chain[hop];
  }

  const claimed = proven
    ? addressHeader(req, CLOUDFLARE_CLIENT_HEADER)
    : undefined;

  return claimed ?? chain[0] ?? UNKNOWN_CLIENT;
}

export function isOriginSecretConfigured() {
  return configuredOriginSecret() !== undefined;
}

export function isZoneProven(req: ClientIpRequest) {
  return provenOwnZone(req);
}

export function isClientIpStamped(req: ClientIpRequest) {
  return singleHeaderValue(req, CLIENT_IP_HEADER) !== undefined;
}
