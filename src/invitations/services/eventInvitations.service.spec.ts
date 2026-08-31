import { ForbiddenException } from "@nestjs/common";
import { EventInvitationsService } from "./eventInvitations.service";

describe("EventInvitationsService", () => {
  it("rejects inviters without event access", async () => {
    const trx = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ arrangerId: "arranger-1" }),
      },
      event: {
        findUnique: jest.fn().mockResolvedValue({
          endDate: null,
          regStart: null,
          regEnd: null,
        }),
      },
      eventArranger: {
        count: jest.fn().mockResolvedValue(0),
      },
      userOrganizationRole: {
        count: jest.fn().mockResolvedValue(0),
      },
      registration: {
        findMany: jest.fn(),
        createMany: jest.fn(),
      },
      eventInvitation: {
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const prisma = {
      $transaction: jest.fn((cb: any) => cb(trx)),
    } as any;

    const service = new EventInvitationsService(prisma, {} as any);

    await expect(
      service.createInvitations("event-1", "user-1", ["user-2"]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe("findAllPendingInvitationsToUser", () => {
    const prisma = {
      eventInvitation: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new EventInvitationsService(prisma as any, {} as any);

    beforeEach(() => jest.clearAllMocks());

    it("lets the database expire invitations to ended events, reading none of them", async () => {
      await service.findAllPendingInvitationsToUser("user-1", 10);

      const [sweep] = prisma.eventInvitation.updateMany.mock.calls[0];
      expect(sweep.where.event.endDate.lt).toBeInstanceOf(Date);
      expect(sweep.data).toEqual({ invitationStatus: "IGNORED" });
    });

    it("asks for the newest rows the caller needs and no more", async () => {
      await service.findAllPendingInvitationsToUser("user-1", 10);

      expect(prisma.eventInvitation.findMany.mock.calls[0][0]).toMatchObject({
        take: 10,
        orderBy: { createdAt: "desc" },
      });
    });
  });
});
