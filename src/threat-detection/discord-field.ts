/**
 * Discord rejects the whole webhook with a 400 if any embed field value is
 * longer than 1024 characters. Callers log that and carry on, so a single
 * oversized value silently costs the alert rather than the request that
 * triggered it — which makes it worth capping well below the limit.
 */
const MAX_FIELD_LENGTH = 256;

/**
 * Prepares an untrusted value for an embed field.
 *
 * Two problems, both from values an ordinary user controls (an organization
 * name, say):
 *
 *  - Length. An unbounded name made every alert about that organization fail
 *    with a 400, so it could never be reported to moderators at all.
 *  - Structure. The value is rendered as Discord markdown, so newlines and
 *    bold text let the author draw convincing extra "fields" and make the
 *    alert appear to name a different subject.
 *
 * Newlines collapse to spaces and the markdown characters that build emphasis,
 * code, spoilers, links, headings and quotes are escaped. Backslash goes first,
 * or escaping the rest would corrupt it.
 *
 * Parentheses are deliberately left alone: they are only markup as the second
 * half of `[text](url)`, and escaping the `[` already breaks that. Escaping
 * them too would mangle ordinary values like `Ola Nordmann (ola@example.com)`.
 */
export function toDiscordFieldValue(value: unknown, fallback = "—"): string {
  if (value === null || value === undefined) {
    return fallback;
  }

  const collapsed = String(value).replace(/\s+/g, " ").trim();

  if (!collapsed) {
    return fallback;
  }

  const escaped = collapsed
    .replace(/\\/g, "\\\\")
    .replace(/([*_`~|>#[\]])/g, "\\$1");

  return escaped.length > MAX_FIELD_LENGTH
    ? `${escaped.slice(0, MAX_FIELD_LENGTH - 1)}…`
    : escaped;
}
