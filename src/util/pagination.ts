/**
 * Upper bound for the `take` query parameter on paginated search endpoints.
 *
 * Every search service defaults to `take = 10`, so this leaves an order of
 * magnitude of headroom for legitimate clients while keeping a single request
 * from asking the database for an unbounded number of rows.
 */
export const MAX_PAGE_SIZE = 100;
