import { Injectable, NotFoundException } from "@nestjs/common";
import {
  EventArrangerRole,
  EventVisibility,
  OrganizationRole,
  RegStatus,
  User,
} from "../generated/prisma/client";
import { EventNotFoundException } from "../events/exceptions";
import { PrismaService } from "../prisma/prisma.service";
import { ALL_ROWS } from "../util/pagination";

/** The event a route points at. `id` wins when both are present. */
export type EventRef = { id?: string; urlId?: string };

const ALL_EVENT_ARRANGER_ROLES = [
  EventArrangerRole.ADMIN,
  EventArrangerRole.COLLABORATOR,
];

/**
 * The registration statuses that let a user read an event they could
 * otherwise not see. `NOT_GOING` and `BANNED` are deliberately absent:
 * declining an invitation and being thrown out are both meant to end access.
 */
export const VIEW_GRANTING_REG_STATUSES: ReadonlySet<RegStatus> = new Set([
  RegStatus.INVITED,
  RegStatus.GOING,
  RegStatus.WAITLISTED,
]);

/**
 * Answers "may this user act on or see this event?" in one place.
 *
 * Depends on Prisma alone, so EventsService, the guard and the interceptor
 * can all call it without a dependency cycle.
 */
@Injectable()
export class EventAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The arranger role under which `user` may act on the event, or null.
   *
   * A direct arranger row grants its own role when that role is allowed.
   * Failing that, the user may still qualify through an organization that
   * arranges the event with an allowed role, provided they hold one of
   * `orgRoles` in it. The fall-through matters: a person can be a
   * COLLABORATOR themselves and an admin of the owning organization, and the
   * higher grant has to win over the first one found.
   */
  async arrangerRoleFor(
    user: Pick<User, "id" | "arrangerId">,
    eventRef: EventRef,
    opts: {
      /* Which kind of arranger the caller's route is open to. `EventArranger.
         role` was never read anywhere for authorization, so a COLLABORATOR
         added as co-organizer had exactly the powers of the event's own
         arranger - it could delete the event outright, or drop every other
         co-organizer. Absent means both roles, which is the case for most
         routes. */
      allowedArrangerRoles?: EventArrangerRole[];
      /** Which organization roles count when qualifying through an org. */
      orgRoles: OrganizationRole[];
    },
  ): Promise<EventArrangerRole | null> {
    const allowed = opts.allowedArrangerRoles ?? ALL_EVENT_ARRANGER_ROLES;
    const event = await this.findEventWithArrangers(eventRef);

    const direct = event.eventArrangers.find(
      (arranger) => arranger.arrangerId === user.arrangerId,
    );
    if (direct && allowed.includes(direct.role)) {
      return direct.role;
    }

    const qualifying = event.eventArrangers.filter((arranger) =>
      allowed.includes(arranger.role),
    );
    if (qualifying.length === 0) {
      return null;
    }

    /* One set-based query instead of one organization lookup per arranger.
       Arrangers that are individuals simply match no organization row. */
    const memberships = await this.prisma.userOrganizationRole.findMany({
      take: ALL_ROWS,
      where: {
        userId: user.id,
        role: { in: opts.orgRoles },
        organization: {
          arrangerId: { in: qualifying.map(({ arrangerId }) => arrangerId) },
        },
      },
      select: { organization: { select: { arrangerId: true } } },
    });
    const matched = new Set(
      memberships.map(({ organization }) => organization?.arrangerId),
    );

    return (
      qualifying.find(({ arrangerId }) => matched.has(arrangerId))?.role ?? null
    );
  }

  /**
   * Whether `userId` may read the event. Arrangers always may; anyone else
   * needs the event to be public or a view-granting registration on it. An
   * event arranged by an unapproved organization is hidden from everyone but
   * its arrangers.
   */
  async canView(
    eventId: string,
    visibility: EventVisibility,
    userId?: string,
    isArranger = false,
  ): Promise<boolean> {
    if (
      !isArranger &&
      (await this.hasUnapprovedOrganizationArranger(eventId))
    ) {
      return false;
    }

    if (visibility === EventVisibility.PUBLIC) {
      return true;
    }

    if (!userId) {
      return false;
    }

    if (isArranger) {
      return true;
    }

    const registration = await this.prisma.registration.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
      select: {
        regStatus: true,
      },
    });

    return (
      registration !== null &&
      VIEW_GRANTING_REG_STATUSES.has(registration.regStatus)
    );
  }

  /**
   * Whether a registration row is on its own enough to read the event it
   * points at. Arranger status is a separate grant, handled by
   * `viewableEventIds`.
   */
  registrationGrantsEventAccess(
    visibility: EventVisibility,
    regStatus: RegStatus,
  ) {
    return (
      visibility === EventVisibility.PUBLIC ||
      VIEW_GRANTING_REG_STATUSES.has(regStatus)
    );
  }

  /**
   * Of `eventIds`, the ones `userId` may read on the strength of arranging
   * them or of holding a view-granting registration.
   *
   * Two queries for a whole page rather than two per row. Callers pass only
   * the ids they are about to redact, so the `in` list is bounded by the page
   * size.
   */
  async viewableEventIds(
    userId: string,
    eventIds: string[],
  ): Promise<Set<string>> {
    if (eventIds.length === 0) {
      return new Set();
    }

    const [arranged, registered] = await Promise.all([
      this.prisma.eventArranger.findMany({
        take: ALL_ROWS,
        where: {
          eventId: { in: eventIds },
          arranger: { user: { id: userId } },
        },
        select: { eventId: true },
      }),
      this.prisma.registration.findMany({
        take: ALL_ROWS,
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

  private async findEventWithArrangers({ id, urlId }: EventRef) {
    const ref = id ?? urlId;
    if (!ref) {
      throw new NotFoundException(
        "No id or urlId provided. Use urlId as param in function.",
      );
    }

    const event = await this.prisma.event.findUnique({
      where: id ? { id } : { urlId: ref },
      include: { eventArrangers: true },
    });

    if (!event || event.archivedAt) {
      throw new EventNotFoundException(ref);
    }

    return event;
  }

  private async hasUnapprovedOrganizationArranger(eventId: string) {
    const unapprovedOrganizationArranger =
      await this.prisma.eventArranger.findFirst({
        where: {
          eventId,
          arranger: {
            organization: {
              is: {
                approved: false,
              },
            },
          },
        },
        select: {
          eventId: true,
        },
      });

    return Boolean(unapprovedOrganizationArranger);
  }
}
