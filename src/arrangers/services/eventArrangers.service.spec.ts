import { EventArrangersService } from "./eventArrangers.service";
import { MAX_PAGE_SIZE } from "../../util/pagination";

describe("EventArrangersService.findAllWithEventsArrangedByUserAndOrganizationsOfUser", () => {
  const MY_ARRANGER = "arr-mine";
  const MY_ORG_ARRANGER = "arr-my-org";
  const OTHER_ARRANGER = "arr-theirs";

  let prisma: any;

  /**
   * One event co-arranged by an arranger the caller controls and one they do
   * not — the only shape where the distinction is observable.
   */
  const coArrangedRow = () => ({
    eventId: "event-1",
    arrangerId: MY_ORG_ARRANGER,
    event: {
      id: "event-1",
      title: "Will Code For Drinks",
      eventArrangers: [
        { eventId: "event-1", arrangerId: MY_ORG_ARRANGER, arranger: {} },
        { eventId: "event-1", arrangerId: OTHER_ARRANGER, arranger: {} },
      ],
    },
  });

  const setup = (
    rows: any[],
    orgs: any[] = [{ arrangerId: MY_ORG_ARRANGER }],
  ) => {
    prisma = {
      organization: { findMany: jest.fn().mockResolvedValue(orgs) },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "user-1", arrangerId: MY_ARRANGER }),
      },
      eventArranger: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    return new EventArrangersService(prisma);
  };

  const run = (
    service: EventArrangersService,
    page: { skip?: number; take?: number } = {},
  ) =>
    service.findAllWithEventsArrangedByUserAndOrganizationsOfUser(
      "user-1",
      page,
    );

  const eventArrangerQuery = () =>
    prisma.eventArranger.findMany.mock.calls[0][0];

  it("marks the caller's own arranger on a co-arranged event", async () => {
    const [row] = await run(setup([coArrangedRow()]));

    const mine = row.event.eventArrangers.find(
      (a: any) => a.arrangerId === MY_ORG_ARRANGER,
    );
    expect(mine?.isMine).toBe(true);
  });

  it("marks a co-arranger the caller has no role in", async () => {
    const [row] = await run(setup([coArrangedRow()]));

    // This is the whole point of the flag: the co-arranger is still in the
    // payload, because it has to be rendered on the event, but a client can
    // no longer mistake it for an organization the caller belongs to.
    const theirs = row.event.eventArrangers.find(
      (a: any) => a.arrangerId === OTHER_ARRANGER,
    );
    expect(theirs?.isMine).toBe(false);
  });

  it("counts the caller's personal arranger as their own", async () => {
    const service = setup(
      [
        {
          eventId: "event-2",
          arrangerId: MY_ARRANGER,
          event: {
            id: "event-2",
            eventArrangers: [
              { eventId: "event-2", arrangerId: MY_ARRANGER, arranger: {} },
            ],
          },
        },
      ],
      [],
    );

    const [row] = await run(service);
    expect(row.event.eventArrangers[0].isMine).toBe(true);
  });

  it("leaves the rest of the row untouched", async () => {
    const [row] = await run(setup([coArrangedRow()]));

    expect(row.eventId).toBe("event-1");
    expect(row.event.title).toBe("Will Code For Drinks");
    expect(row.event.eventArrangers).toHaveLength(2);
  });

  it("queries only the arrangers the caller controls", async () => {
    await run(setup([]));

    const where = prisma.eventArranger.findMany.mock.calls[0][0].where;
    expect(where.arrangerId.in.sort()).toEqual(
      [MY_ARRANGER, MY_ORG_ARRANGER].sort(),
    );
    expect(where.arrangerId.in).not.toContain(OTHER_ARRANGER);
  });

  it("does not repeat an arrangerId that is both personal and an org's", async () => {
    // Set semantics: the raw array form would have sent a duplicate to Prisma.
    await run(setup([], [{ arrangerId: MY_ARRANGER }]));

    expect(
      prisma.eventArranger.findMany.mock.calls[0][0].where.arrangerId.in,
    ).toEqual([MY_ARRANGER]);
  });

  it("asks the database for the page rather than every row", async () => {
    await run(setup([]), { skip: 20, take: 5 });

    expect(eventArrangerQuery()).toMatchObject({ skip: 20, take: 5 });
  });

  it("bounds the page at the row cap when the caller sent none", async () => {
    await run(setup([]));

    expect(eventArrangerQuery()).toMatchObject({
      skip: 0,
      take: MAX_PAGE_SIZE,
    });
  });

  it("orders the page, so which events land on it is not up to the planner", async () => {
    await run(setup([]), { skip: 0, take: 5 });

    expect(eventArrangerQuery().orderBy).toEqual({
      event: { startDate: "desc" },
    });
  });

  it("never bounds the organizations that decide whose events these are", async () => {
    await run(setup([]), { skip: 0, take: 5 });

    expect(prisma.organization.findMany.mock.calls[0][0].take).toBeUndefined();
  });

  it("refuses to run for a user with no arranger", async () => {
    const service = setup([]);
    prisma.user.findUnique.mockResolvedValue({ id: "user-1" });

    await expect(run(service)).rejects.toThrow(
      "User does not have an arrangerId",
    );
  });
});
