import { RegStatus } from "../generated/prisma/client";
import { EventsService } from "./events.service";
import { EventNotFoundException } from "./exceptions";

/**
 * `findOneByUrlId` is reached from the unauthenticated `GET /events/:id`, and
 * its `registrations` include has no `take` — one array element per
 * registration, to anyone. Every consumer only ever computed
 * `filter(GOING).length`, so `goingCount` answers that directly and lets the
 * array be dropped once clients have moved over.
 */
describe("EventsService.findOneByUrlId goingCount", () => {
  const serviceWith = (event: unknown) => {
    const findUnique = jest.fn().mockResolvedValue(event);
    const prisma = { event: { findUnique } } as any;

    return {
      service: new EventsService(prisma, {} as any, {} as any, {} as any),
      findUnique,
    };
  };

  const event = (goingCount: number) => ({
    id: "event-1",
    urlId: "ABCDEFGH",
    archivedAt: null,
    registrations: [{ regStatus: RegStatus.GOING }],
    _count: { registrations: goingCount },
  });

  it("exposes goingCount and hides the raw _count", async () => {
    const { service } = serviceWith(event(42));

    const result = (await service.findOneByUrlId("ABCDEFGH")) as Record<
      string,
      unknown
    >;

    expect(result.goingCount).toBe(42);
    expect(result._count).toBeUndefined();
  });

  it("counts only GOING, not every registration", async () => {
    const { service, findUnique } = serviceWith(event(0));

    await service.findOneByUrlId("ABCDEFGH");

    expect(findUnique.mock.calls[0][0].include._count).toEqual({
      select: { registrations: { where: { regStatus: RegStatus.GOING } } },
    });
  });

  /* Deployed clients still read this array; removing it is a follow-up once
     the frontend has moved to goingCount. */
  it("still returns the registrations array for now", async () => {
    const { service } = serviceWith(event(1));

    const result = (await service.findOneByUrlId("ABCDEFGH")) as Record<
      string,
      unknown
    >;

    expect(result.registrations).toEqual([{ regStatus: RegStatus.GOING }]);
  });

  it.each([
    ["a missing event", null],
    ["an archived event", { ...event(1), archivedAt: new Date() }],
  ])("still raises for %s", async (_label, row) => {
    const { service } = serviceWith(row);

    await expect(service.findOneByUrlId("ABCDEFGH")).rejects.toThrow(
      EventNotFoundException,
    );
  });
});
