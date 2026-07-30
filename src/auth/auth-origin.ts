type HeaderValue = string | string[] | undefined;

interface HeaderLike {
  origin?: HeaderValue;
  referer?: HeaderValue;
}

function getSingleHeaderValue(value: HeaderValue) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function parseTrustedOrigins(corsOrigin?: string) {
  return (corsOrigin ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Paths allowed to make a state-changing, cookie-carrying request without an
 * `Origin` or `Referer`.
 *
 * The frontend's `getServerSideProps` for an event page calls
 * `POST /auth/refresh` with the visitor's cookies forwarded verbatim, from
 * Node — no browser, so no `Origin` and no `Referer`. Rejecting it would make a
 * logged-in user with an expired access token see a 404 for an event they can
 * actually read.
 *
 * Exempting it is cheap: the endpoint's whole job is to exchange a refresh
 * cookie for new cookies, both of which are httpOnly, and a cross-site attacker
 * cannot read the response. Forcing a victim to rotate their own tokens gains
 * nothing.
 */
const ORIGINLESS_ALLOWED_PATHS = new Set(["/auth/refresh"]);

/**
 * Whether a request must be rejected on origin grounds.
 *
 * The previous form of this check had `requestOrigin` as one of the ANDs, so a
 * request with no `Origin` and no `Referer` skipped it entirely. Production
 * cookies are `sameSite: "none"`, which means the browser attaches them to
 * cross-site requests too, and this check is the only thing standing in for
 * them — so the absent-header case is the one that must not be waved through.
 */
export function isUntrustedOrigin(
  method: string,
  path: string,
  hasAuthCookie: boolean,
  requestOrigin: string | undefined,
  trustedOrigins: string[],
) {
  const isStateChanging = !["GET", "HEAD", "OPTIONS"].includes(method);

  if (!isStateChanging || !hasAuthCookie || !trustedOrigins.length) {
    return false;
  }

  if (!requestOrigin) {
    return !ORIGINLESS_ALLOWED_PATHS.has(path);
  }

  return !trustedOrigins.includes(requestOrigin);
}

export function extractRequestOrigin(headers: HeaderLike) {
  const directOrigin = getSingleHeaderValue(headers.origin);
  if (directOrigin) {
    return directOrigin;
  }

  const referer = getSingleHeaderValue(headers.referer);
  if (!referer) {
    return undefined;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
