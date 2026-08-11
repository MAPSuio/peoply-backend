import {
  EventRegistrationMode,
  RegStatus,
} from "../../generated/prisma/client";
import { Logger } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { CommonRegistrationService } from "./common.registrations.service";

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
  });
});
