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
import { createUuid, isUUID } from "../../util/uuid";
import { MAX_INVITATIONS_PER_REQUEST } from "../invitations.constants";
import { OrganizationInvitationDoesNotExistException } from "../exceptions/organizationInvitationDoesNotExistException.exception";

/**
 * How long a pending organization invitation stays acceptable.
 *
 * `createdAt` has been on the row since the table was created and nothing ever
 * read it, so an invitation was valid forever. Thirty days is long enough that
 * nobody loses a legitimate invitation to a holiday, and short enough that a
 * planted one is not still live a semester later.
 */
const INVITATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Higher wins. Used to make sure accepting an invitation never demotes. */
const ROLE_RANK: Record<OrganizationRole, number> = {
  [OrganizationRole.MEMBER]: 0,
  [OrganizationRole.ADMIN]: 1,
  [OrganizationRole.OWNER]: 2,
};

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
    const cutoff = new Date(Date.now() - INVITATION_MAX_AGE_MS);
    await this.prisma.organizationInvitation.updateMany({
      where: {
        toUserId: userId,
        invitationStatus: InvitationStatus.PENDING,
        createdAt: { lt: cutoff },
      },
      data: {
        invitationStatus: InvitationStatus.IGNORED,
      },
    });

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
    if (role === OrganizationRole.OWNER) {
      throw new ForbiddenException("Cannot invite a user as owner");
    }

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
    if (!isUUID(organizationId)) {
      const org = await this.prisma.organization.findUnique({
        where: { urlId: organizationId },
        select: { id: true },
      });
      if (!org) {
        throw new Error("Invalid Organization url id");
      }
      organizationId = org.id;
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
      const pending = await trx.organizationInvitation.findUnique({
        where: { id: invitationId },
      });

      if (!pending) {
        throw new OrganizationInvitationDoesNotExistException(invitationId);
      }

      if (pending.organizationRole === OrganizationRole.OWNER) {
        throw new ForbiddenException("Cannot accept an invitation as owner");
      }

      /* An invitation is a snapshot of authority taken at invite time. Nothing
         re-checked it, and nothing expired it, so an admin could invite an
         account they control, be removed from the organization entirely, and
         have the invitation accepted months later. Removing a compromised
         admin has to also remove what they authorized. */
      if (Date.now() - pending.createdAt.getTime() > INVITATION_MAX_AGE_MS) {
        throw new ForbiddenException("Invitation has expired");
      }

      const inviterRole = await trx.userOrganizationRole.findUnique({
        where: {
          organizationId_userId: {
            organizationId: pending.organizationId,
            userId: pending.fromUserId,
          },
        },
        select: { role: true },
      });

      if (
        inviterRole?.role !== OrganizationRole.ADMIN &&
        inviterRole?.role !== OrganizationRole.OWNER
      ) {
        throw new ForbiddenException(
          "The user who sent this invitation is no longer an administrator of the organization",
        );
      }

      const invitation = await trx.organizationInvitation.update({
        where: { id: invitationId },
        data: { invitationStatus: InvitationStatus.ACCEPTED },
      });

      const currentRole = await trx.userOrganizationRole.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: invitation.toUserId,
          },
        },
        select: { role: true },
      });

      /* The upsert used to write `invitation.organizationRole` unconditionally,
         including downwards. Two invitations to the same user are distinct rows
         (the unique key includes the role), and stale ones stay visible in the
         notification list forever - so accepting an old MEMBER invitation after
         being made OWNER demoted the owner and left the organization with none.
         `PATCH /:orgId/roles` refuses exactly that; this path did not. */
      if (
        currentRole &&
        ROLE_RANK[currentRole.role] >= ROLE_RANK[invitation.organizationRole]
      ) {
        return invitation;
      }

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
