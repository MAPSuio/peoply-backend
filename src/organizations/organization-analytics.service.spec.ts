import { OrganizationAnalyticsService } from "./organization-analytics.service";

/* 2026-08-20 is a Thursday; June/August dates are CEST (UTC+2) in
   Europe/Oslo, which the weekday/time-of-day buckets are defined in. */
const NOW = new Date("2026-08-20T12:00:00Z");

describe("OrganizationAnalyticsService", () => {
  const prisma = {
    arrangerFollower: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    userOrganizationRole: {
      count: jest.fn(),
    },
    event: {
      findMany: jest.fn(),
    },
    registration: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const mockFollowerQueries = (
    windows: {
      net24h: number;
      net7d: number;
      net30d: number;
      netPeriod: number;
    },
    dailyNets: { day: string; net: number }[] = [],
  ) => {
    prisma.$queryRaw.mockImplementation((strings: TemplateStringsArray) =>
      Promise.resolve(
        strings.join(" ").includes("net24h") ? [windows] : dailyNets,
      ),
    );
  };
  const organizationsService = {
    findByRefForRoleHolderOrThrow: jest.fn(),
  };

  const org = { id: "org-1", arrangerId: "arranger-1" };

  /* Analytics is owner-facing, so the lookup takes the caller and answers the
     membership question itself rather than trusting the route decorator. */
  const ROLE_HOLDER = "user-1";

  let service: OrganizationAnalyticsService;

  const emptyMocks = () => {
    organizationsService.findByRefForRoleHolderOrThrow.mockResolvedValue(org);
    prisma.arrangerFollower.count.mockResolvedValue(0);
    prisma.arrangerFollower.findMany.mockResolvedValue([]);
    mockFollowerQueries({ net24h: 0, net7d: 0, net30d: 0, netPeriod: 0 });
    prisma.userOrganizationRole.count.mockResolvedValue(0);
    prisma.event.findMany.mockResolvedValue([]);
    prisma.registration.findMany.mockResolvedValue([]);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: NOW });
    emptyMocks();
    service = new OrganizationAnalyticsService(
      prisma as any,
      organizationsService as any,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("resolves the organization by ref and queries with its arrangerId", async () => {
    await service.getAnalytics("my-org", ROLE_HOLDER);

    expect(
      organizationsService.findByRefForRoleHolderOrThrow,
    ).toHaveBeenCalledWith("my-org", ROLE_HOLDER);
    expect(prisma.arrangerFollower.count).toHaveBeenCalledWith({
      where: { arrangerId: "arranger-1" },
    });
    expect(prisma.userOrganizationRole.count).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
    });
  });

  it("passes the aggregated follower net windows through to the response", async () => {
    mockFollowerQueries({ net24h: 0, net7d: 1, net30d: 1, netPeriod: 1 });

    const result = await service.getAnalytics("org-1", ROLE_HOLDER);

    expect(result.followers.net24h).toBe(0);
    expect(result.followers.net7d).toBe(1);
    expect(result.followers.net30d).toBe(1);
  });

  it("returns dailyNet as zero-filled ascending UTC days ending today", async () => {
    mockFollowerQueries({ net24h: 1, net7d: 1, net30d: 0, netPeriod: 0 }, [
      { day: "2026-08-20", net: 1 },
      { day: "2026-08-19", net: 0 },
      { day: "2026-07-25", net: -1 },
    ]);

    const { dailyNet } = (
      await service.getAnalytics("org-1", ROLE_HOLDER, "30d")
    ).followers;

    expect(dailyNet).toHaveLength(30);
    expect(dailyNet[0].date).toBe("2026-07-22");
    expect(dailyNet[29]).toEqual({ date: "2026-08-20", net: 1 });
    expect(dailyNet[28]).toEqual({ date: "2026-08-19", net: 0 });
    expect(dailyNet.find((day) => day.date === "2026-07-25")).toEqual({
      date: "2026-07-25",
      net: -1,
    });
    const touched = new Set(["2026-08-20", "2026-08-19", "2026-07-25"]);
    for (const day of dailyNet) {
      if (!touched.has(day.date)) {
        expect(day.net).toBe(0);
      }
    }
  });

  it("keeps the follower gross window fixed at 30 days", async () => {
    await service.getAnalytics("org-1", ROLE_HOLDER);

    const grossCall = prisma.arrangerFollower.count.mock.calls.find(
      ([args]: any[]) => args.where.createdAt,
    );
    expect(grossCall[0].where.createdAt.gte).toEqual(
      new Date(NOW.getTime() - 30 * 24 * 3_600_000),
    );
  });

  describe("with a season of events and registrations", () => {
    /* E2 (June, Tue afternoon, no capacity), E1 (Aug 13, Thu evening,
       capacity 10), E3 (Aug 18, Tue morning, capacity 2 = sold out). */
    const events = [
      {
        id: "e1",
        urlId: "e1",
        title: "Kveldskurs",
        startDate: new Date("2026-08-13T17:00:00Z"),
        capacity: 10,
        createdAt: new Date("2026-08-03T17:00:00Z"),
      },
      {
        id: "e2",
        urlId: "e2",
        title: "Lunsjmøte",
        startDate: new Date("2026-06-16T10:00:00Z"),
        capacity: null,
        createdAt: new Date("2026-06-06T10:00:00Z"),
      },
      {
        id: "e3",
        urlId: "e3",
        title: "Morgentrening",
        startDate: new Date("2026-08-18T08:00:00Z"),
        capacity: 2,
        createdAt: new Date("2026-08-08T08:00:00Z"),
      },
    ];
    const registrations = [
      {
        eventId: "e1",
        userId: "u1",
        regStatus: "GOING",
        createdAt: new Date("2026-08-06T17:00:00Z"),
      },
      {
        eventId: "e1",
        userId: "u2",
        regStatus: "GOING",
        createdAt: new Date("2026-08-12T17:00:00Z"),
      },
      {
        eventId: "e1",
        userId: "u3",
        regStatus: "WAITLISTED",
        createdAt: new Date("2026-08-07T17:00:00Z"),
      },
      {
        eventId: "e1",
        userId: "u4",
        regStatus: "NOT_GOING",
        createdAt: new Date("2026-08-07T18:00:00Z"),
      },
      {
        eventId: "e2",
        userId: "u1",
        regStatus: "GOING",
        createdAt: new Date("2026-06-09T10:00:00Z"),
      },
      {
        eventId: "e3",
        userId: "u2",
        regStatus: "GOING",
        createdAt: new Date("2026-08-17T08:00:00Z"),
      },
      {
        eventId: "e3",
        userId: "u5",
        regStatus: "GOING",
        createdAt: new Date("2026-08-10T08:00:00Z"),
      },
    ];

    beforeEach(() => {
      prisma.event.findMany.mockResolvedValue(events);
      prisma.registration.findMany.mockResolvedValue(registrations);
      prisma.arrangerFollower.findMany.mockResolvedValue([
        { userId: "u2" },
        { userId: "u9" },
      ]);
    });

    it("computes per-event counts and fill rates, items ascending by startDate", async () => {
      const { items } = (await service.getAnalytics("org-1", ROLE_HOLDER))
        .events;

      expect(items.map((item) => item.id)).toEqual(["e2", "e1", "e3"]);
      expect(items[1]).toEqual({
        id: "e1",
        urlId: "e1",
        title: "Kveldskurs",
        startDate: "2026-08-13T17:00:00.000Z",
        capacity: 10,
        goingCount: 2,
        waitlistedCount: 1,
        fillRate: 0.2,
      });
      expect(items[0].fillRate).toBeNull();
      expect(items[2].fillRate).toBe(1);
    });

    it("computes capacity aggregates: totals, averages, sold-out rate and demand", async () => {
      const { events: agg } = await service.getAnalytics("org-1", ROLE_HOLDER);

      expect(agg.totalGoing).toBe(5);
      expect(agg.totalWaitlisted).toBe(1);
      expect(agg.averageGoing).toBeCloseTo(5 / 3);
      // Only the two capacity events count: (0.2 + 1) / 2.
      expect(agg.averageFillRate).toBeCloseTo(0.6);
      expect(agg.soldOutRate).toBeCloseTo(0.5);
      // Demand per event: e2 = 1, e1 = 3, e3 = 2 -> median 2.
      expect(agg.medianDemand).toBe(2);
    });

    it("computes signup timing: median lead, last-minute share, publish lead, dropout", async () => {
      const { events: agg } = await service.getAnalytics("org-1", ROLE_HOLDER);

      // GOING leads in days: [7, 1, 7, 1, 8] -> median 7.
      expect(agg.medianSignupLeadDays).toBe(7);
      // Two of five GOING signups landed within 48h of start.
      expect(agg.lastMinuteShare).toBeCloseTo(2 / 5);
      expect(agg.medianPublishLeadDays).toBe(10);
      expect(agg.dropoutRate).toBeCloseTo(1 / 6);
    });

    it("buckets attendance by Europe/Oslo weekday and time of day", async () => {
      const { events: agg } = await service.getAnalytics("org-1", ROLE_HOLDER);

      expect(agg.byWeekday).toHaveLength(7);
      expect(agg.byWeekday.map((bucket) => bucket.weekday)).toEqual([
        0, 1, 2, 3, 4, 5, 6,
      ]);
      // Tuesday (1): e2 + e3 -> (1 + 2) / 2; Thursday (3): e1 -> 2.
      expect(agg.byWeekday[1]).toEqual({
        weekday: 1,
        averageGoing: 1.5,
        eventCount: 2,
      });
      expect(agg.byWeekday[3]).toEqual({
        weekday: 3,
        averageGoing: 2,
        eventCount: 1,
      });
      expect(agg.byWeekday[0]).toEqual({
        weekday: 0,
        averageGoing: 0,
        eventCount: 0,
      });

      expect(agg.byTimeOfDay).toEqual([
        { bucket: "MORNING", averageGoing: 2, eventCount: 1 },
        { bucket: "AFTERNOON", averageGoing: 1, eventCount: 1 },
        { bucket: "EVENING", averageGoing: 2, eventCount: 1 },
      ]);
    });

    it("computes the audience block from unique GOING users and the follower cross", async () => {
      const { audience } = await service.getAnalytics("org-1", ROLE_HOLDER);

      expect(audience.uniqueAttendees).toBe(3);
      // u1 (e1+e2) and u2 (e1+e3) returned, u5 did not.
      expect(audience.returningAttendeeRate).toBeCloseTo(2 / 3);
      expect(audience.coreAudienceCount).toBe(0);
      // Of u1/u2/u5, only u2 follows the arranger.
      expect(audience.attendeeFollowerRate).toBeCloseTo(1 / 3);
    });

    it("never exposes user ids in the payload", async () => {
      const payload = await service.getAnalytics("org-1", ROLE_HOLDER);

      expect(JSON.stringify(payload)).not.toContain("userId");
      expect(JSON.stringify(payload)).not.toMatch(/"u[1-9]"/);
    });
  });

  it("scopes the event query to the arranger, the period window and unarchived events", async () => {
    await service.getAnalytics("org-1", ROLE_HOLDER);

    const [args] = prisma.event.findMany.mock.calls[0];
    expect(args.where.eventArrangers).toEqual({
      some: { arrangerId: "arranger-1" },
    });
    expect(args.where.archivedAt).toBeNull();
    expect(args.where.startDate.lte).toEqual(NOW);
    // The default period is one year.
    expect(args.where.startDate.gte).toEqual(
      new Date(NOW.getTime() - 365 * 24 * 3_600_000),
    );
    expect(args.orderBy).toEqual({ startDate: "asc" });
  });

  it("windows the event and member queries by the requested period", async () => {
    await service.getAnalytics("org-1", ROLE_HOLDER, "7d");

    const [eventArgs] = prisma.event.findMany.mock.calls[0];
    expect(eventArgs.where.startDate.gte).toEqual(
      new Date(NOW.getTime() - 7 * 24 * 3_600_000),
    );
    const memberWindowCall = prisma.userOrganizationRole.count.mock.calls.find(
      ([args]: any[]) => args.where.createdAt,
    );
    expect(memberWindowCall[0].where.createdAt.gte).toEqual(
      new Date(NOW.getTime() - 7 * 24 * 3_600_000),
    );
  });

  it("sizes dailyNet to the period, capped at one year", async () => {
    const week = await service.getAnalytics("org-1", ROLE_HOLDER, "7d");
    expect(week.followers.dailyNet).toHaveLength(7);
    expect(week.period).toBe("7d");

    const day = await service.getAnalytics("org-1", ROLE_HOLDER, "24h");
    expect(day.followers.dailyNet).toHaveLength(1);

    const year = await service.getAnalytics("org-1", ROLE_HOLDER, "1y");
    expect(year.followers.dailyNet).toHaveLength(365);
  });

  it("keeps the fixed net windows distinct from the period net", async () => {
    mockFollowerQueries({ net24h: 1, net7d: 1, net30d: 1, netPeriod: 2 });

    const result = await service.getAnalytics("org-1", ROLE_HOLDER, "1y");

    expect(result.followers.net24h).toBe(1);
    expect(result.followers.net30d).toBe(1);
    expect(result.followers.netPeriod).toBe(2);
  });

  it("only fetches GOING, NOT_GOING and WAITLISTED registrations for the fetched events", async () => {
    prisma.event.findMany.mockResolvedValue([
      {
        id: "e1",
        urlId: "e1",
        title: "T",
        startDate: new Date("2026-08-13T17:00:00Z"),
        capacity: null,
        createdAt: new Date("2026-08-03T17:00:00Z"),
      },
    ]);

    await service.getAnalytics("org-1", ROLE_HOLDER);

    const [args] = prisma.registration.findMany.mock.calls[0];
    expect(args.where.eventId).toEqual({ in: ["e1"] });
    expect(args.where.regStatus).toEqual({
      in: ["GOING", "NOT_GOING", "WAITLISTED"],
    });
  });

  it("returns zeros and nulls for an organization with no activity", async () => {
    const payload = await service.getAnalytics("org-1", ROLE_HOLDER);

    expect(payload.generatedAt).toBe(NOW.toISOString());
    expect(payload.followers).toMatchObject({
      total: 0,
      net24h: 0,
      net7d: 0,
      net30d: 0,
      gross30d: 0,
    });
    expect(payload.members).toEqual({ total: 0, newInPeriod: 0 });
    expect(payload.events.items).toEqual([]);
    expect(payload.events.averageGoing).toBeNull();
    expect(payload.events.averageFillRate).toBeNull();
    expect(payload.events.soldOutRate).toBeNull();
    expect(payload.events.medianDemand).toBeNull();
    expect(payload.events.medianSignupLeadDays).toBeNull();
    expect(payload.events.lastMinuteShare).toBeNull();
    expect(payload.events.medianPublishLeadDays).toBeNull();
    expect(payload.events.dropoutRate).toBeNull();
    expect(payload.audience).toEqual({
      uniqueAttendees: 0,
      returningAttendeeRate: null,
      coreAudienceCount: 0,
      attendeeFollowerRate: null,
    });
  });
});
