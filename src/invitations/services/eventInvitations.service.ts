import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  EventRegistrationMode,
  InvitationStatus,
  OrganizationRole,
  RegStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { UserRegistrationService } from "../../registrations/services";
import { PUBLIC_USER_SELECT } from "../../users/user.select";
import { createUuid } from "../../util/uuid";

@Injectable()
export class EventInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userRegistrationsService: UserRegistrationService,
  ) {}

  async findOne(invitationId: string) {
    return this.prisma.eventInvitation.findUnique({
      where: {
        id: invitationId,
      },
    });
  }

  async findAllInvitationsForEventIncludingUsers(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (event?.endDate && new Date() > event.endDate) {
      // update invites to ignored for expired events
      await this.prisma.eventInvitation.updateMany({
        where: {
          eventId,
          invitationStatus: InvitationStatus.PENDING,
        },
        data: {
          invitationStatus: InvitationStatus.IGNORED,
        },
      });
    }

    return this.prisma.eventInvitation.findMany({
      where: {
        eventId: eventId,
      },
      select: {
        id: true,
        eventId: true,
        fromUserId: true,
        toUserId: true,
        invitationStatus: true,
        createdAt: true,
        updatedAt: true,
        toUser: { select: PUBLIC_USER_SELECT },
        fromUser: { select: PUBLIC_USER_SELECT },
      },
    });
  }

  async findAllPendingInvitationsToUser(userId: string) {
    const invites = await this.prisma.eventInvitation.findMany({
      where: {
        toUserId: userId,
        invitationStatus: InvitationStatus.PENDING,
      },
      // This result is only scanned for expired events and then discarded, so
      // it needs the id and the end date and nothing else. It used to pull
      // `fromUser: true` as well, which never left the process but put a full
      // user row one refactor away from a response body.
      include: {
        event: true,
      },
    });

    const expiredEvents = invites.filter((invite) => {
      return invite.event?.endDate && new Date() > invite.event.endDate;
    });

    // update invites to ignored for expired events
    if (expiredEvents.length > 0) {
      await this.prisma.eventInvitation.updateMany({
        where: {
          id: { in: expiredEvents.map((event) => event.id) },
        },
        data: {
          invitationStatus: InvitationStatus.IGNORED,
        },
      });
    }

    return this.prisma.eventInvitation.findMany({
      where: {
        toUserId: userId,
        invitationStatus: InvitationStatus.PENDING,
      },
      include: {
        event: true,
        // This is spread verbatim into the notifications payload, so
        // `fromUser: true` handed the inviter's full row to the invitee.
        fromUser: { select: PUBLIC_USER_SELECT },
      },
    });
  }

  async createInvitations(
    eventId: string,
    fromUserId: string,
    toUserIds: string[],
  ) {
    const invitations = await this.prisma.$transaction(async (trx) => {
      const sender = await trx.user.findUnique({
        where: { id: fromUserId },
        select: { arrangerId: true },
      });

      if (!sender) {
        throw new NotFoundException("User not found");
      }

      const event = await trx.event.findUnique({
        where: { id: eventId },
        select: {
          endDate: true,
          regStart: true,
          regEnd: true,
          registrationMode: true,
        },
      });

      if (!event) {
        throw new NotFoundException("Event not found");
      }

      const isDirectArranger = await trx.eventArranger.count({
        where: {
          eventId,
          arrangerId: sender.arrangerId,
        },
      });

      const isOrganizationAdmin = await trx.userOrganizationRole.count({
        where: {
          userId: fromUserId,
          role: {
            in: [OrganizationRole.ADMIN, OrganizationRole.OWNER],
          },
          organization: {
            arranger: {
              eventArrangers: {
                some: {
                  eventId,
                },
              },
            },
          },
        },
      });

      if (!isDirectArranger && !isOrganizationAdmin) {
        throw new ForbiddenException(
          "User is not allowed to invite users to this event",
        );
      }

      if (event?.endDate && new Date() > event.endDate) {
        throw new Error("Event date has already passed");
      }

      if (event?.regStart && new Date() < event.regStart) {
        throw new Error("Event registration is not open yet");
      }

      if (event?.regEnd && new Date() > event.regEnd) {
        throw new Error("Event registration is closed");
      }

      if (event?.registrationMode !== EventRegistrationMode.PEOPLY) {
        throw new Error(
          "Registration for this event does not happen in Peoply",
        );
      }

      const existingRegs = await trx.registration.findMany({
        where: {
          eventId,
          userId: {
            in: toUserIds,
          },
        },
      });

      await trx.eventInvitation.createMany({
        data: toUserIds.map((userId) => {
          const invitationId = createUuid();
          const existingReg = existingRegs.find((reg) => reg.userId === userId);
          return {
            id: invitationId,
            eventId,
            fromUserId,
            toUserId: userId,
            invitationStatus:
              existingReg?.regStatus === RegStatus.GOING ||
              existingReg?.regStatus === RegStatus.WAITLISTED
                ? InvitationStatus.ACCEPTED
                : InvitationStatus.PENDING,
          };
        }),
        skipDuplicates: true,
      });

      const notRegistreredUserIds = toUserIds.filter(
        (userId) => !existingRegs.find((reg) => reg.userId === userId),
      );

      await trx.registration.createMany({
        data: notRegistreredUserIds.map((userId) => {
          return {
            eventId: eventId,
            userId: userId,
            regStatus: RegStatus.INVITED,
          };
        }),
      });

      return trx.eventInvitation.findMany({
        where: {
          eventId,
          fromUserId,
          toUserId: {
            in: toUserIds,
          },
          invitationStatus: InvitationStatus.PENDING,
        },
      });
    });
    return invitations;
  }

  async acceptInvitationsToEvent(
    eventId: string,
    toUserId: string,
    formAnswer?: string,
  ) {
    return this.prisma.$transaction(async (trx) => {
      const event = await trx.event.findUnique({
        where: { id: eventId },
      });

      const user = await trx.user.findUnique({
        where: { id: toUserId },
      });

      if (event?.endDate && new Date() > event.endDate) {
        throw new Error("Event date has already passed");
      }

      if (event?.regStart && new Date() < event.regStart) {
        throw new Error("Event registration is not open yet");
      }

      if (event?.regEnd && new Date() > event.regEnd) {
        throw new Error("Event registration is closed");
      }

      if (event?.registrationMode !== EventRegistrationMode.PEOPLY) {
        throw new Error(
          "Registration for this event does not happen in Peoply",
        );
      }

      if (event?.hasFood && !user?.foodPreference) {
        throw new Error("User has not set food preference");
      }

      await trx.eventInvitation.updateMany({
        where: {
          eventId,
          toUserId,
          invitationStatus: InvitationStatus.PENDING,
        },
        data: {
          invitationStatus: InvitationStatus.ACCEPTED,
        },
      });

      await this.userRegistrationsService.update(toUserId, {
        eventId: eventId,
        regStatus: RegStatus.GOING,
        formAnswer,
      });
    });
  }

  async declineInvitationsToEvent(eventId: string, toUserId: string) {
    return this.prisma.$transaction(async (trx) => {
      const event = await trx.event.findUnique({
        where: { id: eventId },
      });

      if (event?.endDate && new Date() > event.endDate) {
        throw new Error("Event date has already passed");
      }

      if (event?.regStart && new Date() < event.regStart) {
        throw new Error("Event registration is not open yet");
      }

      if (event?.regEnd && new Date() > event.regEnd) {
        throw new Error("Event registration is closed");
      }

      await trx.eventInvitation.updateMany({
        where: {
          eventId,
          toUserId,
          invitationStatus: InvitationStatus.PENDING,
        },
        data: {
          invitationStatus: InvitationStatus.DECLINED,
        },
      });

      // Update many because prisma limits the where-clause on regular update
      // eventId and userId will make this only update ONE unique registration
      await trx.registration.updateMany({
        where: {
          eventId: eventId,
          userId: toUserId,
          regStatus: RegStatus.INVITED,
        },
        data: {
          regStatus: RegStatus.NOT_GOING,
        },
      });
    });
  }

  async ignoreInvitationsToEvent(eventId: string, toUserId: string) {
    await this.prisma.eventInvitation.updateMany({
      where: {
        eventId,
        toUserId,
        invitationStatus: InvitationStatus.PENDING,
      },
      data: {
        invitationStatus: InvitationStatus.IGNORED,
      },
    });
  }

  async cancelInvitation(invitationId: string) {
    const invitation = await this.prisma.eventInvitation.update({
      where: {
        id: invitationId,
      },
      data: {
        invitationStatus: InvitationStatus.CANCELLED,
      },
    });
    return invitation;
  }
}
