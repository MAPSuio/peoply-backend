import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import {
  InvitationStatus,
  OrganizationRole,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateOrganizationInvitationDto } from "../dto/create-organizationInvitation.dto";
import { createUuid } from "../../util/uuid";
import { MAX_INVITATIONS_PER_REQUEST } from "../invitations.constants";

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
    /* Have to createMany followed by findMany to get returned elements
     *  this is because createMany doesnt return the created elements
     * ref: https://github.com/prisma/prisma/issues/8131
     */

    if (createOrgInvitesDtos.length > MAX_INVITATIONS_PER_REQUEST) {
      throw new BadRequestException(
        `Cannot send more than ${MAX_INVITATIONS_PER_REQUEST} invitations in one request`,
      );
    }

    /* Ownership is singular and transfers only through PATCH /:orgId/owner,
     * which moves the existing owner down in the same transaction. Nothing
     * here stopped an invitation carrying role OWNER, so an admin could invite
     * a second account they control as OWNER, accept it, and hand ownership
     * back to themselves - going around "Cannot change to owner", "Cannot
     * change role of owner" and "You can't delete the owner" in one move. */
    if (
      createOrgInvitesDtos.some((dto) => dto.role === OrganizationRole.OWNER)
    ) {
      throw new ForbiddenException("Cannot invite a user as owner");
    }

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
