import {
  EventRegistrationMode,
  EventVisibility,
  RegStatus,
} from "../../generated/prisma/client";
import { EventNotFoundException } from "../../events/exceptions";
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

    // systemInitiated: the account is being deleted, so a closed registration
    // window must not strand the seat.
    expect(updateRegistration).toHaveBeenCalledWith(
      "user-1",
      "event-1",
      RegStatus.NOT_GOING,
      undefined,
      { systemInitiated: true },
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

describe("UserRegistrationService.create visibility gate", () => {
  const EVENT_ID = "event-1";
  const USER_ID = "user-1";

  const buildPrisma = (
    visibility: EventVisibility,
    { isDirectArranger = 0, isOrganizationAdmin = 0 } = {},
  ) => {
    const trx = {
      event: {
        findUnique: jest.fn().mockResolvedValue({
          id: EVENT_ID,
          visibility,
          endDate: null,
          regStart: null,
          regEnd: null,
          capacity: null,
          hasFood: false,
          formQuestion: null,
          registrationMode: EventRegistrationMode.PEOPLY,
          registrations: [],
        }),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: USER_ID, arrangerId: "arranger-1" }),
      },
      eventArranger: { count: jest.fn().mockResolvedValue(isDirectArranger) },
      userOrganizationRole: {
        count: jest.fn().mockResolvedValue(isOrganizationAdmin),
      },
      registration: {
        create: jest.fn().mockResolvedValue({ eventId: EVENT_ID }),
      },
    };

    return {
      trx,
      prisma: { $transaction: jest.fn((cb: any) => cb(trx)) } as any,
    };
  };

  const register = (prisma: any) =>
    new UserRegistrationService(prisma, {} as any).create(USER_ID, {
      eventId: EVENT_ID,
      regStatus: RegStatus.GOING,
    } as any);

  it.each([EventVisibility.PRIVATE, EventVisibility.UNLISTED])(
    "refuses to let an uninvited user register for a %s event",
    async (visibility) => {
      const { prisma, trx } = buildPrisma(visibility);

      /* Same 404 the event itself answers with, so the response does not
         confirm that an event with this id exists. */
      await expect(register(prisma)).rejects.toBeInstanceOf(
        EventNotFoundException,
      );
      expect(trx.registration.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["a direct arranger", { isDirectArranger: 1 }],
    ["an admin of an arranging organization", { isOrganizationAdmin: 1 }],
  ])("still lets %s register for a hidden event", async (_label, roles) => {
    const { prisma, trx } = buildPrisma(EventVisibility.PRIVATE, roles);

    await register(prisma);

    expect(trx.registration.create).toHaveBeenCalled();
  });

  it("does not gate public events", async () => {
    const { prisma, trx } = buildPrisma(EventVisibility.PUBLIC);

    await register(prisma);

    /* No arranger lookup at all - the common path must not pay for it. */
    expect(trx.eventArranger.count).not.toHaveBeenCalled();
    expect(trx.registration.create).toHaveBeenCalled();
  });
});
