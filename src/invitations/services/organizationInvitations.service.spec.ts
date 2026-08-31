import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { OrganizationRole } from "../../generated/prisma/client";
import { MAX_INVITATIONS_PER_REQUEST } from "../invitations.constants";
import { OrganizationInvitationsService } from "./organizationInvitations.service";

describe("OrganizationInvitationsService", () => {
  const prisma = {
    $transaction: jest.fn(),
    organization: { findUnique: jest.fn() },
    organizationInvitation: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    userOrganizationRole: { findMany: jest.fn() },
  } as any;

  let service: OrganizationInvitationsService;

  const ORG = "11111111-1111-4111-8111-111111111111";
  const TARGET = "22222222-2222-4222-8222-222222222222";
  const SENDER = "33333333-3333-4333-8333-333333333333";

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof prisma) => unknown) => callback(prisma),
    );
    prisma.userOrganizationRole.findMany.mockResolvedValue([]);
    prisma.organizationInvitation.create.mockResolvedValue({});
    prisma.organizationInvitation.createMany.mockResolvedValue({ count: 1 });
    prisma.organizationInvitation.findMany.mockResolvedValue([]);
    service = new OrganizationInvitationsService(prisma);
  });

  // Ownership is singular and moves only through PATCH /:orgId/owner. An
  // invitation carrying OWNER let an admin mint a second owner from an account
  // they control, then transfer ownership back to themselves - around all
  // three of the checks that guard ownership elsewhere.
  it("refuses to invite a user as owner", async () => {
    await expect(
      service.createInvitations(ORG, SENDER, [
        { userId: TARGET, role: OrganizationRole.OWNER },
      ]),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.organizationInvitation.createMany).not.toHaveBeenCalled();
  });

  it("refuses owner through the singular invitation path", async () => {
    await expect(
      service.createInvitation(ORG, SENDER, TARGET, OrganizationRole.OWNER),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.organizationInvitation.create).not.toHaveBeenCalled();
  });

  it("refuses the whole batch when any entry asks for owner", async () => {
    await expect(
      service.createInvitations(ORG, SENDER, [
        { userId: TARGET, role: OrganizationRole.MEMBER },
        { userId: SENDER, role: OrganizationRole.OWNER },
      ]),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.organizationInvitation.createMany).not.toHaveBeenCalled();
  });

  it.each([OrganizationRole.MEMBER, OrganizationRole.ADMIN])(
    "still invites as %s",
    async (role) => {
      await service.createInvitations(ORG, SENDER, [{ userId: TARGET, role }]);

      expect(prisma.organizationInvitation.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [expect.objectContaining({ organizationRole: role })],
        }),
      );
    },
  );

  it("rejects a batch larger than the per-request limit", async () => {
    const tooMany = Array.from(
      { length: MAX_INVITATIONS_PER_REQUEST + 1 },
      () => ({ userId: TARGET, role: OrganizationRole.MEMBER }),
    );

    await expect(
      service.createInvitations(ORG, SENDER, tooMany),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.organizationInvitation.createMany).not.toHaveBeenCalled();
  });

  it("accepts a batch at exactly the limit", async () => {
    const atLimit = Array.from({ length: MAX_INVITATIONS_PER_REQUEST }, () => ({
      userId: TARGET,
      role: OrganizationRole.MEMBER,
    }));

    await expect(
      service.createInvitations(ORG, SENDER, atLimit),
    ).resolves.toEqual([]);
  });

  describe("findAllPendingInvitationsToUser", () => {
    beforeEach(() => {
      prisma.organizationInvitation.updateMany = jest
        .fn()
        .mockResolvedValue({ count: 0 });
      prisma.organizationInvitation.findMany.mockResolvedValue([]);
    });

    it("asks for the newest rows the caller needs and no more", async () => {
      await service.findAllPendingInvitationsToUser(TARGET, 10);

      expect(
        prisma.organizationInvitation.findMany.mock.calls[0][0],
      ).toMatchObject({ take: 10 });
    });

    it("orders on a unique column too, so a page cannot repeat a row", async () => {
      await service.findAllPendingInvitationsToUser(TARGET, 10);

      expect(
        prisma.organizationInvitation.findMany.mock.calls[0][0].orderBy,
      ).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    });
  });
});
