import { InvitationStatus, RegStatus } from "../../generated/prisma/client";
import { EventInvitationsService } from "./eventInvitations.service";

const EVENT_ID = "event-1";
const SENDER_ID = "arranger-1";

const anOpenEvent = (overrides: Record<string, unknown> = {}) => ({
  id: EVENT_ID,
  endDate: new Date("2099-01-01"),
  regStart: null,
  regEnd: null,
  registrationMode: "PEOPLY",
  hasFood: false,
  ...overrides,
});

const registeredAs = (userId: string, regStatus: RegStatus) => ({
  eventId: EVENT_ID,
  userId,
  regStatus,
});

describe("EventInvitationsService.createInvitations and the registrations it writes", () => {
  let service: EventInvitationsService;
  let trx: any;

  const setup = (existingRegistrations: unknown[]) => {
    trx = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ arrangerId: "arranger" }),
      },
      event: { findUnique: jest.fn().mockResolvedValue(anOpenEvent()) },
      eventArranger: { count: jest.fn().mockResolvedValue(1) },
      userOrganizationRole: { count: jest.fn().mockResolvedValue(0) },
      registration: {
        findMany: jest.fn().mockResolvedValue(existingRegistrations),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      eventInvitation: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const prisma = { $transaction: jest.fn((callback: any) => callback(trx)) };
    service = new EventInvitationsService(
      prisma as any,
      { update: jest.fn() } as any,
    );
  };

  const invite = (...toUserIds: string[]) =>
    service.createInvitations(EVENT_ID, SENDER_ID, toUserIds);

  it("gives every unregistered invitee an INVITED registration", async () => {
    setup([]);

    await invite("user-1", "user-2");

    expect(trx.registration.createMany).toHaveBeenCalledWith({
      data: [
        registeredAs("user-1", RegStatus.INVITED),
        registeredAs("user-2", RegStatus.INVITED),
      ],
    });
  });

  it("leaves an existing registration as it is", async () => {
    setup([registeredAs("user-1", RegStatus.WAITLISTED)]);

    await invite("user-1", "user-2");

    expect(trx.registration.createMany).toHaveBeenCalledWith({
      data: [registeredAs("user-2", RegStatus.INVITED)],
    });
  });

  it.each([RegStatus.GOING, RegStatus.WAITLISTED])(
    "counts an invitation to someone already %s as accepted",
    async (regStatus) => {
      setup([registeredAs("user-1", regStatus)]);

      await invite("user-1");

      const [{ data }] = trx.eventInvitation.createMany.mock.calls[0];
      expect(data[0].invitationStatus).toBe(InvitationStatus.ACCEPTED);
    },
  );

  it.each([RegStatus.INVITED, RegStatus.NOT_GOING, RegStatus.BANNED])(
    "leaves an invitation to someone who is %s pending",
    async (regStatus) => {
      setup([registeredAs("user-1", regStatus)]);

      await invite("user-1");

      const [{ data }] = trx.eventInvitation.createMany.mock.calls[0];
      expect(data[0].invitationStatus).toBe(InvitationStatus.PENDING);
    },
  );

  it("reads every registration the invitees already hold", async () => {
    setup([]);

    await invite("user-1", "user-2");

    const [args] = trx.registration.findMany.mock.calls[0];
    expect(args.where).toEqual({
      eventId: EVENT_ID,
      userId: { in: ["user-1", "user-2"] },
    });
  });

  it("registers nobody when the event has ended", async () => {
    setup([]);
    trx.event.findUnique.mockResolvedValue(
      anOpenEvent({ endDate: new Date("2000-01-01") }),
    );

    await expect(invite("user-1")).rejects.toThrow("Event has ended");
    expect(trx.registration.createMany).not.toHaveBeenCalled();
  });

  it("registers nobody when the inviter arranges nothing", async () => {
    setup([]);
    trx.eventArranger.count.mockResolvedValue(0);

    await expect(invite("user-1")).rejects.toThrow(
      "User is not allowed to invite users to this event",
    );
    expect(trx.registration.createMany).not.toHaveBeenCalled();
  });
});

describe("EventInvitationsService.declineInvitationsToEvent", () => {
  let service: EventInvitationsService;
  let trx: any;

  const setup = (event: unknown = anOpenEvent()) => {
    trx = {
      event: { findUnique: jest.fn().mockResolvedValue(event) },
      eventInvitation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      registration: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };

    const prisma = { $transaction: jest.fn((callback: any) => callback(trx)) };
    service = new EventInvitationsService(
      prisma as any,
      { update: jest.fn() } as any,
    );
  };

  it("clears only a registration still sitting at INVITED", async () => {
    setup();

    await service.declineInvitationsToEvent(EVENT_ID, "user-1");

    expect(trx.registration.updateMany).toHaveBeenCalledWith({
      where: {
        eventId: EVENT_ID,
        userId: "user-1",
        regStatus: RegStatus.INVITED,
      },
      data: { regStatus: RegStatus.NOT_GOING },
    });
  });

  it("marks the invitation declined rather than deleting it", async () => {
    setup();

    await service.declineInvitationsToEvent(EVENT_ID, "user-1");

    expect(trx.eventInvitation.updateMany).toHaveBeenCalledWith({
      where: {
        eventId: EVENT_ID,
        toUserId: "user-1",
        invitationStatus: InvitationStatus.PENDING,
      },
      data: { invitationStatus: InvitationStatus.DECLINED },
    });
  });

  it("lets an invitee decline an event that registers elsewhere", async () => {
    setup(anOpenEvent({ registrationMode: "EXTERNAL" }));

    await service.declineInvitationsToEvent(EVENT_ID, "user-1");

    expect(trx.registration.updateMany).toHaveBeenCalled();
  });

  it("refuses to decline once registration has closed", async () => {
    setup(anOpenEvent({ regEnd: new Date("2000-01-01") }));

    await expect(
      service.declineInvitationsToEvent(EVENT_ID, "user-1"),
    ).rejects.toThrow("Registration has closed");
    expect(trx.registration.updateMany).not.toHaveBeenCalled();
  });
});

describe("EventInvitationsService.acceptInvitationsToEvent on an event that serves food", () => {
  let service: EventInvitationsService;
  let trx: any;
  let userRegistrations: { update: jest.Mock };

  const setup = (user: unknown) => {
    trx = {
      event: {
        findUnique: jest.fn().mockResolvedValue(anOpenEvent({ hasFood: true })),
      },
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      eventInvitation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    userRegistrations = { update: jest.fn() };
    const prisma = { $transaction: jest.fn((callback: any) => callback(trx)) };
    service = new EventInvitationsService(
      prisma as any,
      userRegistrations as any,
    );
  };

  it("refuses the seat until the invitee has stated a food preference", async () => {
    setup({ id: "user-1", foodPreference: null });

    await expect(
      service.acceptInvitationsToEvent(EVENT_ID, "user-1"),
    ).rejects.toThrow("User has not set food preference");
    expect(trx.eventInvitation.updateMany).not.toHaveBeenCalled();
    expect(userRegistrations.update).not.toHaveBeenCalled();
  });

  it("takes the seat once the invitee has stated one", async () => {
    setup({ id: "user-1", foodPreference: "VEGAN" });

    await service.acceptInvitationsToEvent(EVENT_ID, "user-1", "ingen");

    expect(userRegistrations.update).toHaveBeenCalledWith("user-1", {
      eventId: EVENT_ID,
      regStatus: RegStatus.GOING,
      formAnswer: "ingen",
    });
  });
});
