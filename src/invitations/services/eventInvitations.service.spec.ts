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
});
