import { RegStatus } from ".prisma/client";
import { Logger } from "@nestjs/common";
import { UserRegistrationService } from "./user.registrations.service";
import { CommonRegistrationService } from "./common.registrations.service";

describe("UserRegistrationService.updateAllRegistrationsOfUserToNotGoing", () => {
  let service: UserRegistrationService;
  let prisma: any;
  let updateRegistration: jest.SpyInstance;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

    prisma = {
      registration: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new UserRegistrationService(prisma, {} as any);

    updateRegistration = jest
      .spyOn(CommonRegistrationService.prototype, "updateRegistration")
      .mockResolvedValue(undefined as any);
  });

  it("awaits every registration before resolving", async () => {
    prisma.registration.findMany.mockResolvedValueOnce([
      { eventId: "event-1" },
      { eventId: "event-2" },
      { eventId: "event-3" },
    ]);

    let settled = 0;
    updateRegistration.mockImplementation(
      () =>
        new Promise((resolve) =>
          setImmediate(() => {
            settled += 1;
            resolve(undefined);
          }),
        ),
    );

    await service.updateAllRegistrationsOfUserToNotGoing("user-1");

    // The old implementation used forEach(async ...) and resolved before any
    // of these completed.
    expect(settled).toBe(3);
    expect(updateRegistration).toHaveBeenCalledTimes(3);
  });

  it("releases each registration as NOT_GOING", async () => {
    prisma.registration.findMany.mockResolvedValueOnce([
      { eventId: "event-1" },
    ]);

    await service.updateAllRegistrationsOfUserToNotGoing("user-1");

    expect(updateRegistration).toHaveBeenCalledWith(
      "user-1",
      "event-1",
      RegStatus.NOT_GOING,
    );
  });

  it("only considers held spots on events that have not ended", async () => {
    await service.updateAllRegistrationsOfUserToNotGoing("user-1");

    const where = prisma.registration.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe("user-1");
    expect(where.regStatus).toEqual({
      in: [RegStatus.GOING, RegStatus.WAITLISTED],
    });
    expect(where.event.OR).toEqual([
      { endDate: null },
      { endDate: { gt: expect.any(Date) } },
    ]);
  });

  it("logs and continues when one registration cannot be released", async () => {
    prisma.registration.findMany.mockResolvedValueOnce([
      { eventId: "event-1" },
      { eventId: "event-2" },
    ]);
    updateRegistration
      .mockRejectedValueOnce(new Error("Registration has closed"))
      .mockResolvedValueOnce(undefined as any);

    const warn = jest.spyOn(Logger.prototype, "warn");

    // must not reject — a stuck registration cannot block account deletion
    await expect(
      service.updateAllRegistrationsOfUserToNotGoing("user-1"),
    ).resolves.toBeUndefined();

    expect(updateRegistration).toHaveBeenCalledTimes(2);
    // the old empty catch swallowed this silently
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Registration has closed"),
    );
  });
});
