/**
 * Upper bound for the `take` query parameter on paginated search endpoints.
 *
 * This exists to stop a single request from asking the database for an
 * unbounded number of rows — not to dictate page sizes to clients.
 *
 * It was briefly set to 100, which is below what the web frontend already
 * requests (`take=500` on the events index and several other pages), so those
 * pages started failing with 400 "take must not be greater than 100".
 *
 * Lowering this is a breaking API change: the global ValidationPipe rejects an
 * oversized `take` outright rather than clamping it, so any client sending
 * more than the limit breaks immediately. Verify what clients actually send,
 * and land the client change first.
 */
export const MAX_PAGE_SIZE = 500;

/**
 * `take` for a query whose answer is only correct if it returns every matching
 * row. Prisma reads a missing `take` and this as the same thing, so it changes
 * no behaviour: it exists so the decision is written down at the call site
 * rather than inferred from an absence, and so the query bound test can tell a
 * deliberate choice from an oversight.
 */
export const ALL_ROWS = undefined;

/**
 * Models whose rows are what grant a user access to something. A truncated
 * read of one of these does not answer slowly, it answers wrongly: the member
 * past the limit stops being an admin, and the registration past it stops
 * granting the view it paid for.
 */
export const MODELS_WHOSE_ROWS_GRANT_ACCESS = [
  "userOrganizationRole",
  "eventArranger",
  "registration",
] as const;

/** The `skip`/`take` pair a Prisma query needs, with no field left to default. */
export type PageBounds = { skip: number; take: number };

/**
 * Resolves the optional `skip`/`take` a caller sent into bounds a query can
 * use.
 *
 * `take` falls back to {@link MAX_PAGE_SIZE} rather than to a page size,
 * because the lists that take these bounds answered with every matching row
 * before they were paginated. A client that never sent `take` — every page of
 * the web frontend — has to keep getting what it got, so the fallback bounds
 * the query without narrowing the answer.
 */
export function pageBoundsOf(page: {
  skip?: number;
  take?: number;
}): PageBounds {
  return { skip: page.skip ?? 0, take: page.take ?? MAX_PAGE_SIZE };
}
