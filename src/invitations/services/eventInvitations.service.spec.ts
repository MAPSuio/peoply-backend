import { ForbiddenException } from "@nestjs/common";
import { EventInvitationsService } from "./eventInvitations.service";

describe("EventInvitationsService", () => {
  describe("createInvitations", () => {
    const setup = ({
      visibility,
      isArranger,
      canView,
    }: {
      visibility: string;
      isArranger: boolean;
      canView: boolean;
    }) => {
      const trx = {
        user: {
          findUnique: jest.fn().mockResolvedValue({ arrangerId: "arranger-1" }),
        },
        event: {
          findUnique: jest.fn().mockResolvedValue({
            endDate: null,
            regStart: null,
            regEnd: null,
            registrationMode: "PEOPLY",
            visibility,
          }),
        },
        eventArranger: {
          count: jest.fn().mockResolvedValue(isArranger ? 1 : 0),
        },
        userOrganizationRole: {
          count: jest.fn().mockResolvedValue(0),
        },
        registration: {
          findMany: jest.fn().mockResolvedValue([]),
          createMany: jest.fn(),
        },
        eventInvitation: {
          createMany: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const prisma = {
        $transaction: jest.fn((cb: any) => cb(trx)),
      } as any;
      const eventAccess = {
        canView: jest.fn().mockResolvedValue(canView),
      } as any;
      const service = new EventInvitationsService(
        prisma,
        {} as any,
        eventAccess,
      );
      return { service, trx, eventAccess };
    };

    it("lets anyone who can see a public event invite", async () => {
      const { service, trx } = setup({
        visibility: "PUBLIC",
        isArranger: false,
        canView: true,
      });

      await service.createInvitations("event-1", "user-1", ["user-2"]);

      expect(trx.eventInvitation.createMany).toHaveBeenCalled();
    });

    it("rejects a non-arranger who cannot see the event", async () => {
      const { service, trx, eventAccess } = setup({
        visibility: "UNLISTED",
        isArranger: false,
        canView: false,
      });

      await expect(
        service.createInvitations("event-1", "user-1", ["user-2"]),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(eventAccess.canView).toHaveBeenCalledWith(
        "event-1",
        "UNLISTED",
        "user-1",
      );
      expect(trx.eventInvitation.createMany).not.toHaveBeenCalled();
    });

    it("keeps private events closed to non-arrangers who can see them", async () => {
      const { service, trx } = setup({
        visibility: "PRIVATE",
        isArranger: false,
        canView: true,
      });

      await expect(
        service.createInvitations("event-1", "user-1", ["user-2"]),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(trx.eventInvitation.createMany).not.toHaveBeenCalled();
    });

    it("lets arrangers invite to their private events", async () => {
      const { service, trx } = setup({
        visibility: "PRIVATE",
        isArranger: true,
        canView: false,
      });

      await service.createInvitations("event-1", "user-1", ["user-2"]);

      expect(trx.eventInvitation.createMany).toHaveBeenCalled();
    });
  });

  describe("findAllPendingInvitationsToUser", () => {
    const prisma = {
      eventInvitation: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new EventInvitationsService(
      prisma as any,
      {} as any,
      {} as any,
    );

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
      });
    });

    it("orders on a unique column too, so a page cannot repeat a row", async () => {
      await service.findAllPendingInvitationsToUser("user-1", 10);

      expect(prisma.eventInvitation.findMany.mock.calls[0][0].orderBy).toEqual([
        { createdAt: "desc" },
        { id: "desc" },
      ]);
    });
  });
});
