/**
 * `GET /auth/dev-login?email=<anyone>` mints a full session for whichever
 * account is named, with no password and no consent. It is gated on
 * `LOCAL_AUTH_ENABLED` and `NODE_ENV !== "production"`, and then on the request
 * looking local.
 *
 * "Looking local" used to mean `req.hostname`, which is the `Host` header (or
 * `X-Forwarded-Host`, since the app sets `trust proxy`). Both are written by
 * whoever sends the request, so on any non-production deployment that turned
 * the flag on, `curl -H "Host: localhost" https://<host>/auth/dev-login?email=…`
 * was takeover of an arbitrary account.
 *
 * The peer address of the TCP connection is not a header and cannot be set by
 * the client, so that is what is checked here instead.
 */
const LOOPBACK_IPV4_PREFIX = "127.";

export function isLoopbackAddress(address: string | undefined | null) {
  if (!address) return false;

  // Node reports an IPv4 peer on a dual-stack socket as ::ffff:127.0.0.1.
  const normalized = address.startsWith("::ffff:")
    ? address.slice("::ffff:".length)
    : address;

  return (
    normalized === "::1" ||
    normalized === "0000:0000:0000:0000:0000:0000:0000:0001" ||
    normalized.startsWith(LOOPBACK_IPV4_PREFIX)
  );
}
