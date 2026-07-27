/**
 * Duplicate-tolerant extraction of the `refresh` cookie.
 *
 * A browser may hold several cookies named `refresh` for this host — most
 * notably the legacy one production wrote with `path: "/auth/refresh"` until
 * 2026-03-23. RFC 6265 §5.4 lists cookies with longer paths first, and
 * cookie-parser keeps only the first duplicate, so `req.cookies.refresh` can
 * be a long-expired legacy token even though the browser also sent a valid
 * one. These helpers read the raw Cookie header instead so every candidate
 * is visible.
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
 * The refresh token that should be verified: the first candidate that is a
 * readable JWT with `exp` in the future, falling back to the first candidate
 * so single-cookie behaviour (and its error reporting) is unchanged. The
 * `exp` check is only a pre-filter for picking among duplicates — signature
 * and expiry are still enforced by passport-jwt on whatever is returned.
 */
export const pickRefreshToken = (
  cookieHeader: string | undefined,
): string | undefined => {
  const candidates = collectRefreshCookies(cookieHeader);

  const unexpired = candidates.find((token) => {
    const expiresAtMs = decodeExpiryMs(token);
    return expiresAtMs !== undefined && expiresAtMs > Date.now();
  });

  return unexpired ?? candidates[0];
};
