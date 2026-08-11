const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escape a value for interpolation into an HTML email body.
 *
 * Every mailer here builds its markup with template literals, and the values
 * going in are attacker-reachable: an event title can come from a third-party
 * ICS feed, and an update's subject/body/replyTo are free text typed by an
 * arranger. The mail then goes out BCC from no-reply@peoply.app to everyone
 * attending, which is exactly the delivery a phishing payload wants.
 *
 * Covers both text and quoted-attribute contexts - `"` and `'` are escaped so
 * a value inside href="..." cannot break out of the attribute. It is NOT safe
 * for unquoted attributes, javascript: URLs or inside <script>/<style>; none
 * of the mailers build those.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}
