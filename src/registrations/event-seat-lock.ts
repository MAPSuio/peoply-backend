import { Prisma } from "../generated/prisma/client";

/**
 * Takes an exclusive row lock on the event, held until the surrounding
 * transaction commits.
 *
 * Counting seats and then inserting is a read-modify-write, and wrapping it in
 * `$transaction` does not make it atomic. Nothing in `src/` passes an
 * `isolationLevel`, so these run at Postgres' default READ COMMITTED; the count
 * is a plain `findUnique(... include: registrations)` that locks nothing, and
 * `schema.prisma` has no constraint tying registrations to `Event.capacity`.
 * Two transactions could therefore both read `going < capacity` and both
 * insert, and nothing anywhere would notice.
 *
 * That is not only a deliberate attack: the throttle is 100 requests per minute
 * per IP, so the ordinary stampede when registration opens on a popular event
 * is enough.
 *
 * A row lock rather than `Serializable`: serializable would abort one of the
 * two with a serialization failure, which means a retry loop and a request that
 * fails for a user who did nothing wrong. This makes the second transaction
 * wait its turn instead, and only against the same event — registrations for
 * different events never contend.
 */
export async function lockEventForSeatChange(
  trx: Prisma.TransactionClient,
  eventId: string,
) {
  // Tagged template: `eventId` is bound as a parameter, never interpolated.
  await trx.$queryRaw`SELECT id FROM events WHERE id = ${eventId} FOR UPDATE`;
}
