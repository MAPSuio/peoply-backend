import {
  EventRegistrationMode,
  EventVisibility,
  FoodPreference,
  RegStatus,
} from "../../generated/prisma/client";
import { EventNotFoundException } from "../../events/exceptions";
import { CommonRegistrationService } from "./common.registrations.service";
import { UserRegistrationService } from "./user.registrations.service";

const EVENT_ID = "event-1";
const USER_ID = "user-1";

const anOpenEvent = (overrides: Record<string, unknown> = {}) => ({
  id: EVENT_ID,
  visibility: EventVisibility.PUBLIC,
  registrationMode: EventRegistrationMode.PEOPLY,
  capacity: null,
  registrations: [],
  endDate: null,
  regStart: null,
  regEnd: null,
  formQuestion: null,
  hasFood: false,
  ...overrides,
});

const aGoingRegistration = (userId: string) => ({
  eventId: EVENT_ID,
  userId,
  regStatus: RegStatus.GOING,
});

describe("UserRegistrationService.create", () => {
  let service: UserRegistrationService;
  let prisma: any;
  let calls: string[];

  const setup = (
    event: unknown,
    user: unknown = { id: USER_ID, foodPreference: null },
  ) => {
    calls = [];
    prisma = {
      $queryRaw: jest.fn(() => {
        calls.push("lock");
        return Promise.resolve([]);
      }),
      event: {
        findUnique: jest.fn(() => {
          calls.push("read-event");
          return Promise.resolve(event);
        }),
      },
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      registration: {
        create: jest.fn(({ data }) => {
          calls.push(`create:${data.regStatus}`);
          return Promise.resolve({ id: "registration-1", ...data });
        }),
      },
      $transaction: jest.fn((callback: any) => callback(prisma)),
    };

    service = new UserRegistrationService(prisma, {} as any, {} as any);
    return prisma;
  };

  const register = (dto: Record<string, unknown>) =>
    service.create(USER_ID, { eventId: EVENT_ID, ...dto } as any);

  it("holds the event row before it reads the seat count", async () => {
    setup(anOpenEvent());

    await register({ regStatus: RegStatus.GOING });

    expect(calls).toEqual(["lock", "read-event", `create:${RegStatus.GOING}`]);
  });

  it("gives out a seat while the event has room", async () => {
    setup(
      anOpenEvent({
        capacity: 2,
        registrations: [aGoingRegistration("other")],
      }),
    );

    await register({ regStatus: RegStatus.GOING });

    expect(prisma.registration.create).toHaveBeenCalledWith({
      data: {
        eventId: EVENT_ID,
        regStatus: RegStatus.GOING,
        userId: USER_ID,
      },
    });
  });

  it("gives out a seat on an event with no capacity limit", async () => {
    setup(anOpenEvent({ capacity: null }));

    await register({ regStatus: RegStatus.GOING });

    expect(calls).toContain(`create:${RegStatus.GOING}`);
  });

  it("waitlists the registration once every seat is taken", async () => {
    setup(
      anOpenEvent({
        capacity: 1,
        registrations: [aGoingRegistration("other")],
      }),
    );

    await register({ regStatus: RegStatus.GOING, formAnswer: "ingen" });

    expect(prisma.registration.create).toHaveBeenCalledWith({
      data: {
        eventId: EVENT_ID,
        userId: USER_ID,
        regStatus: RegStatus.WAITLISTED,
        formAnswer: "ingen",
      },
    });
  });

  it("counts only the seats that are held, not the waitlist behind them", async () => {
    setup(
      anOpenEvent({
        capacity: 2,
        registrations: [aGoingRegistration("other")],
      }),
    );

    await register({ regStatus: RegStatus.GOING });

    const { include } = prisma.event.findUnique.mock.calls[0][0];
    expect(include.registrations.where).toEqual({
      regStatus: RegStatus.GOING,
    });
  });

  it("refuses a registration that leaves the event's question unanswered", async () => {
    setup(anOpenEvent({ formQuestion: "Allergier?" }));

    await expect(register({ regStatus: RegStatus.GOING })).rejects.toThrow(
      "Form answer is required",
    );
    expect(prisma.registration.create).not.toHaveBeenCalled();
  });

  it("accepts the registration once the question is answered", async () => {
    setup(anOpenEvent({ formQuestion: "Allergier?" }));

    await register({ regStatus: RegStatus.GOING, formAnswer: "ingen" });

    expect(prisma.registration.create).toHaveBeenCalledWith({
      data: {
        eventId: EVENT_ID,
        regStatus: RegStatus.GOING,
        formAnswer: "ingen",
        userId: USER_ID,
      },
    });
  });

  it("refuses a registration for a meal the arranger cannot cater for", async () => {
    setup(anOpenEvent({ hasFood: true }), {
      id: USER_ID,
      foodPreference: null,
    });

    await expect(register({ regStatus: RegStatus.GOING })).rejects.toThrow(
      "Food preference is required",
    );
    expect(prisma.registration.create).not.toHaveBeenCalled();
  });

  it("refuses a registration for a meal when the user row is missing", async () => {
    setup(anOpenEvent({ hasFood: true }), null);

    await expect(register({ regStatus: RegStatus.GOING })).rejects.toThrow(
      "Food preference is required",
    );
  });

  it("accepts the registration when the user has stated a food preference", async () => {
    setup(anOpenEvent({ hasFood: true }), {
      id: USER_ID,
      foodPreference: FoodPreference.VEGAN,
    });

    await register({ regStatus: RegStatus.GOING });

    expect(calls).toContain(`create:${RegStatus.GOING}`);
  });

  it("refuses a registration for an event that registers elsewhere", async () => {
    setup(anOpenEvent({ registrationMode: EventRegistrationMode.EXTERNAL }));

    await expect(register({ regStatus: RegStatus.GOING })).rejects.toThrow(
      "Registration for this event does not happen in Peoply",
    );
    expect(prisma.registration.create).not.toHaveBeenCalled();
  });

  it.each([
    ["Event has ended", { endDate: new Date("2000-01-01") }],
    ["Registration has not opened yet", { regStart: new Date("2999-01-01") }],
    ["Registration has closed", { regEnd: new Date("2000-01-01") }],
  ])("refuses a registration with %s", async (message, overrides) => {
    setup(anOpenEvent(overrides));

    await expect(register({ regStatus: RegStatus.GOING })).rejects.toThrow(
      message,
    );
    expect(prisma.registration.create).not.toHaveBeenCalled();
  });

  it("creates the INVITED row an invitation asks for", async () => {
    setup(anOpenEvent());

    await register({ regStatus: RegStatus.INVITED });

    expect(prisma.registration.create).toHaveBeenCalledWith({
      data: {
        eventId: EVENT_ID,
        regStatus: RegStatus.INVITED,
        userId: USER_ID,
      },
    });
  });

  it.each([RegStatus.NOT_GOING, RegStatus.WAITLISTED, RegStatus.BANNED])(
    "refuses to create a registration that is already %s",
    async (regStatus) => {
      setup(anOpenEvent());

      await expect(register({ regStatus })).rejects.toThrow(
        "Invalid registration status",
      );
      expect(prisma.registration.create).not.toHaveBeenCalled();
    },
  );

  it("raises EventNotFound when there is no such event", async () => {
    setup(null);

    await expect(
      register({ regStatus: RegStatus.GOING }),
    ).rejects.toBeInstanceOf(EventNotFoundException);
    expect(prisma.registration.create).not.toHaveBeenCalled();
  });
});

describe("UserRegistrationService.update", () => {
  let service: UserRegistrationService;
  let updateRegistration: jest.SpyInstance;

  beforeEach(() => {
    service = new UserRegistrationService({} as any, {} as any, {} as any);
    updateRegistration = jest
      .spyOn(CommonRegistrationService.prototype, "updateRegistration")
      .mockResolvedValue(undefined as any);
  });

  afterEach(() => updateRegistration.mockRestore());

  it("changes the caller's own registration and nobody else's", async () => {
    await service.update(USER_ID, {
      eventId: EVENT_ID,
      regStatus: RegStatus.NOT_GOING,
      formAnswer: "ingen",
    } as any);

    expect(updateRegistration).toHaveBeenCalledWith(
      USER_ID,
      EVENT_ID,
      RegStatus.NOT_GOING,
      "ingen",
    );
  });

  it("never claims a user's own change was system initiated", async () => {
    await service.update(USER_ID, {
      eventId: EVENT_ID,
      regStatus: RegStatus.NOT_GOING,
    } as any);

    expect(updateRegistration.mock.calls[0]).toHaveLength(4);
  });
});
