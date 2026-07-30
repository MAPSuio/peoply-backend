import { BadRequestException, Injectable } from "@nestjs/common";
import {
  EventArrangerRole,
  InvitationStatus,
  OrganizationRole,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Organization roles that may answer a co-organizer invitation.
 *
 * Accepting puts the organization's name and logo on someone else's event and
 * lists that event on the organization's page and ICS feed. That is the same
 * authority as sending an organization invitation or editing the
 * organization's own events, both of which are ADMIN/OWNER — a plain MEMBER
 * has never been able to speak for the organization outwardly.
 */
export const CO_ORGANIZER_RESPONDER_ROLES: OrganizationRole[] = [
  OrganizationRole.ADMIN,
  OrganizationRole.OWNER,
];

/** A response the invited organization itself can give. */
const ORGANIZATION_RESPONSES = new Set<InvitationStatus>([
  InvitationStatus.ACCEPTED,
  InvitationStatus.DECLINED,
  InvitationStatus.IGNORED,
]);

/** The subset of an event worth carrying into a notification. */
const EVENT_SUMMARY_SELECT = {
  id: true,
  urlId: true,
  title: true,
  startDate: true,
  image: true,
} as const;

const INVITATION_INCLUDE = {
  organization: {
    select: { id: true, urlId: true, name: true, image: true },
  },
  event: { select: EVENT_SUMMARY_SELECT },
  fromUser: {
    select: { id: true, firstName: true, lastName: true, image: true },
  },
} as const;

/** The Prisma surface this service needs, so it can run inside a transaction. */
type CoOrganizerPrisma = Pick<
  PrismaService,
  "eventCoOrganizerInvitation" | "eventArranger" | "organization"
>;

@Injectable()
export class EventCoOrganizerInvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(invitationId: string) {
    return this.prisma.eventCoOrganizerInvitation.findUnique({
      where: { id: invitationId },
      include: INVITATION_INCLUDE,
    });
  }

  /**
   * Every invitation on an event, for the event's own admins. Includes
   * answered ones so the edit page can show "declined" rather than silently
   * dropping the organization from the list.
   */
  async findAllForEvent(eventId: string) {
    return this.prisma.eventCoOrganizerInvitation.findMany({
      where: { eventId },
      include: INVITATION_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Pending invitations addressed to any organization the user administers.
   *
   * Two round trips rather than a nested `some` filter: the role lookup is
   * served by the `userId` index on user_organization_roles, and the result
   * feeds the leading column of the (organization_id, invitation_status)
   * index. A `some` would leave Postgres joining the whole invitation table.
   */
  async findAllPendingForUser(userId: string) {
    const roles = await this.prisma.userOrganizationRole.findMany({
      where: { userId, role: { in: CO_ORGANIZER_RESPONDER_ROLES } },
      select: { organizationId: true },
    });

    if (roles.length === 0) {
      return [];
    }

    return this.prisma.eventCoOrganizerInvitation.findMany({
      where: {
        organizationId: { in: roles.map((role) => role.organizationId) },
        invitationStatus: InvitationStatus.PENDING,
      },
      include: INVITATION_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  /** Whether the user may answer on the invited organization's behalf. */
  async canRespondOnBehalfOf(userId: string, organizationId: string) {
    const role = await this.prisma.userOrganizationRole.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { role: true },
    });

    return role !== null && CO_ORGANIZER_RESPONDER_ROLES.includes(role.role);
  }

  /**
   * Brings an event's co-organizer invitations in line with the organization
   * ids the event admin submitted, and returns the ids that were newly
   * invited.
   *
   * What this deliberately does not do is attach anyone: an organization only
   * becomes an EventArranger once one of its admins accepts. Removing an id
   * withdraws a pending invitation and detaches an organization that had
   * already accepted, because the event's own admins keep the right to decide
   * who appears on their event.
   */
  async syncInvitations(
    eventId: string,
    organizationIds: string[],
    fromUserId: string,
    excludeArrangerId: string | undefined,
    trx: CoOrganizerPrisma,
  ) {
    const requested = await this.resolveOrganizations(
      organizationIds,
      excludeArrangerId,
      trx,
    );
    const requestedIds = new Set(requested.map(({ id }) => id));

    const existing = await trx.eventCoOrganizerInvitation.findMany({
      where: { eventId },
      select: { id: true, organizationId: true, invitationStatus: true },
    });
    const existingByOrganizationId = new Map(
      existing.map((invitation) => [invitation.organizationId, invitation]),
    );

    const withdrawn = existing.filter(
      (invitation) =>
        !requestedIds.has(invitation.organizationId) &&
        (invitation.invitationStatus === InvitationStatus.PENDING ||
          invitation.invitationStatus === InvitationStatus.ACCEPTED),
    );

    if (withdrawn.length > 0) {
      await trx.eventCoOrganizerInvitation.updateMany({
        where: { id: { in: withdrawn.map(({ id }) => id) } },
        data: {
          invitationStatus: InvitationStatus.CANCELLED,
          respondedByUserId: fromUserId,
        },
      });
      await this.detachArrangers(
        eventId,
        withdrawn.map(({ organizationId }) => organizationId),
        trx,
      );
    }

    // Re-inviting an organization that already accepted would take it back to
    // PENDING and drop it off the event, so those are left alone.
    const toInvite = requested.filter(({ id }) => {
      const invitation = existingByOrganizationId.get(id);
      return (
        invitation === undefined ||
        (invitation.invitationStatus !== InvitationStatus.PENDING &&
          invitation.invitationStatus !== InvitationStatus.ACCEPTED)
      );
    });

    for (const organization of toInvite) {
      await trx.eventCoOrganizerInvitation.upsert({
        where: {
          eventId_organizationId: { eventId, organizationId: organization.id },
        },
        create: {
          eventId,
          organizationId: organization.id,
          fromUserId,
          invitationStatus: InvitationStatus.PENDING,
        },
        update: {
          fromUserId,
          invitationStatus: InvitationStatus.PENDING,
          respondedByUserId: null,
        },
      });
    }

    return toInvite.map(({ id }) => id);
  }

  /**
   * Records the invited organization's answer, and attaches it as a
   * COLLABORATOR when that answer is yes.
   *
   * DECLINED is allowed on an invitation that was previously accepted: that is
   * how an organization withdraws from an event it no longer wants its name
   * on, including the ones it was attached to before invitations existed.
   */
  async respond(
    invitationId: string,
    status: InvitationStatus,
    respondedByUserId: string,
  ) {
    return this.prisma.$transaction(async (trx) => {
      const invitation = await trx.eventCoOrganizerInvitation.update({
        where: { id: invitationId },
        data: { invitationStatus: status, respondedByUserId },
        include: INVITATION_INCLUDE,
      });

      if (status === InvitationStatus.ACCEPTED) {
        const organization = await trx.organization.findUnique({
          where: { id: invitation.organizationId },
          select: { arrangerId: true },
        });

        if (organization) {
          await trx.eventArranger.upsert({
            where: {
              eventId_arrangerId: {
                eventId: invitation.eventId,
                arrangerId: organization.arrangerId,
              },
            },
            create: {
              eventId: invitation.eventId,
              arrangerId: organization.arrangerId,
              role: EventArrangerRole.COLLABORATOR,
            },
            // An organization that is already the event's ADMIN keeps that
            // role — accepting must never demote it.
            update: {},
          });
        }
      }

      if (status === InvitationStatus.DECLINED) {
        await this.detachArrangers(
          invitation.eventId,
          [invitation.organizationId],
          trx,
        );
      }

      return invitation;
    });
  }

  /** Whether this status is one the invited organization gets to give. */
  isOrganizationResponse(status: InvitationStatus) {
    return ORGANIZATION_RESPONSES.has(status);
  }

  /**
   * Removes the COLLABORATOR rows for the given organizations. Scoped to
   * COLLABORATOR so an organization that also runs the event stays its admin.
   */
  private async detachArrangers(
    eventId: string,
    organizationIds: string[],
    trx: CoOrganizerPrisma,
  ) {
    if (organizationIds.length === 0) {
      return;
    }

    const organizations = await trx.organization.findMany({
      where: { id: { in: organizationIds } },
      select: { arrangerId: true },
    });

    if (organizations.length === 0) {
      return;
    }

    await trx.eventArranger.deleteMany({
      where: {
        eventId,
        role: EventArrangerRole.COLLABORATOR,
        arrangerId: { in: organizations.map(({ arrangerId }) => arrangerId) },
      },
    });
  }

  /**
   * Validates the submitted organization ids and drops the event's own
   * arranger, which is a co-organizer of nothing.
   */
  private async resolveOrganizations(
    organizationIds: string[],
    excludeArrangerId: string | undefined,
    trx: CoOrganizerPrisma,
  ) {
    const uniqueIds = [...new Set(organizationIds)];

    if (uniqueIds.length === 0) {
      return [];
    }

    const organizations = await trx.organization.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, arrangerId: true },
    });

    if (organizations.length !== uniqueIds.length) {
      throw new BadRequestException("Invalid co-organizer organization id");
    }

    return organizations.filter(
      ({ arrangerId }) => arrangerId && arrangerId !== excludeArrangerId,
    );
  }
}
