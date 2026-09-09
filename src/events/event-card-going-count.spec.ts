import { RegStatus } from "../generated/prisma/client";
import { FavoritesService } from "../favorites/favorites.service";
import { UserRegistrationService } from "../registrations/services/user.registrations.service";

const GOING_COUNT_SELECT = {
  select: { registrations: { where: { regStatus: RegStatus.GOING } } },
};

const eventRow = (goingCount: number) => ({
  id: "event-1",
  title: "Kodekveld",
  visibility: "PUBLIC",
  _count: { registrations: goingCount },
});

const listQuery = { includeEvent: true, includeArrangers: true };

describe("the event on a user's own favorites list", () => {
  const serviceWith = (rows: unknown[]) => {
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = { favorite: { findMany } } as any;

    return {
      service: new FavoritesService(prisma, {} as any),
      findMany,
    };
  };

  it("carries goingCount and hides the raw _count", async () => {
    const { service } = serviceWith([
      { eventId: "event-1", event: eventRow(12) },
    ]);

    const [favorite] = (await service.findAll(
      listQuery as any,
      "user-1",
    )) as any[];

    expect(favorite.event.goingCount).toBe(12);
    expect(favorite.event._count).toBeUndefined();
  });

  it("counts only GOING, not every registration", async () => {
    const { service, findMany } = serviceWith([]);

    await service.findAll(listQuery as any, "user-1");

    expect(findMany.mock.calls[0][0].include.event.include._count).toEqual(
      GOING_COUNT_SELECT,
    );
  });

  it("leaves a row alone when the caller asked for no event", async () => {
    const { service } = serviceWith([{ eventId: "event-1" }]);

    const [favorite] = (await service.findAll({} as any, "user-1")) as any[];

    expect(favorite).toEqual({ eventId: "event-1" });
  });
});

describe("the event on a user's own registrations list", () => {
  const serviceWith = (rows: unknown[]) => {
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = { registration: { findMany } } as any;

    const eventAccess = {
      registrationGrantsEventAccess: jest.fn().mockReturnValue(true),
      viewableEventIds: jest.fn().mockResolvedValue(new Set<string>()),
    } as any;

    return {
      service: new UserRegistrationService(prisma, {} as any, eventAccess),
      findMany,
    };
  };

  const registrationRow = (goingCount: number) => ({
    eventId: "event-1",
    regStatus: RegStatus.GOING,
    event: eventRow(goingCount),
  });

  it("carries goingCount and hides the raw _count", async () => {
    const { service } = serviceWith([registrationRow(7)]);

    const [registration] = (await service.findAll(
      listQuery as any,
      "user-1",
    )) as any[];

    expect(registration.event.goingCount).toBe(7);
    expect(registration.event._count).toBeUndefined();
  });

  it("counts only GOING, not every registration", async () => {
    const { service, findMany } = serviceWith([]);

    await service.findAll(listQuery as any, "user-1");

    expect(findMany.mock.calls[0][0].include.event.include._count).toEqual(
      GOING_COUNT_SELECT,
    );
  });

  it("leaves a row alone when the caller asked for no event", async () => {
    const { service } = serviceWith([
      { eventId: "event-1", regStatus: RegStatus.GOING },
    ]);

    const [registration] = (await service.findAll(
      {} as any,
      "user-1",
    )) as any[];

    expect(registration).toEqual({
      eventId: "event-1",
      regStatus: RegStatus.GOING,
    });
  });
});
