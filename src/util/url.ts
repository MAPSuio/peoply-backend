const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * True when a value is a URL the frontend may hand to `window.open` or an
 * `href`. Anything else - `javascript:`, `data:`, `vbscript:`, a bare string -
 * is rejected, because those execute rather than navigate.
 */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  try {
    return ALLOWED_PROTOCOLS.has(new URL(value.trim()).protocol);
  } catch {
    /* Not a URL at all. */
    return false;
  }
}
