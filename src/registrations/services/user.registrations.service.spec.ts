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

describe("UserRegistrationService.create", () => {
  const prismaService = {
    $transaction: jest.fn(),
    event: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    eventInvitation: { findFirst: jest.fn() },
    registration: { create: jest.fn() },
  } as any;

  let service: UserRegistrationService;

  const anEvent = (visibility: EventVisibility) => ({
    id: "event-1",
    visibility,
    registrationMode: EventRegistrationMode.PEOPLY,
    capacity: null,
    registrations: [],
    endDate: null,
    regStart: null,
    regEnd: null,
    formQuestion: null,
    hasFood: false,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prismaService.$transaction.mockImplementation(
      (callback: (client: typeof prismaService) => unknown) =>
        callback(prismaService),
    );
    prismaService.user.findUnique.mockResolvedValue({ id: "user-1" });
    prismaService.registration.create.mockResolvedValue({ id: "reg-1" });
    service = new UserRegistrationService(prismaService, {} as any);
  });

  // canViewEvent treats a GOING registration as permission to read the event,
  // its updates and its attendee list - so creating one on an event you were
  // never invited to was how you got in.
  it("refuses to register for a private event without an invitation", async () => {
    prismaService.event.findUnique.mockResolvedValueOnce(
      anEvent(EventVisibility.PRIVATE),
    );
    prismaService.eventInvitation.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.create("user-1", {
        eventId: "event-1",
        regStatus: RegStatus.GOING,
      }),
    ).rejects.toBeInstanceOf(EventNotFoundException);

    expect(prismaService.registration.create).not.toHaveBeenCalled();
  });

  it("registers for a private event when an invitation exists", async () => {
    prismaService.event.findUnique.mockResolvedValueOnce(
      anEvent(EventVisibility.PRIVATE),
    );
    prismaService.eventInvitation.findFirst.mockResolvedValueOnce({
      id: "invite-1",
    });

    await service.create("user-1", {
      eventId: "event-1",
      regStatus: RegStatus.GOING,
    });

    expect(prismaService.registration.create).toHaveBeenCalled();
  });

  // Unlisted is link-shareable by design ("alle med lenken kan se
  // arrangementet"), so it must keep working without an invitation.
  it.each([EventVisibility.PUBLIC, EventVisibility.UNLISTED])(
    "registers for a %s event without an invitation",
    async (visibility) => {
      prismaService.event.findUnique.mockResolvedValueOnce(anEvent(visibility));

      await service.create("user-1", {
        eventId: "event-1",
        regStatus: RegStatus.GOING,
      });

      expect(prismaService.registration.create).toHaveBeenCalled();
      expect(prismaService.eventInvitation.findFirst).not.toHaveBeenCalled();
    },
  );
});
