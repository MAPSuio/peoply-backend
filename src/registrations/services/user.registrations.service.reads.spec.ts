import { EventVisibility, RegStatus } from "../../generated/prisma/client";
import { DEFAULT_SEARCH_PAGE_SIZE } from "../../util/pagination";
import { UserRegistrationService } from "./user.registrations.service";

const EVENT_ID = "event-1";
const USER_ID = "user-1";

const aRegistrationWithEvent = (regStatus: RegStatus) => ({
  eventId: EVENT_ID,
  userId: USER_ID,
  regStatus,
  event: { id: EVENT_ID, visibility: EventVisibility.PRIVATE },
});

describe("UserRegistrationService.findAll", () => {
  let service: UserRegistrationService;
  let prisma: any;
  let eventAccess: any;

  const setup = (registrations: unknown[]) => {
    prisma = {
      registration: { findMany: jest.fn().mockResolvedValue(registrations) },
    };
    eventAccess = {
      registrationGrantsEventAccess: jest.fn().mockReturnValue(true),
      viewableEventIds: jest.fn().mockResolvedValue(new Set<string>()),
    };

    service = new UserRegistrationService(prisma, {} as any, eventAccess);
  };

  it("reads the page the caller asked for, from their own rows only", async () => {
    setup([]);

    await service.findAll(
      {
        skip: 5,
        take: 20,
        orderBy: "createdAt",
        orderDirection: "desc",
        regStatus: RegStatus.GOING,
      } as any,
      USER_ID,
    );

    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 20,
        where: { userId: USER_ID, regStatus: RegStatus.GOING },
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("falls back to the first page in waitlist order", async () => {
    setup([]);

    await service.findAll({} as any, USER_ID);

    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: DEFAULT_SEARCH_PAGE_SIZE,
        orderBy: { updatedAt: "asc" },
      }),
    );
  });

  it("leaves the rows alone when every registration still grants access", async () => {
    setup([aRegistrationWithEvent(RegStatus.GOING)]);

    const [registration] = (await service.findAll({} as any, USER_ID)) as any[];

    expect(registration.event).toBeDefined();
    expect(eventAccess.viewableEventIds).not.toHaveBeenCalled();
  });

  it("drops the event from a registration that no longer grants access", async () => {
    setup([aRegistrationWithEvent(RegStatus.BANNED)]);
    eventAccess.registrationGrantsEventAccess.mockReturnValue(false);

    const [registration] = (await service.findAll({} as any, USER_ID)) as any[];

    expect(registration.event).toBeUndefined();
    expect(registration.regStatus).toBe(RegStatus.BANNED);
  });

  it("keeps the event when the caller arranges it themselves", async () => {
    setup([aRegistrationWithEvent(RegStatus.BANNED)]);
    eventAccess.registrationGrantsEventAccess.mockReturnValue(false);
    eventAccess.viewableEventIds.mockResolvedValue(new Set([EVENT_ID]));

    const [registration] = (await service.findAll({} as any, USER_ID)) as any[];

    expect(registration.event).toBeDefined();
    expect(eventAccess.viewableEventIds).toHaveBeenCalledWith(USER_ID, [
      EVENT_ID,
    ]);
  });

  it("asks nothing of the access service when no event rode along", async () => {
    setup([
      { eventId: EVENT_ID, userId: USER_ID, regStatus: RegStatus.BANNED },
    ]);

    await service.findAll({} as any, USER_ID);

    expect(eventAccess.registrationGrantsEventAccess).not.toHaveBeenCalled();
    expect(eventAccess.viewableEventIds).not.toHaveBeenCalled();
  });
});

describe("UserRegistrationService.getPositionInWaitlist", () => {
  let service: UserRegistrationService;
  let prisma: any;

  const waitlist = ["user-9", USER_ID, "user-3"].map((userId) => ({
    eventId: EVENT_ID,
    userId,
    regStatus: RegStatus.WAITLISTED,
  }));

  const setup = (registrations: unknown[]) => {
    prisma = {
      registration: { findMany: jest.fn().mockResolvedValue(registrations) },
    };
    service = new UserRegistrationService(prisma, {} as any, {} as any);
  };

  it("counts the queue from one, in the order people joined it", async () => {
    setup(waitlist);

    await expect(
      service.getPositionInWaitlist(EVENT_ID, USER_ID),
    ).resolves.toBe(2);
  });

  it("answers zero for a user who is not on the waitlist", async () => {
    setup(waitlist);

    await expect(
      service.getPositionInWaitlist(EVENT_ID, "stranger"),
    ).resolves.toBe(0);
  });

  it("reads the whole waitlist, oldest wait first", async () => {
    setup(waitlist);

    await service.getPositionInWaitlist(EVENT_ID, USER_ID);

    const [args] = prisma.registration.findMany.mock.calls[0];
    expect(args.where).toEqual({
      eventId: EVENT_ID,
      regStatus: RegStatus.WAITLISTED,
    });
    expect(args.orderBy).toEqual({ updatedAt: "asc" });
    expect(args.take).toBeUndefined();
  });
});
