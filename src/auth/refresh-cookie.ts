import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Duplicate-tolerant extraction of the `refresh` cookie.
 *
 * A browser may hold several cookies named `refresh` for this host — most
 * notably the legacy one production wrote with `path: "/auth/refresh"` until
 * 2026-03-23. RFC 6265 §5.4 lists cookies with longer paths first, and
 * cookie-parser keeps only the first duplicate, so `req.cookies.refresh` can
 * be a stale legacy token even though the browser also sent a valid one.
 * These helpers read the raw Cookie header instead so every candidate is
 * visible.
 *
 * Production data showed the legacy tokens are not necessarily expired: they
 * were signed with a refresh secret that has since been rotated, so their
 * `exp` can be in the future while the signature is dead. Picking by `exp`
 * alone therefore still chose the zombie — the pre-filter has to check the
 * signature too.
 */

/** Every value sent under the `refresh` cookie name, in header order. */
export const collectRefreshCookies = (
  cookieHeader: string | undefined,
): string[] => {
  if (!cookieHeader) {
    return [];
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("refresh="))
    .map((part) => part.slice("refresh=".length))
    .filter(Boolean);
};

/** `exp` (ms since epoch) of an unverified JWT, or undefined if unreadable. */
const decodeExpiryMs = (token: string): number | undefined => {
  const payload = token.split(".")[1];

  if (!payload) {
    return undefined;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof claims.exp === "number" ? claims.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Whether the token carries a correct HS256 signature for `secret`. Only a
 * pre-filter for choosing among duplicate cookies: HS256 is what @nestjs/jwt
 * signs with here, and if the algorithm ever changes this simply stops
 * preferring anything — passport-jwt remains the actual gatekeeper for
 * whatever token is picked.
 */
const hasValidSignature = (token: string, secret: string): boolean => {
  const [header, payload, signature] = token.split(".");

  if (!header || !payload || !signature) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest();

  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

const isUnexpired = (token: string): boolean => {
  const expiresAtMs = decodeExpiryMs(token);
  return expiresAtMs !== undefined && expiresAtMs > Date.now();
};

/**
 * The refresh token that should be verified, by preference:
 *
 * 1. the first candidate whose signature matches `secret` and whose `exp`
 *    is in the future — a legacy duplicate can never shadow this one;
 * 2. the first candidate with `exp` in the future (covers a missing or
 *    non-HS256 secret, where signatures cannot be pre-checked);
 * 3. the first candidate, so single-cookie behaviour (and its error
 *    reporting) is unchanged.
 *
 * This is only a pre-filter for picking among duplicates — signature and
 * expiry are still enforced by passport-jwt on whatever is returned.
 */
export const pickRefreshToken = (
  cookieHeader: string | undefined,
  secret?: string,
): string | undefined => {
  const candidates = collectRefreshCookies(cookieHeader);

  const verified = secret
    ? candidates.find(
        (token) => hasValidSignature(token, secret) && isUnexpired(token),
      )
    : undefined;

  return verified ?? candidates.find(isUnexpired) ?? candidates[0];
};
