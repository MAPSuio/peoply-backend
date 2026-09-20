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

const promotedUsersIn = (update: jest.Mock) =>
  update.mock.calls
    .filter(([{ data }]) => data.regStatus === RegStatus.GOING)
    .map(([{ where }]) => where.eventId_userId.userId);

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

  const prismaService = {
    $transaction: jest.fn((callback: any) => callback(trx)),
  };
  const send = jest.fn().mockResolvedValue(undefined);

  return {
    service: new CommonRegistrationService(
      prismaService as any,
      {
        send,
      } as any,
    ),
    trx,
    send,
  };
}

describe("CommonRegistrationService promotes the person who has waited longest", () => {
  const aQueueOf = (...waitingUserIds: string[]) =>
    anEventWhere([
      holds(USER_ID, RegStatus.GOING),
      ...waitingUserIds.map((userId) => holds(userId, RegStatus.WAITLISTED)),
    ]);

  it("gives the freed seat to the head of the queue and nobody else", async () => {
    const { service, trx } = setupTransaction(
      aQueueOf("user-2", "user-3", "user-4"),
      { id: "user-2", email: "next@example.no", allowEmailFromArranger: false },
    );

    await service.updateRegistration(USER_ID, EVENT_ID, RegStatus.NOT_GOING);

    expect(promotedUsersIn(trx.registration.update)).toEqual(["user-2"]);
  });

  it("tells the head of the queue, not the person behind them", async () => {
    const { service, send } = setupTransaction(aQueueOf("user-2", "user-3"), {
      id: "user-2",
      email: "next@example.no",
      allowEmailFromArranger: true,
    });

    await service.updateRegistration(USER_ID, EVENT_ID, RegStatus.NOT_GOING);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].recipients).toEqual({
      to: [{ address: "next@example.no" }],
    });
  });

  it("reads the registrations in the order people joined the queue", async () => {
    const { service, trx } = setupTransaction(aQueueOf("user-2"));

    await service.updateRegistration(USER_ID, EVENT_ID, RegStatus.NOT_GOING);

    const [{ include }] = trx.event.findUnique.mock.calls[0];
    expect(include.registrations.orderBy).toEqual({ updatedAt: "asc" });
  });

  it("promotes only from the waitlist, never from the people who left or were banned", async () => {
    const { service, trx, send } = setupTransaction(
      anEventWhere([
        holds(USER_ID, RegStatus.GOING),
        holds("user-2", RegStatus.BANNED),
        holds("user-3", RegStatus.NOT_GOING),
        holds("user-4", RegStatus.INVITED),
      ]),
    );

    await service.updateRegistration(USER_ID, EVENT_ID, RegStatus.NOT_GOING);

    expect(promotedUsersIn(trx.registration.update)).toEqual([]);
    expect(trx.registration.update).toHaveBeenCalledTimes(1);
    expect(trx.user.findUnique).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("promotes without mailing when the promoted user row is gone", async () => {
    const { service, trx, send } = setupTransaction(aQueueOf("user-2"), null);

    await service.updateRegistration(USER_ID, EVENT_ID, RegStatus.NOT_GOING);

    expect(promotedUsersIn(trx.registration.update)).toEqual(["user-2"]);
    expect(send).not.toHaveBeenCalled();
  });

  it("logs a rejection that is not an Error without losing it", async () => {
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const { service, send } = setupTransaction(aQueueOf("user-2"), {
      id: "user-2",
      email: "next@example.no",
      allowEmailFromArranger: true,
    });
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

  it("does nothing when an arranger bans someone off the waitlist, the gap in issue 262", async () => {
    const { service, trx, send } = setupHoldingStatus(RegStatus.WAITLISTED);

    await expect(
      service.updateRegistration(USER_ID, EVENT_ID, RegStatus.BANNED),
    ).resolves.toBeUndefined();

    expect(trx.registration.update).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing when an invited user declines on this route, the gap in issue 263", async () => {
    const { service, trx } = setupHoldingStatus(RegStatus.INVITED);

    await expect(
      service.updateRegistration(USER_ID, EVENT_ID, RegStatus.NOT_GOING),
    ).resolves.toBeUndefined();

    expect(trx.registration.update).not.toHaveBeenCalled();
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
