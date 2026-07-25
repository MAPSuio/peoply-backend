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
