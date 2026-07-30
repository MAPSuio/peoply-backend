import { ForbiddenException } from "@nestjs/common";
import { OrganizationRole } from "../../generated/prisma/client";
import { OrganizationInvitationsService } from "./organizationInvitations.service";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const FROM_USER_ID = "22222222-2222-4222-8222-222222222222";
const TO_USER_ID = "33333333-3333-4333-8333-333333333333";

function buildPrisma() {
  const trx = {
    userOrganizationRole: { findMany: jest.fn().mockResolvedValue([]) },
    organizationInvitation: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  return {
    trx,
    prisma: {
      $transaction: jest.fn((cb: any) => cb(trx)),
    } as any,
  };
}

describe("OrganizationInvitationsService.createInvitations", () => {
  it("refuses to invite anyone as owner", async () => {
    const { prisma, trx } = buildPrisma();
    const service = new OrganizationInvitationsService(prisma);

    await expect(
      service.createInvitations(ORG_ID, FROM_USER_ID, [
        { userId: TO_USER_ID, role: OrganizationRole.OWNER },
      ]),
    ).rejects.toBeInstanceOf(ForbiddenException);

    /* Nothing may be written, and the rejection has to come before the
       transaction so a mixed batch cannot half-apply. */
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(trx.organizationInvitation.createMany).not.toHaveBeenCalled();
  });

  it("refuses a batch where only one entry asks for owner", async () => {
    const { prisma } = buildPrisma();
    const service = new OrganizationInvitationsService(prisma);

    await expect(
      service.createInvitations(ORG_ID, FROM_USER_ID, [
        { userId: TO_USER_ID, role: OrganizationRole.MEMBER },
        { userId: FROM_USER_ID, role: OrganizationRole.OWNER },
      ]),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([OrganizationRole.MEMBER, OrganizationRole.ADMIN])(
    "still allows inviting a non-member as %s",
    async (role) => {
      const { prisma, trx } = buildPrisma();
      const service = new OrganizationInvitationsService(prisma);

      await service.createInvitations(ORG_ID, FROM_USER_ID, [
        { userId: TO_USER_ID, role },
      ]);

      expect(trx.organizationInvitation.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [expect.objectContaining({ organizationRole: role })],
        }),
      );
    },
  );
});
