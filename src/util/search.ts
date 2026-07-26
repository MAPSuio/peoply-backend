/**
 * Turns free text from a query string into a Postgres `tsquery` expression.
 *
 * Prisma's `search` filter hands its value to `to_tsquery`, which is a small
 * language rather than a string: `&`, `|`, `!`, `<->`, parentheses and `:*`
 * are all operators. Anything a caller types goes straight into it, so a
 * description search for `rock & roll` produced `rock & & & roll` and Postgres
 * answered with `syntax error in tsquery` — an HTTP 500 from a perfectly
 * ordinary search term.
 *
 * The value is a bound parameter, so this was never SQL injection; the damage
 * was that any caller could error the endpoint at will, and unbalanced quotes
 * produced particularly confusing messages.
 *
 * Rather than escape the operators, drop them: search terms are words, and a
 * user typing `&` means the character, not conjunction. Everything that is not
 * a letter, digit or underscore is removed, and the surviving terms are ANDed
 * together — which is what the previous implementation was reaching for.
 *
 * Returns `undefined` when nothing survives (`"&&&"`, `"  "`), so callers can
 * omit the filter instead of sending an empty query that Postgres would warn
 * about and match nothing with.
 */
export function buildDescriptionSearchQuery(input: string): string | undefined {
  const terms = input
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}_]/gu, ""))
    .filter((term) => term.length > 0);

  return terms.length > 0 ? terms.join(" & ") : undefined;
}
