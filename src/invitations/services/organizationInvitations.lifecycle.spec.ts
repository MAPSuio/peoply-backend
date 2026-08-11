import { ForbiddenException } from "@nestjs/common";
import {
  InvitationStatus,
  OrganizationRole,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { OrganizationInvitationsService } from "./organizationInvitations.service";

/**
 * Covers what happens when a pending invitation is accepted: that it still
 * reflects live authority, that it has not gone stale, and that it cannot lower
 * a role the recipient already holds.
 *
 * Kept apart from organizationInvitations.service.spec.ts so the two can land
 * independently.
 */
describe("OrganizationInvitationsService.acceptInvitation", () => {
  const ORG = "org-1";
  const INVITER = "inviter-1";
  const RECIPIENT = "recipient-1";

  const invitation = (overrides: Record<string, unknown> = {}) => ({
    id: "inv-1",
    organizationId: ORG,
    fromUserId: INVITER,
    toUserId: RECIPIENT,
    organizationRole: OrganizationRole.ADMIN,
    invitationStatus: InvitationStatus.PENDING,
    createdAt: new Date(),
    ...overrides,
  });

  /**
   * `roles` is keyed by userId. `undefined` means the user holds no role in the
   * organization at all.
   */
  const serviceWith = (
    pending: ReturnType<typeof invitation> | null,
    roles: Record<string, OrganizationRole | undefined>,
  ) => {
    const upsert = jest.fn().mockResolvedValue({});
    const update = jest.fn().mockImplementation(async () => pending);

    const trx = {
      organizationInvitation: {
        findUnique: jest.fn().mockResolvedValue(pending),
        update,
      },
      userOrganizationRole: {
        findUnique: jest
          .fn()
          .mockImplementation(
            async ({
              where,
            }: {
              where: { organizationId_userId: { userId: string } };
            }) => {
              const role = roles[where.organizationId_userId.userId];
              return role ? { role } : null;
            },
          ),
        upsert,
      },
    };

    const prisma = {
      $transaction: (fn: (t: typeof trx) => unknown) => fn(trx),
    } as unknown as PrismaService;

    return {
      service: new OrganizationInvitationsService(prisma),
      upsert,
      update,
    };
  };

  it("grants the role when the inviter is still an admin", async () => {
    const { service, upsert } = serviceWith(invitation(), {
      [INVITER]: OrganizationRole.ADMIN,
    });

    await service.acceptInvitation("inv-1");

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { role: OrganizationRole.ADMIN },
      }),
    );
  });

  it("refuses once the inviter has been removed from the organization", async () => {
    const { service, upsert } = serviceWith(invitation(), {});

    await expect(service.acceptInvitation("inv-1")).rejects.toThrow(
      ForbiddenException,
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses a pending legacy owner invitation", async () => {
    const { service, upsert, update } = serviceWith(
      invitation({ organizationRole: OrganizationRole.OWNER }),
      { [INVITER]: OrganizationRole.OWNER },
    );

    await expect(service.acceptInvitation("inv-1")).rejects.toThrow(
      "Cannot accept an invitation as owner",
    );
    expect(update).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses once the inviter has been demoted to member", async () => {
    const { service, upsert } = serviceWith(invitation(), {
      [INVITER]: OrganizationRole.MEMBER,
    });

    await expect(service.acceptInvitation("inv-1")).rejects.toThrow(
      ForbiddenException,
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses an invitation older than 30 days", async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const { service, upsert } = serviceWith(
      invitation({ createdAt: thirtyOneDaysAgo }),
      { [INVITER]: OrganizationRole.OWNER },
    );

    await expect(service.acceptInvitation("inv-1")).rejects.toThrow(
      "Invitation has expired",
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it("still accepts one that is 29 days old", async () => {
    const { service, upsert } = serviceWith(
      invitation({
        createdAt: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000),
      }),
      { [INVITER]: OrganizationRole.OWNER },
    );

    await service.acceptInvitation("inv-1");

    expect(upsert).toHaveBeenCalled();
  });

  /* The demotion this is really about: a stale MEMBER invitation accepted after
     the recipient has become OWNER used to leave the organization ownerless. */
  it("does not demote an owner who accepts a stale member invitation", async () => {
    const { service, upsert, update } = serviceWith(
      invitation({ organizationRole: OrganizationRole.MEMBER }),
      {
        [INVITER]: OrganizationRole.ADMIN,
        [RECIPIENT]: OrganizationRole.OWNER,
      },
    );

    await service.acceptInvitation("inv-1");

    expect(upsert).not.toHaveBeenCalled();
    // The invitation is still marked accepted, so it leaves the notification
    // list rather than sitting there forever waiting to be clicked again.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { invitationStatus: InvitationStatus.ACCEPTED },
      }),
    );
  });

  it("does not demote an admin who accepts a stale member invitation", async () => {
    const { service, upsert } = serviceWith(
      invitation({ organizationRole: OrganizationRole.MEMBER }),
      {
        [INVITER]: OrganizationRole.ADMIN,
        [RECIPIENT]: OrganizationRole.ADMIN,
      },
    );

    await service.acceptInvitation("inv-1");

    expect(upsert).not.toHaveBeenCalled();
  });

  it("still promotes a member to admin", async () => {
    const { service, upsert } = serviceWith(invitation(), {
      [INVITER]: OrganizationRole.OWNER,
      [RECIPIENT]: OrganizationRole.MEMBER,
    });

    await service.acceptInvitation("inv-1");

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { role: OrganizationRole.ADMIN } }),
    );
  });
});
