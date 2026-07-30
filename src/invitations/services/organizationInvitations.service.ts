import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  InvitationStatus,
  OrganizationRole,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateOrganizationInvitationDto } from "../dto/create-organizationInvitation.dto";
import { createUuid } from "../../util/uuid";

@Injectable()
export class OrganizationInvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(invitationId: string) {
    return this.prisma.organizationInvitation.findUnique({
      where: {
        id: invitationId,
      },
    });
  }

  async findAllPendingInvitationsToUser(userId: string) {
    return this.prisma.organizationInvitation.findMany({
      where: {
        toUserId: userId,
        invitationStatus: InvitationStatus.PENDING,
      },
      include: {
        organization: true,
      },
    });
  }

  async createInvitation(
    organizationId: string,
    fromUserId: string,
    toUserId: string,
    role: OrganizationRole,
  ) {
    return this.prisma.organizationInvitation.create({
      data: {
        organizationId,
        fromUserId,
        toUserId,
        organizationRole: role,
        invitationStatus: InvitationStatus.PENDING,
      },
    });
  }

  isUuid(id: string) {
    const regexExp =
      /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/gi;

    return regexExp.test(id);
  }

  async findUuid(urlId: string) {
    const org = await this.prisma.organization.findUnique({
      where: {
        urlId,
      },
    });

    return org?.id;
  }

  async createInvitations(
    organizationId: string,
    fromUserId: string,
    createOrgInvitesDtos: CreateOrganizationInvitationDto[],
  ) {
    /* Ownership is transferred through PATCH /:orgId/owner, which is OWNER
       only, and PATCH /:orgId/roles refuses to hand out OWNER outright. This
       endpoint is open to ADMIN, so without the same rule an admin could
       invite a second account as OWNER, accept from it, and end up able to
       delete the organization and demote the real owner. */
    const ownerInvite = createOrgInvitesDtos.find(
      (dto) => dto.role === OrganizationRole.OWNER,
    );
    if (ownerInvite) {
      throw new ForbiddenException("Cannot invite a user as owner");
    }

    /* Have to createMany followed by findMany to get returned elements
     *  this is because createMany doesnt return the created elements
     * ref: https://github.com/prisma/prisma/issues/8131
     */

    // if organizationId is a urlId, get the uuid id instead
    if (!this.isUuid(organizationId)) {
      const uuidId = await this.findUuid(organizationId);
      if (uuidId) {
        organizationId = uuidId;
      } else {
        throw new Error("Invalid Organization url id");
      }
    }

    const invitations = await this.prisma.$transaction(async (trx) => {
      const usersWithExistingRoles = await trx.userOrganizationRole.findMany({
        where: {
          organizationId,
          userId: {
            in: createOrgInvitesDtos.map((dto) => dto.userId),
          },
        },
      });
      /* Members can be invited to be admins
       * Admins cannot be invited
       * Users not in organizations can be invited to be both
       */

      /* Users without exiting role */
      const usersNotInOrg = createOrgInvitesDtos.filter(
        (dto) =>
          !usersWithExistingRoles.find((user) => user.userId === dto.userId),
      );

      /* Users that are members, invited to be admins */
      const usersMemberToAdmin = usersWithExistingRoles.filter(
        (user) =>
          user.role === OrganizationRole.MEMBER &&
          createOrgInvitesDtos.find(
            (dto) =>
              dto.userId === user.userId && dto.role === OrganizationRole.ADMIN,
          ),
      );

      const usersToInvite = [...usersNotInOrg, ...usersMemberToAdmin];

      await trx.organizationInvitation.createMany({
        data: usersToInvite.map(
          ({ userId: toUserId, role: organizationRole }) => {
            const invitationId = createUuid();
            return {
              id: invitationId,
              organizationId,
              fromUserId,
              toUserId,
              organizationRole,
              invitationStatus: InvitationStatus.PENDING,
            };
          },
        ),
        skipDuplicates: true,
      });
      return await trx.organizationInvitation.findMany({
        where: {
          organizationId,
          fromUserId,
          toUserId: {
            in: usersToInvite.map(({ userId }) => userId),
          },
          invitationStatus: InvitationStatus.PENDING,
        },
      });
    });
    return invitations;
  }

  async acceptInvitation(invitationId: string) {
    return this.prisma.$transaction(async (trx) => {
      const invitation = await trx.organizationInvitation.update({
        where: {
          id: invitationId,
        },
        data: {
          invitationStatus: InvitationStatus.ACCEPTED,
        },
      });

      await trx.userOrganizationRole.upsert({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: invitation.toUserId,
          },
        },
        create: {
          userId: invitation.toUserId,
          organizationId: invitation.organizationId,
          role: invitation.organizationRole,
        },
        update: {
          role: invitation.organizationRole,
        },
      });
      return invitation;
    });
  }

  async declineInvitation(invitationId: string) {
    return this.prisma.organizationInvitation.update({
      where: {
        id: invitationId,
      },
      data: {
        invitationStatus: InvitationStatus.DECLINED,
      },
    });
  }

  async ignoreInvitation(invitationId: string) {
    return this.prisma.organizationInvitation.update({
      where: {
        id: invitationId,
      },
      data: {
        invitationStatus: InvitationStatus.IGNORED,
      },
    });
  }

  async cancelInvitation(invitationId: string) {
    return this.prisma.organizationInvitation.update({
      where: {
        id: invitationId,
      },
      data: {
        invitationStatus: InvitationStatus.CANCELLED,
      },
    });
  }
}
