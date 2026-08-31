import { EventVisibility, RegStatus } from "../../generated/prisma/client";
import { ArrangerRegistrationService } from "./arranger.registrations.service";
import { EventNotFoundException } from "../../events/exceptions";

const EVENT_ID = "event-1";

function buildService() {
  const prisma = {
    event: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ visibility: EventVisibility.PUBLIC }),
    },
    registration: { count: jest.fn().mockResolvedValue(3) },
  } as any;

  return {
    service: new ArrangerRegistrationService(prisma, {} as any),
    prisma,
  };
}

describe("getRegistrationCount status visibility", () => {
  it("lets an arranger count any status", async () => {
    const { service } = buildService();

    await expect(
      service.getRegistrationCount(
        { regStatus: RegStatus.BANNED } as any,
        EVENT_ID,
        true,
      ),
    ).resolves.toBe(3);
  });

  it.each([RegStatus.GOING, RegStatus.WAITLISTED])(
    "lets an anonymous caller count %s on a public event",
    async (regStatus) => {
      const { service } = buildService();

      await expect(
        service.getRegistrationCount({ regStatus } as any, EVENT_ID, false),
      ).resolves.toBe(3);
    },
  );

  it.each([RegStatus.BANNED, RegStatus.INVITED, RegStatus.NOT_GOING])(
    "hides %s from a non-arranger behind the same not-found the event uses",
    async (regStatus) => {
      const { service } = buildService();

      await expect(
        service.getRegistrationCount({ regStatus } as any, EVENT_ID, false),
      ).rejects.toBeInstanceOf(EventNotFoundException);
    },
  );

  it("counts only attending statuses when a non-arranger omits regStatus", async () => {
    const { service, prisma } = buildService();

    await service.getRegistrationCount({} as any, EVENT_ID, false);

    expect(prisma.registration.count).toHaveBeenCalledWith({
      where: {
        eventId: EVENT_ID,
        regStatus: { in: [RegStatus.GOING, RegStatus.WAITLISTED] },
      },
    });
  });

  it("counts every status when an arranger omits regStatus", async () => {
    const { service, prisma } = buildService();

    await service.getRegistrationCount({} as any, EVENT_ID, true);

    expect(prisma.registration.count).toHaveBeenCalledWith({
      where: { eventId: EVENT_ID },
    });
  });
});
