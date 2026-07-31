import { EventVisibility, RegStatus } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The registration statuses that let a user read an event they would otherwise
 * not be able to see.
 *
 * This mirrors the tail of `EventsService.canViewEvent`, which is private to
 * that service. It is duplicated as data rather than reached for as a method
 * because these are the registration and favourite services - making them
 * depend on EventsService would invert a dependency that already runs the
 * other way.
 *
 * `NOT_GOING` and `BANNED` are deliberately absent: declining an invitation
 * and being thrown out are both meant to end access.
 */
const VIEW_GRANTING_REG_STATUSES: ReadonlySet<RegStatus> = new Set([
  RegStatus.INVITED,
  RegStatus.GOING,
  RegStatus.WAITLISTED,
]);

/**
 * Whether a registration row is on its own enough to read the event it points
 * at. Arranger status is a separate grant, handled by `viewableEventIds`.
 */
export function registrationGrantsEventAccess(
  visibility: EventVisibility,
  regStatus: RegStatus,
) {
  return (
    visibility === EventVisibility.PUBLIC ||
    VIEW_GRANTING_REG_STATUSES.has(regStatus)
  );
}

/**
 * Of `eventIds`, the ones `userId` may read on the strength of arranging them
 * or of holding a view-granting registration.
 *
 * Two queries for a whole page rather than two per row. Callers pass only the
 * ids they are about to redact, so the `in` list is bounded by the page size.
 */
export async function viewableEventIds(
  prisma: PrismaService,
  userId: string,
  eventIds: string[],
): Promise<Set<string>> {
  if (eventIds.length === 0) {
    return new Set();
  }

  const [arranged, registered] = await Promise.all([
    prisma.eventArranger.findMany({
      where: { eventId: { in: eventIds }, arranger: { user: { id: userId } } },
      select: { eventId: true },
    }),
    prisma.registration.findMany({
      where: {
        eventId: { in: eventIds },
        userId,
        regStatus: { in: [...VIEW_GRANTING_REG_STATUSES] },
      },
      select: { eventId: true },
    }),
  ]);

  return new Set(
    [...arranged, ...registered].map(({ eventId }) => eventId as string),
  );
}
