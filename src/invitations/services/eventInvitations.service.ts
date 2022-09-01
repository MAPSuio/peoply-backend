import { Injectable } from "@nestjs/common";
import { InvitationStatus, RegStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { UserRegistrationService } from "../../registrations/services";
import { v4 as uuidv4 } from "uuid";

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
      include: {
        toUser: true,
        fromUser: true,
      },
    });
  }

  async findAllPendingInvitationsToUser(userId: string) {
    const invites = await this.prisma.eventInvitation.findMany({
      where: {
        toUserId: userId,
        invitationStatus: InvitationStatus.PENDING,
      },
      include: {
        event: true,
        fromUser: true,
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
        fromUser: true,
      },
    });
  }

  async createInvitations(
    eventId: string,
    fromUserId: string,
    toUserIds: string[],
  ) {
    const invitations = await this.prisma.$transaction(async (trx) => {
      const event = await trx.event.findUnique({
        where: { id: eventId },
      });

      if (event?.endDate && new Date() > event.endDate) {
        throw new Error("Event date has already passed");
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
          const invitationId = uuidv4();
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

  async acceptInvitationsToEvent(eventId: string, toUserId: string) {
    return this.prisma.$transaction(async (trx) => {
      const event = await trx.event.findUnique({
        where: { id: eventId },
      });

      if (event?.endDate && new Date() > event.endDate) {
        throw new Error("Event date has already passed");
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
