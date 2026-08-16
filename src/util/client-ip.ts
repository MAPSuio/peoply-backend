import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

/**
 * Resolves the client IP that rate limiting is keyed on.
 *
 * `CF-Connecting-IP` is set by Cloudflare and overwritten on every request that
 * transits its edge, so behind Cloudflare it is authoritative. It is also just
 * a request header: anything that reaches the origin directly can put whatever
 * it likes in it.
 *
 * That matters here because the origin *is* directly reachable. The app runs on
 * DigitalOcean App Platform, whose `*.ondigitalocean.app` hostname answers
 * without going through Cloudflare at all — the production deploy workflow
 * polls exactly that URL. So an attacker who sends a fresh `CF-Connecting-IP`
 * per request lands in a fresh throttler bucket every time and is never rate
 * limited, never crosses a burst-404 threshold, and never trips brute-force
 * detection. Every per-IP control in the application silently stops applying.
 *
 * Two things guard against that:
 *
 * 1. The value must parse as an IP address. Without this the header is an
 *    arbitrary attacker-controlled string used as a Map key and interpolated
 *    into log lines and Discord alerts.
 * 2. The request must prove it came through Cloudflare, by presenting the
 *    shared secret in `CLOUDFLARE_ORIGIN_SECRET` (injected by a Cloudflare
 *    transform rule — see docs/rate-limiting.md). Requests that cannot
 *    prove it fall back to `req.ip`, which Express derives from the proxy
 *    chain and an attacker cannot forge past the trusted hop.
 *
 * When `CLOUDFLARE_ORIGIN_SECRET` is unset the second check cannot run, so the
 * header is trusted as before and only rule 1 applies. That keeps existing
 * deployments working, but it leaves the bypass open, so `main.ts` warns about
 * it at startup rather than letting it pass unnoticed.
 */

const ORIGIN_SECRET_HEADER = "x-cf-origin-secret";

export interface ClientIpRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

function firstHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Compares two secrets without leaking their contents through timing. Hashing
 * first means `timingSafeEqual` always sees equal-length buffers, so unequal
 * lengths do not throw and do not short-circuit.
 */
function secretsMatch(presented: string, expected: string) {
  const presentedDigest = createHash("sha256").update(presented).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();

  return timingSafeEqual(presentedDigest, expectedDigest);
}

function cameThroughCloudflare(req: ClientIpRequest) {
  const expected = process.env.CLOUDFLARE_ORIGIN_SECRET;

  // Not configured: no way to tell, so keep the pre-existing behaviour.
  if (!expected) return true;

  const presented = firstHeaderValue(req.headers[ORIGIN_SECRET_HEADER]);
  if (!presented) return false;

  return secretsMatch(presented, expected);
}

export function resolveClientIp(req: ClientIpRequest): string {
  const claimed = firstHeaderValue(req.headers["cf-connecting-ip"]);

  if (claimed && isIP(claimed) !== 0 && cameThroughCloudflare(req)) {
    return claimed;
  }

  return req.ip ?? "unknown";
}

export function isOriginSecretConfigured() {
  return Boolean(process.env.CLOUDFLARE_ORIGIN_SECRET);
}
