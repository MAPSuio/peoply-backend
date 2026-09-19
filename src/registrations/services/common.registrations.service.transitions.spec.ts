import { Logger } from "@nestjs/common";
import {
  EventRegistrationMode,
  RegStatus,
} from "../../generated/prisma/client";
import { CommonRegistrationService } from "./common.registrations.service";
import { ForeignKeyNotFoundException } from "../exceptions";

const EVENT_ID = "event-1";
const USER_ID = "user-1";

const anEventWhere = (registrations: unknown[]) => ({
  id: EVENT_ID,
  title: "Event",
  endDate: null,
  regStart: null,
  regEnd: null,
  capacity: 10,
  formQuestion: null,
  registrationMode: EventRegistrationMode.PEOPLY,
  registrations,
});

const holds = (userId: string, regStatus: RegStatus) => ({
  eventId: EVENT_ID,
  userId,
  regStatus,
});

function setupTransaction(event: unknown, promotedUser: unknown = null) {
  const trx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    event: { findUnique: jest.fn().mockResolvedValue(event) },
    user: { findUnique: jest.fn().mockResolvedValue(promotedUser) },
    registration: {
      update: jest
        .fn()
        .mockImplementation(({ where, data }) =>
          Promise.resolve({ ...where.eventId_userId, ...data }),
        ),
      delete: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve({ ...where.eventId_userId }),
        ),
    },
  };

  const prisma = { $transaction: jest.fn((callback: any) => callback(trx)) };
  const send = jest.fn().mockResolvedValue(undefined);

  return {
    service: new CommonRegistrationService(prisma as any, { send } as any),
    trx,
    send,
  };
}

describe("CommonRegistrationService.updateRegistration transitions that write nothing", () => {
  const setupHoldingStatus = (currentStatus: RegStatus) =>
    setupTransaction(
      anEventWhere([
        holds(USER_ID, currentStatus),
        holds("user-2", RegStatus.WAITLISTED),
      ]),
    );

  it.each([
    [RegStatus.GOING, RegStatus.GOING],
    [RegStatus.WAITLISTED, RegStatus.GOING],
    [RegStatus.WAITLISTED, RegStatus.BANNED],
    [RegStatus.INVITED, RegStatus.NOT_GOING],
    [RegStatus.NOT_GOING, RegStatus.WAITLISTED],
    [RegStatus.BANNED, RegStatus.GOING],
  ])(
    "leaves a %s registration untouched when asked for %s",
    async (currentStatus, requestedStatus) => {
      const { service, trx, send } = setupHoldingStatus(currentStatus);

      await expect(
        service.updateRegistration(USER_ID, EVENT_ID, requestedStatus),
      ).resolves.toBeUndefined();

      expect(trx.registration.update).not.toHaveBeenCalled();
      expect(trx.registration.delete).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );
});

describe("CommonRegistrationService promotion when there is nobody to promote", () => {
  it("frees the seat and mails nobody when the waitlist is empty", async () => {
    const { service, trx, send } = setupTransaction(
      anEventWhere([holds(USER_ID, RegStatus.GOING)]),
    );

    await service.updateRegistration(USER_ID, EVENT_ID, RegStatus.NOT_GOING);

    expect(trx.registration.update).toHaveBeenCalledTimes(1);
    expect(trx.user.findUnique).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("promotes without mailing when the promoted user row is gone", async () => {
    const { service, trx, send } = setupTransaction(
      anEventWhere([
        holds(USER_ID, RegStatus.GOING),
        holds("user-2", RegStatus.WAITLISTED),
      ]),
      null,
    );

    await service.updateRegistration(USER_ID, EVENT_ID, RegStatus.NOT_GOING);

    expect(trx.registration.update).toHaveBeenCalledWith({
      where: { eventId_userId: { eventId: EVENT_ID, userId: "user-2" } },
      data: { regStatus: RegStatus.GOING },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("logs a rejection that is not an Error without losing it", async () => {
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const { service, send } = setupTransaction(
      anEventWhere([
        holds(USER_ID, RegStatus.GOING),
        holds("user-2", RegStatus.WAITLISTED),
      ]),
      { id: "user-2", email: "next@example.no", allowEmailFromArranger: true },
    );
    send.mockRejectedValue("mail service refused the message");

    await expect(
      service.updateRegistration(USER_ID, EVENT_ID, RegStatus.NOT_GOING),
    ).resolves.toBeDefined();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("mail service refused the message"),
    );
    warn.mockRestore();
  });
});

describe("CommonRegistrationService.remove on an event that is gone", () => {
  it("raises ForeignKeyNotFound rather than reading the window off nothing", async () => {
    const { service, trx } = setupTransaction(null);

    await expect(service.remove(EVENT_ID, USER_ID)).rejects.toBeInstanceOf(
      ForeignKeyNotFoundException,
    );
    expect(trx.registration.delete).not.toHaveBeenCalled();
  });
});
