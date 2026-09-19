import {
  EventVisibility,
  FoodPreference,
  RegStatus,
} from "../../generated/prisma/client";
import { DEFAULT_SEARCH_PAGE_SIZE } from "../../util/pagination";
import { EventNotFoundException } from "../../events/exceptions";
import { UserDoesNotExistException } from "../../users/exceptions";
import { ArrangerRegistrationService } from "./arranger.registrations.service";
import { CommonRegistrationService } from "./common.registrations.service";

const EVENT_ID = "event-1";
const USER_ID = "user-1";

describe("ArrangerRegistrationService.findAll filtered by status", () => {
  let service: ArrangerRegistrationService;
  let prisma: any;

  const setup = (hasFood: boolean) => {
    prisma = {
      event: { findUnique: jest.fn().mockResolvedValue({ hasFood }) },
      registration: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ArrangerRegistrationService(prisma, {} as any);
  };

  it("asks the database for that status only", async () => {
    setup(false);

    await service.findAll({ regStatus: RegStatus.WAITLISTED } as any, EVENT_ID);

    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: EVENT_ID, regStatus: RegStatus.WAITLISTED },
        skip: 0,
        take: DEFAULT_SEARCH_PAGE_SIZE,
        orderBy: { updatedAt: "asc" },
      }),
    );
  });

  it("selects food data for the attending list when the event serves food", async () => {
    setup(true);

    await service.findAll({ regStatus: RegStatus.GOING } as any, EVENT_ID);

    const [{ include }] = prisma.registration.findMany.mock.calls[0];
    expect(include.user.select.foodPreference).toBe(true);
    expect(include.user.select.userAllergens).toEqual({
      select: { allergen: true },
    });
  });

  it("leaves food data out of the waitlist", async () => {
    setup(true);

    await service.findAll({ regStatus: RegStatus.WAITLISTED } as any, EVENT_ID);

    const [{ include }] = prisma.registration.findMany.mock.calls[0];
    expect(include.user.select.foodPreference).toBe(false);
    expect(include.user.select.userAllergens).toBeUndefined();
  });

  it("leaves food data out of an event that serves no food", async () => {
    setup(false);

    await service.findAll({ regStatus: RegStatus.GOING } as any, EVENT_ID);

    const [{ include }] = prisma.registration.findMany.mock.calls[0];
    expect(include.user.select.foodPreference).toBe(false);
  });

  it("serves no food data for an event that no longer exists", async () => {
    setup(false);
    prisma.event.findUnique.mockResolvedValue(null);

    await service.findAll({ regStatus: RegStatus.GOING } as any, EVENT_ID);

    const [{ include }] = prisma.registration.findMany.mock.calls[0];
    expect(include.user.select.foodPreference).toBe(false);
  });

  it("includes the attendees only when the caller asked for them", async () => {
    setup(true);

    await service.findAll({ includeUsers: true } as any, EVENT_ID);
    await service.findAll({} as any, EVENT_ID);

    const [withUsers] = prisma.registration.findMany.mock.calls[0];
    const [withoutUsers] = prisma.registration.findMany.mock.calls[1];
    expect(withUsers.include.user.select.foodPreference).toBe(true);
    expect(withoutUsers.include.user).toBeUndefined();
  });

  it("keeps the rows of an event that serves no food exactly as they came back", async () => {
    setup(false);
    prisma.registration.findMany.mockResolvedValue([
      {
        eventId: EVENT_ID,
        userId: USER_ID,
        regStatus: RegStatus.INVITED,
        user: { foodPreference: FoodPreference.VEGAN },
      },
    ]);

    const [registration] = (await service.findAll(
      {} as any,
      EVENT_ID,
    )) as any[];

    expect(registration.user.foodPreference).toBe(FoodPreference.VEGAN);
  });
});

describe("ArrangerRegistrationService.getRegistrationCount for missing and hidden events", () => {
  let service: ArrangerRegistrationService;
  let prisma: any;

  const setup = (event: unknown) => {
    prisma = {
      event: { findUnique: jest.fn().mockResolvedValue(event) },
      registration: { count: jest.fn().mockResolvedValue(7) },
    };
    service = new ArrangerRegistrationService(prisma, {} as any);
  };

  it.each([true, false])(
    "raises EventNotFound when there is no such event (arranger: %s)",
    async (isArranger) => {
      setup(null);

      await expect(
        service.getRegistrationCount({} as any, EVENT_ID, isArranger),
      ).rejects.toBeInstanceOf(EventNotFoundException);
      expect(prisma.registration.count).not.toHaveBeenCalled();
    },
  );

  it.each([EventVisibility.UNLISTED, EventVisibility.PRIVATE])(
    "hides the count of a %s event from a non-arranger",
    async (visibility) => {
      setup({ visibility });

      await expect(
        service.getRegistrationCount({} as any, EVENT_ID, false),
      ).rejects.toBeInstanceOf(EventNotFoundException);
      expect(prisma.registration.count).not.toHaveBeenCalled();
    },
  );

  it("treats a caller whose role was not stated as a non-arranger", async () => {
    setup({ visibility: EventVisibility.PRIVATE });

    await expect(
      service.getRegistrationCount({} as any, EVENT_ID),
    ).rejects.toBeInstanceOf(EventNotFoundException);
  });

  it("lets the arranger of an unlisted event count it", async () => {
    setup({ visibility: EventVisibility.UNLISTED });

    await expect(
      service.getRegistrationCount({} as any, EVENT_ID, true),
    ).resolves.toBe(7);
  });
});

describe("ArrangerRegistrationService.update guards", () => {
  let service: ArrangerRegistrationService;
  let prisma: any;
  let send: jest.Mock;
  let updateRegistration: jest.SpyInstance;

  beforeEach(() => {
    send = jest.fn().mockResolvedValue(undefined);
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          email: "attendee@example.no",
          allowEmailFromArranger: true,
        }),
      },
      event: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ title: "Fest", urlId: "ABCDEFGH" }),
      },
    };
    service = new ArrangerRegistrationService(prisma, { send } as any);
    updateRegistration = jest
      .spyOn(CommonRegistrationService.prototype, "updateRegistration")
      .mockResolvedValue({ regStatus: RegStatus.NOT_GOING } as any);
  });

  afterEach(() => updateRegistration.mockRestore());

  const update = (regStatus: RegStatus) =>
    service.update(USER_ID, EVENT_ID, { regStatus } as any);

  it("raises EventNotFound without touching the registration", async () => {
    prisma.event.findUnique.mockResolvedValue(null);

    await expect(update(RegStatus.NOT_GOING)).rejects.toBeInstanceOf(
      EventNotFoundException,
    );
    expect(updateRegistration).not.toHaveBeenCalled();
  });

  it("raises UserDoesNotExist without touching the registration", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(update(RegStatus.NOT_GOING)).rejects.toBeInstanceOf(
      UserDoesNotExistException,
    );
    expect(updateRegistration).not.toHaveBeenCalled();
  });

  it("sends no mail for a change that is neither a removal nor a ban", async () => {
    updateRegistration.mockResolvedValue({
      regStatus: RegStatus.GOING,
    } as any);

    await update(RegStatus.GOING);

    expect(updateRegistration).toHaveBeenCalledWith(
      USER_ID,
      EVENT_ID,
      RegStatus.GOING,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("tells a removed attendee they may end up on the waitlist if they return", async () => {
    await update(RegStatus.NOT_GOING);

    const [message] = send.mock.calls[0];
    expect(message.content.subject).toContain("avmeldt");
    expect(message.content.html).toContain("venteliste");
    expect(message.recipients).toEqual({
      to: [{ address: "attendee@example.no" }],
    });
  });

  it("escapes the event title it puts in the mail", async () => {
    prisma.event.findUnique.mockResolvedValue({
      title: "<script>alert(1)</script>",
      urlId: "ABCDEFGH",
    });

    await update(RegStatus.NOT_GOING);

    const [message] = send.mock.calls[0];
    expect(message.content.html).not.toContain("<script>");
    expect(message.content.html).toContain("&lt;script&gt;");
  });
});
