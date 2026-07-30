/**
 * One request should not be able to queue an unbounded number of invitation
 * rows. Both invitation endpoints take an array body, and both write it with a
 * single `createMany` inside a transaction, so the array length is the only
 * thing bounding that write. Well above what an organiser plausibly invites at
 * once.
 */
export const MAX_INVITATIONS_PER_REQUEST = 200;
