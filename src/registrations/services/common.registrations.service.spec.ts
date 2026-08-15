import {
  EventRegistrationMode,
  RegStatus,
} from "../../generated/prisma/client";
import { Logger } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { CommonRegistrationService } from "./common.registrations.service";
import { ForeignKeyNotFoundException } from "../exceptions";

const notFound = () =>
  new Prisma.PrismaClientKnownRequestError("Record to update not found", {
    code: "P2025",
    clientVersion: Prisma.prismaVersion.client,
  });

describe("CommonRegistrationService.updateRegistration", () => {
  let prisma: any;
  let azure: any;
  let service: CommonRegistrationService;
  let calls: string[];

  /**
   * Builds an event whose registrations already contain `userId` as GOING and
   * one WAITLISTED user behind them, which is the branch that promotes.
   */
  const buildEvent = (overrides: Record<string, unknown> = {}) => ({
    id: "event-1",
    title: "Event",
    endDate: null,
    regStart: null,
    regEnd: null,
    capacity: 1,
    formQuestion: null,
    registrationMode: EventRegistrationMode.PEOPLY,
    registrations: [
      { eventId: "event-1", userId: "user-1", regStatus: RegStatus.GOING },
      { eventId: "event-1", userId: "user-2", regStatus: RegStatus.WAITLISTED },
    ],
    ...overrides,
  });

  const setup = (event: any) => {
    calls = [];
    const trx = {
      // The seat count is a read-modify-write, so both paths take a row lock on
      // the event first. Recorded in `calls` so the ordering can be asserted.
      $queryRaw: jest.fn(() => {
        calls.push("lock");
        return Promise.resolve([]);
      }),
      event: { findUnique: jest.fn().mockResolvedValue(event) },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user-2",
          email: "next@example.com",
          allowEmailFromArranger: true,
        }),
      },
      registration: {
        delete: jest.fn().mockImplementation(({ where }) => ({
          // biome-ignore lint/suspicious/noThenProperty: same reason as update below.
          then: (resolve: any, reject: any) => {
            calls.push(`delete:${where.eventId_userId.userId}`);
            return Promise.resolve({ ...where.eventId_userId }).then(
              resolve,
              reject,
            );
          },
        })),
        // Prisma returns a lazy PrismaPromise: the query does not run until
        // it is awaited. A mock that records on call instead of on await
        // cannot observe a missing `await` at all, so model the laziness.
        update: jest.fn().mockImplementation(({ where, data }) => ({
          // biome-ignore lint/suspicious/noThenProperty: the thenable is the point — it is what makes this mock behave like a PrismaPromise.
          then: (resolve: any, reject: any) => {
            calls.push(
              `update:${where.eventId_userId.userId}:${data.regStatus}`,
            );
            return Promise.resolve({ ...where.eventId_userId, ...data }).then(
              resolve,
              reject,
            );
          },
        })),
      },
    };

    prisma = { $transaction: jest.fn((cb: any) => cb(trx)) };
    azure = { send: jest.fn().mockResolvedValue(undefined) };
    service = new CommonRegistrationService(prisma, azure);
    return trx;
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  it("lets P2025 through for PrismaExceptionFilter to map", async () => {
    setup(buildEvent());
    prisma.$transaction.mockRejectedValue(notFound());

    // This used to be caught here and rethrown as RegistrationNotFoundException.
    // The mapping now lives in PrismaExceptionFilter, so the contract for this
    // service is that the Prisma error reaches it unchanged — still awaited,
    // so it surfaces as a rejection rather than escaping the call.
    await expect(
      service.updateRegistration("user-1", "event-1", RegStatus.NOT_GOING),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("rethrows errors that are not P2025", async () => {
    setup(buildEvent());
    prisma.$transaction.mockRejectedValue(new Error("connection lost"));

    await expect(
      service.updateRegistration("user-1", "event-1", RegStatus.NOT_GOING),
    ).rejects.toThrow("connection lost");
  });

  it("releases the seat before promoting from the waitlist", async () => {
    setup(buildEvent());

    await service.updateRegistration("user-1", "event-1", RegStatus.NOT_GOING);

    // The leaving user's row was updated without await, so it settled after
    // the promotion instead of before it.
    // "lock" first: the event row is held before the seat count is read, so a
    // concurrent removal cannot promote the same waitlisted user twice.
    expect(calls).toEqual([
      "lock",
      `update:user-1:${RegStatus.NOT_GOING}`,
      `update:user-2:${RegStatus.GOING}`,
    ]);
  });

  it("still promotes when the notification email fails", async () => {
    setup(buildEvent());
    azure.send.mockRejectedValue(new Error("smtp down"));
    const warn = jest.spyOn(Logger.prototype, "warn");

    await expect(
      service.updateRegistration("user-1", "event-1", RegStatus.NOT_GOING),
    ).resolves.toBeDefined();

    expect(calls).toContain(`update:user-2:${RegStatus.GOING}`);
    // The empty catch block discarded this reason entirely.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("smtp down"));
  });

  describe("registration window", () => {
    const closed = buildEvent({ regEnd: new Date("2000-01-01") });

    it("rejects a user-initiated change after registration closed", async () => {
      setup(closed);

      await expect(
        service.updateRegistration("user-1", "event-1", RegStatus.NOT_GOING),
      ).rejects.toThrow("Registration has closed");
    });

    it("releases the seat anyway when systemInitiated", async () => {
      setup(closed);

      await service.updateRegistration(
        "user-1",
        "event-1",
        RegStatus.NOT_GOING,
        undefined,
        { systemInitiated: true },
      );

      // Account deletion must free the spot even though registration closed.
      expect(calls).toEqual([
        "lock",
        `update:user-1:${RegStatus.NOT_GOING}`,
        `update:user-2:${RegStatus.GOING}`,
      ]);
    });

    it("releases the seat on an event that is not registered via Peoply", async () => {
      setup(buildEvent({ registrationMode: EventRegistrationMode.EXTERNAL }));

      await service.updateRegistration(
        "user-1",
        "event-1",
        RegStatus.NOT_GOING,
        undefined,
        { systemInitiated: true },
      );

      expect(calls).toContain(`update:user-1:${RegStatus.NOT_GOING}`);
    });

    it.each([
      ["Event has ended", { endDate: new Date("2000-01-01") }],
      ["Registration has not opened yet", { regStart: new Date("2999-01-01") }],
      [
        "Registration for this event does not happen in Peoply",
        { registrationMode: EventRegistrationMode.EXTERNAL },
      ],
    ])(
      "rejects a user-initiated change with %s",
      async (message, overrides) => {
        setup(buildEvent(overrides));

        await expect(
          service.updateRegistration("user-1", "event-1", RegStatus.NOT_GOING),
        ).rejects.toThrow(message);
      },
    );
  });

  /* The branch that takes a seat rather than releasing one. It reads
     `going.length < capacity` under the same lock, so it is the other half of
     what the lock exists for. */
  describe("taking a seat", () => {
    const joiningEvent = (overrides: Record<string, unknown> = {}) =>
      buildEvent({
        capacity: 2,
        registrations: [
          { eventId: "event-1", userId: "user-1", regStatus: RegStatus.GOING },
          {
            eventId: "event-1",
            userId: "user-3",
            regStatus: RegStatus.NOT_GOING,
          },
        ],
        ...overrides,
      });

    it("goes straight to GOING when there is room", async () => {
      setup(joiningEvent());

      await service.updateRegistration("user-3", "event-1", RegStatus.GOING);

      expect(calls).toEqual(["lock", `update:user-3:${RegStatus.GOING}`]);
    });

    it("goes to GOING on an event with no capacity limit", async () => {
      setup(joiningEvent({ capacity: null }));

      await service.updateRegistration("user-3", "event-1", RegStatus.GOING);

      expect(calls).toContain(`update:user-3:${RegStatus.GOING}`);
    });

    it("goes to WAITLISTED when the seats are taken", async () => {
      setup(joiningEvent({ capacity: 1 }));

      await service.updateRegistration("user-3", "event-1", RegStatus.GOING);

      expect(calls).toEqual(["lock", `update:user-3:${RegStatus.WAITLISTED}`]);
    });

    it("lets an invited user accept", async () => {
      setup(
        joiningEvent({
          registrations: [
            {
              eventId: "event-1",
              userId: "user-3",
              regStatus: RegStatus.INVITED,
            },
          ],
        }),
      );

      await service.updateRegistration("user-3", "event-1", RegStatus.GOING);

      expect(calls).toContain(`update:user-3:${RegStatus.GOING}`);
    });

    it("refuses to take a seat without answering the event's question", async () => {
      setup(joiningEvent({ formQuestion: "Allergier?" }));

      await expect(
        service.updateRegistration("user-3", "event-1", RegStatus.GOING),
      ).rejects.toThrow("Form answer is required for this event");

      expect(calls).toEqual(["lock"]);
    });

    it("keeps the form answer when the seat is taken", async () => {
      const trx = setup(joiningEvent({ formQuestion: "Allergier?" }));

      await service.updateRegistration(
        "user-3",
        "event-1",
        RegStatus.GOING,
        "ingen",
      );

      expect(trx.registration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { regStatus: RegStatus.GOING, formAnswer: "ingen" },
        }),
      );
    });

    // The answer belongs to the seat, so it must not outlive it.
    it("clears the form answer when the seat is released", async () => {
      const trx = setup(buildEvent());

      await service.updateRegistration(
        "user-1",
        "event-1",
        RegStatus.NOT_GOING,
      );

      expect(trx.registration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { regStatus: RegStatus.NOT_GOING, formAnswer: null },
        }),
      );
    });
  });

  describe("leaving the waitlist", () => {
    it("takes a waitlisted user off without promoting anyone", async () => {
      setup(
        buildEvent({
          registrations: [
            {
              eventId: "event-1",
              userId: "user-1",
              regStatus: RegStatus.GOING,
            },
            {
              eventId: "event-1",
              userId: "user-2",
              regStatus: RegStatus.WAITLISTED,
            },
          ],
        }),
      );

      await service.updateRegistration(
        "user-2",
        "event-1",
        RegStatus.NOT_GOING,
      );

      // Nobody was holding a seat, so nothing frees up.
      expect(calls).toEqual(["lock", `update:user-2:${RegStatus.NOT_GOING}`]);
    });
  });

  describe("banning", () => {
    it("frees the seat and promotes when an attendee is banned", async () => {
      setup(buildEvent());

      await service.updateRegistration("user-1", "event-1", RegStatus.BANNED);

      expect(calls).toEqual([
        "lock",
        `update:user-1:${RegStatus.BANNED}`,
        `update:user-2:${RegStatus.GOING}`,
      ]);
    });
  });

  describe("registrations that are not there", () => {
    it("raises ForeignKeyNotFound when the user has no registration", async () => {
      setup(buildEvent());

      await expect(
        service.updateRegistration("nobody", "event-1", RegStatus.GOING),
      ).rejects.toThrow(ForeignKeyNotFoundException);
    });

    it("raises ForeignKeyNotFound when the event does not exist", async () => {
      const trx = setup(buildEvent());
      trx.event.findUnique.mockResolvedValue(null);

      await expect(
        service.updateRegistration("user-1", "event-1", RegStatus.GOING),
      ).rejects.toThrow(ForeignKeyNotFoundException);
    });
  });

  it("does not email a promoted user who opted out", async () => {
    const trx = setup(buildEvent());
    trx.user.findUnique.mockResolvedValue({
      id: "user-2",
      email: "next@example.com",
      allowEmailFromArranger: false,
    });

    await service.updateRegistration("user-1", "event-1", RegStatus.NOT_GOING);

    expect(calls).toContain(`update:user-2:${RegStatus.GOING}`);
    expect(azure.send).not.toHaveBeenCalled();
  });

  it("emails the promoted user when they allow it", async () => {
    setup(buildEvent());

    await service.updateRegistration("user-1", "event-1", RegStatus.NOT_GOING);

    expect(azure.send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: { to: [{ email: "next@example.com" }] },
      }),
    );
  });
});

describe("CommonRegistrationService.remove", () => {
  let prisma: any;
  let service: CommonRegistrationService;
  let calls: string[];

  const buildEvent = (overrides: Record<string, unknown> = {}) => ({
    id: "event-1",
    title: "Event",
    regStart: null,
    regEnd: null,
    registrations: [
      { eventId: "event-1", userId: "user-1", regStatus: RegStatus.GOING },
      { eventId: "event-1", userId: "user-2", regStatus: RegStatus.WAITLISTED },
    ],
    ...overrides,
  });

  const setup = (event: any) => {
    calls = [];
    const trx = {
      $queryRaw: jest.fn(() => {
        calls.push("lock");
        return Promise.resolve([]);
      }),
      event: { findUnique: jest.fn().mockResolvedValue(event) },
      registration: {
        delete: jest.fn().mockImplementation(({ where }) => {
          calls.push(`delete:${where.eventId_userId.userId}`);
          return Promise.resolve({ ...where.eventId_userId });
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          calls.push(`update:${where.eventId_userId.userId}:${data.regStatus}`);
          return Promise.resolve({ ...where.eventId_userId, ...data });
        }),
      },
    };

    prisma = { $transaction: jest.fn((cb: any) => cb(trx)) };
    service = new CommonRegistrationService(prisma, {} as any);
    return trx;
  };

  it("takes the lock before reading the seat count", async () => {
    setup(buildEvent());

    await service.remove("event-1", "user-1");

    // Two concurrent removals used to read the same waitlisted[0] and both
    // promote that one person: two seats freed, one filled.
    expect(calls).toEqual([
      "lock",
      "delete:user-1",
      `update:user-2:${RegStatus.GOING}`,
    ]);
  });

  it("promotes nobody when the leaver was not holding a seat", async () => {
    setup(
      buildEvent({
        registrations: [
          {
            eventId: "event-1",
            userId: "user-1",
            regStatus: RegStatus.WAITLISTED,
          },
          {
            eventId: "event-1",
            userId: "user-2",
            regStatus: RegStatus.WAITLISTED,
          },
        ],
      }),
    );

    await service.remove("event-1", "user-1");

    expect(calls).toEqual(["lock", "delete:user-1"]);
  });

  it("promotes nobody when the waitlist is empty", async () => {
    setup(
      buildEvent({
        registrations: [
          { eventId: "event-1", userId: "user-1", regStatus: RegStatus.GOING },
        ],
      }),
    );

    await service.remove("event-1", "user-1");

    expect(calls).toEqual(["lock", "delete:user-1"]);
  });

  it.each([
    ["Registration is not open yet", { regStart: new Date("2999-01-01") }],
    ["Registration closed", { regEnd: new Date("2000-01-01") }],
  ])("refuses with %s", async (message, overrides) => {
    setup(buildEvent(overrides));

    await expect(service.remove("event-1", "user-1")).rejects.toThrow(message);
  });

  it("raises ForeignKeyNotFound when there is no such registration", async () => {
    setup(buildEvent());

    await expect(service.remove("event-1", "nobody")).rejects.toThrow(
      ForeignKeyNotFoundException,
    );
  });
});
