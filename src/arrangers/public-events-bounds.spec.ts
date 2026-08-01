import { EventArrangersService } from "./services/eventArrangers.service";
import { MAX_PAGE_SIZE } from "../util/pagination";

/* findAllPublicWithEvents backs two unauthenticated endpoints, so the row
   count it asks for must not be a function of how long an organization has
   existed. */
describe("EventArrangersService.findAllPublicWithEvents bounds", () => {
  const findMany = jest.fn();
  const prisma = { eventArranger: { findMany } } as any;

  let service: EventArrangersService;

  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([]);
    service = new EventArrangersService(prisma);
  });

  const lastQuery = () => findMany.mock.calls[0][0];

  it("caps the row count by default", async () => {
    await service.findAllPublicWithEvents("arr-1");

    expect(lastQuery().take).toBe(MAX_PAGE_SIZE);
  });

  it("lets a caller ask for fewer", async () => {
    await service.findAllPublicWithEvents("arr-1", { take: 10 });

    expect(lastQuery().take).toBe(10);
  });

  it("orders the query so the cap is deterministic", async () => {
    await service.findAllPublicWithEvents("arr-1");

    /* Without an order, which rows the cap keeps is up to the planner. */
    expect(lastQuery().orderBy).toEqual({ event: { startDate: "desc" } });
  });

  it("pushes a date floor into the query rather than filtering afterwards", async () => {
    const fromDate = new Date("2026-01-01T00:00:00.000Z");

    await service.findAllPublicWithEvents("arr-1", { fromDate });

    expect(lastQuery().where.event.is.startDate).toEqual({ gte: fromDate });
  });

  it("keeps the nearest events when a floor is set", async () => {
    await service.findAllPublicWithEvents("arr-1", { fromDate: new Date() });

    /* Descending here would spend the budget on the furthest-future events
       and drop the ones a visitor actually cares about. */
    expect(lastQuery().orderBy).toEqual({ event: { startDate: "asc" } });
  });

  it("omits the floor entirely when none is given", async () => {
    await service.findAllPublicWithEvents("arr-1");

    expect(lastQuery().where.event.is).not.toHaveProperty("startDate");
  });

  it("still restricts to public, unarchived events of approved organizations", async () => {
    await service.findAllPublicWithEvents("arr-1", { fromDate: new Date() });

    const { is } = lastQuery().where.event;
    expect(is.visibility).toBe("PUBLIC");
    expect(is.archivedAt).toBeNull();
    expect(is.eventArrangers.none.arranger.organization.is.approved).toBe(
      false,
    );
  });
});
