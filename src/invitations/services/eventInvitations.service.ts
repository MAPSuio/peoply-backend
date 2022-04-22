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

  async findAllPendingInvitationsToUser(userId: string) {
    return this.prisma.eventInvitation.findMany({
      where: {
        toUserId: userId,
        invitationStatus: InvitationStatus.PENDING,
      },
    });
  }

  async createInvitation(
    eventId: string,
    fromUserId: string,
    toUserId: string,
  ) {
    const invitation = this.prisma.$transaction(async (trx) => {
      const invitation = await trx.eventInvitation.create({
        data: {
          eventId: eventId,
          toUserId,
          fromUserId,
          invitationStatus: InvitationStatus.PENDING,
        },
      });
      const registration = await trx.registration.findUnique({
        where: {
          eventId_userId: {
            eventId: eventId,
            userId: toUserId,
          },
        },
      });
      if (!registration) {
        trx.registration.create({
          data: {
            eventId: eventId,
            userId: toUserId,
            regStatus: RegStatus.INVITED,
          },
        });
      }
      return invitation;
    });
    return invitation;
  }

  async createInvitations(
    eventId: string,
    fromUserId: string,
    toUserIds: string[],
  ) {
    const invitations = await this.prisma.$transaction(async (trx) => {
      trx.eventInvitation.createMany({
        data: toUserIds.map((userId) => {
          const invitationId = uuidv4();
          return {
            id: invitationId,
            eventId,
            fromUserId,
            toUserId: userId,
            invitationStatus: InvitationStatus.PENDING,
          };
        }),
      });
      const existingRegs = await trx.registration.findMany({
        where: {
          eventId,
          userId: {
            in: toUserIds,
          },
        },
      });
      const notRegistreredUserIds = toUserIds.filter(
        (userId) => !existingRegs.find((reg) => reg.userId === userId),
      );
      trx.registration.createMany({
        data: notRegistreredUserIds.map((userId) => {
          return {
            eventId: eventId,
            userId: userId,
            regStatus: RegStatus.INVITED,
          };
        }),
      });
      trx.eventInvitation.findMany({
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

  async acceptInvitation(invitationId: string) {
    return this.prisma.$transaction(async (trx) => {
      const invitation = await trx.eventInvitation.update({
        where: {
          id: invitationId,
        },
        data: {
          invitationStatus: InvitationStatus.ACCEPTED,
        },
      });

      await this.userRegistrationsService.create(invitation.toUserId, {
        eventId: invitation.eventId,
        regStatus: RegStatus.GOING,
      });

      return invitation;
    });
  }

  async declineInvitation(invitationId: string) {
    return this.prisma.$transaction(async (trx) => {
      const invitation = await trx.eventInvitation.update({
        where: {
          id: invitationId,
        },
        data: {
          invitationStatus: InvitationStatus.DECLINED,
        },
      });

      await trx.registration.upsert({
        where: {
          eventId_userId: {
            eventId: invitation.eventId,
            userId: invitation.toUserId,
          },
        },
        create: {
          userId: invitation.toUserId,
          eventId: invitation.eventId,
          regStatus: RegStatus.NOT_GOING,
        },
        update: {
          regStatus: RegStatus.NOT_GOING,
        },
      });

      return invitation;
    });
  }

  async ignoreInvitation(invitationId: string) {
    return this.prisma.eventInvitation.update({
      where: {
        id: invitationId,
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
