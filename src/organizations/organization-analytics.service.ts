import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizationsService } from "./organizations.service";
import { FollowAction, RegStatus } from "../generated/prisma/client";
import {
  OrganizationAnalyticsEventItem,
  OrganizationAnalyticsResponse,
  TimeOfDayBucket,
} from "./dto/organization-analytics.response";
import {
  ANALYTICS_PERIOD_DAYS,
  AnalyticsPeriod,
  DEFAULT_ANALYTICS_PERIOD,
} from "./dto/organization-analytics.query";
import { ALL_ROWS } from "../util/pagination";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const FIXED_NET_WINDOW_DAYS = 30;
const LAST_MINUTE_MILLISECONDS = 48 * 60 * 60 * 1000;

/* The product speaks Norwegian and the orgs plan their events in local time,
   so the weekday/time-of-day buckets are Europe/Oslo, not UTC. */
const OSLO_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Oslo",
  weekday: "short",
  hour: "2-digit",
  hourCycle: "h23",
});
const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};
const TIME_OF_DAY_BUCKETS: TimeOfDayBucket[] = [
  "MORNING",
  "AFTERNOON",
  "EVENING",
];

interface EventRow {
  id: string;
  urlId: string;
  title: string;
  startDate: Date;
  capacity: number | null;
  createdAt: Date;
}

interface RegistrationRow {
  eventId: string;
  userId: string;
  regStatus: RegStatus;
  createdAt: Date;
}

interface FollowerEventRow {
  action: FollowAction;
  createdAt: Date;
}

interface RegistrationTally {
  goingByEvent: Map<string, number>;
  waitlistedByEvent: Map<string, number>;
  goingCountByUser: Map<string, number>;
  signupLeadDays: number[];
  lastMinuteCount: number;
  notGoingCount: number;
}

/** part / whole, or null when there is nothing to divide by. */
const ratio = (part: number, whole: number): number | null =>
  whole === 0 ? null : part / whole;

const median = (values: number[]): number | null => {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const roundDays = (days: number | null): number | null =>
  days === null ? null : Math.round(days * 10) / 10;

const utcDate = (date: Date): string => date.toISOString().slice(0, 10);

const increment = (map: Map<string, number>, key: string) =>
  map.set(key, (map.get(key) ?? 0) + 1);

const osloWeekdayAndHour = (date: Date): { weekday: number; hour: number } => {
  const parts = OSLO_TIME.formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = parts.find((part) => part.type === "hour")?.value ?? "0";
  return { weekday: WEEKDAY_INDEX[weekday] ?? 0, hour: Number(hour) };
};

const timeOfDay = (hour: number): TimeOfDayBucket =>
  hour < 12 ? "MORNING" : hour < 17 ? "AFTERNOON" : "EVENING";

function tallyGoing(
  tally: RegistrationTally,
  registration: RegistrationRow,
  startDate: Date | undefined,
) {
  increment(tally.goingByEvent, registration.eventId);
  increment(tally.goingCountByUser, registration.userId);
  if (!startDate) {
    return;
  }
  const leadMs = startDate.getTime() - registration.createdAt.getTime();
  tally.signupLeadDays.push(leadMs / MILLISECONDS_PER_DAY);
  if (leadMs <= LAST_MINUTE_MILLISECONDS) {
    tally.lastMinuteCount++;
  }
}

function tallyRegistrations(
  events: EventRow[],
  registrations: RegistrationRow[],
): RegistrationTally {
  const startDateByEvent = new Map(
    events.map((event) => [event.id, event.startDate]),
  );
  const tally: RegistrationTally = {
    goingByEvent: new Map(),
    waitlistedByEvent: new Map(),
    goingCountByUser: new Map(),
    signupLeadDays: [],
    lastMinuteCount: 0,
    notGoingCount: 0,
  };

  for (const registration of registrations) {
    if (registration.regStatus === RegStatus.NOT_GOING) {
      tally.notGoingCount++;
    } else if (registration.regStatus === RegStatus.WAITLISTED) {
      increment(tally.waitlistedByEvent, registration.eventId);
    } else {
      tallyGoing(
        tally,
        registration,
        startDateByEvent.get(registration.eventId),
      );
    }
  }

  return tally;
}

function toEventItems(
  events: EventRow[],
  tally: RegistrationTally,
): OrganizationAnalyticsEventItem[] {
  // The query orders by startDate, but the payload contract should not
  // depend on the database doing so.
  return [...events]
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .map((event) => {
      const goingCount = tally.goingByEvent.get(event.id) ?? 0;
      return {
        id: event.id,
        urlId: event.urlId,
        title: event.title,
        startDate: event.startDate.toISOString(),
        capacity: event.capacity,
        goingCount,
        waitlistedCount: tally.waitlistedByEvent.get(event.id) ?? 0,
        fillRate: event.capacity ? goingCount / event.capacity : null,
      };
    });
}

function bucketByWeekdayAndTime(items: OrganizationAnalyticsEventItem[]) {
  const byWeekday = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    averageGoing: 0,
    eventCount: 0,
  }));
  const byTimeOfDay = TIME_OF_DAY_BUCKETS.map((bucket) => ({
    bucket,
    averageGoing: 0,
    eventCount: 0,
  }));

  for (const item of items) {
    const { weekday, hour } = osloWeekdayAndHour(new Date(item.startDate));
    const weekdayBucket = byWeekday[weekday];
    weekdayBucket.eventCount++;
    weekdayBucket.averageGoing += item.goingCount;
    const hourBucket = byTimeOfDay.find(
      (candidate) => candidate.bucket === timeOfDay(hour),
    );
    if (hourBucket) {
      hourBucket.eventCount++;
      hourBucket.averageGoing += item.goingCount;
    }
  }
  for (const bucket of [...byWeekday, ...byTimeOfDay]) {
    bucket.averageGoing =
      bucket.eventCount === 0 ? 0 : bucket.averageGoing / bucket.eventCount;
  }

  return { byWeekday, byTimeOfDay };
}

function eventAggregates(
  events: EventRow[],
  items: OrganizationAnalyticsEventItem[],
  tally: RegistrationTally,
) {
  const totalGoing = items.reduce((sum, item) => sum + item.goingCount, 0);
  const totalWaitlisted = items.reduce(
    (sum, item) => sum + item.waitlistedCount,
    0,
  );
  const capacityItems = items.filter((item) => item.fillRate !== null);
  const soldOutCount = capacityItems.filter(
    (item) => (item.fillRate ?? 0) >= 1,
  ).length;
  const fillRateSum = capacityItems.reduce(
    (sum, item) => sum + (item.fillRate ?? 0),
    0,
  );
  const publishLeadDays = events.map(
    (event) =>
      (event.startDate.getTime() - event.createdAt.getTime()) /
      MILLISECONDS_PER_DAY,
  );

  return {
    items,
    totalGoing,
    totalWaitlisted,
    averageGoing: ratio(totalGoing, items.length),
    averageFillRate: ratio(fillRateSum, capacityItems.length),
    soldOutRate: ratio(soldOutCount, capacityItems.length),
    medianDemand: median(
      items.map((item) => item.goingCount + item.waitlistedCount),
    ),
    medianSignupLeadDays: roundDays(median(tally.signupLeadDays)),
    lastMinuteShare: ratio(tally.lastMinuteCount, tally.signupLeadDays.length),
    medianPublishLeadDays: roundDays(median(publishLeadDays)),
    dropoutRate: ratio(tally.notGoingCount, totalGoing + tally.notGoingCount),
    ...bucketByWeekdayAndTime(items),
  };
}

function audienceAggregates(
  goingCountByUser: Map<string, number>,
  followerRows: { userId: string }[],
) {
  const followerUserIds = new Set(followerRows.map((row) => row.userId));
  const counts = [...goingCountByUser.values()];
  const followingAttendees = [...goingCountByUser.keys()].filter((userId) =>
    followerUserIds.has(userId),
  ).length;

  return {
    uniqueAttendees: goingCountByUser.size,
    returningAttendeeRate: ratio(
      counts.filter((count) => count >= 2).length,
      goingCountByUser.size,
    ),
    coreAudienceCount: counts.filter((count) => count >= 3).length,
    attendeeFollowerRate: ratio(followingAttendees, goingCountByUser.size),
  };
}

const deltaOf = (followerEvent: FollowerEventRow): number =>
  followerEvent.action === FollowAction.FOLLOW ? 1 : -1;

const netWithin = (
  followerEvents: FollowerEventRow[],
  now: Date,
  days: number,
): number =>
  followerEvents.reduce(
    (net, followerEvent) =>
      now.getTime() - followerEvent.createdAt.getTime() <=
      days * MILLISECONDS_PER_DAY
        ? net + deltaOf(followerEvent)
        : net,
    0,
  );

function dailyNetBuckets(
  followerEvents: FollowerEventRow[],
  now: Date,
  periodDays: number,
) {
  const dayBuckets = new Map<string, number>();
  for (let day = periodDays - 1; day >= 0; day--) {
    dayBuckets.set(
      utcDate(new Date(now.getTime() - day * MILLISECONDS_PER_DAY)),
      0,
    );
  }
  for (const followerEvent of followerEvents) {
    const day = utcDate(followerEvent.createdAt);
    if (dayBuckets.has(day)) {
      dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + deltaOf(followerEvent));
    }
  }
  return [...dayBuckets.entries()].map(([date, net]) => ({ date, net }));
}

function followerNets(
  followerEvents: FollowerEventRow[],
  now: Date,
  periodDays: number,
) {
  return {
    net24h: netWithin(followerEvents, now, 1),
    net7d: netWithin(followerEvents, now, 7),
    net30d: netWithin(followerEvents, now, FIXED_NET_WINDOW_DAYS),
    netPeriod: netWithin(followerEvents, now, periodDays),
    dailyNet: dailyNetBuckets(followerEvents, now, periodDays),
  };
}

@Injectable()
export class OrganizationAnalyticsService {
  constructor(
    private prisma: PrismaService,
    private organizationsService: OrganizationsService,
  ) {}

  async getAnalytics(
    orgIdOrUrlId: string,
    period: AnalyticsPeriod = DEFAULT_ANALYTICS_PERIOD,
  ): Promise<OrganizationAnalyticsResponse> {
    const org = await this.organizationsService.findByRefOrThrow(orgIdOrUrlId);
    const now = new Date();
    const periodDays = ANALYTICS_PERIOD_DAYS[period];
    const sources = await this.fetchSources(
      org.id,
      org.arrangerId,
      now,
      periodDays,
    );
    const registrations = await this.fetchRegistrations(sources.events);
    const tally = tallyRegistrations(sources.events, registrations);
    const items = toEventItems(sources.events, tally);

    return {
      generatedAt: now.toISOString(),
      period,
      followers: {
        total: sources.followerTotal,
        gross30d: sources.followerGross30d,
        ...followerNets(sources.followerEvents, now, periodDays),
      },
      members: {
        total: sources.memberTotal,
        newInPeriod: sources.memberNewInPeriod,
      },
      events: eventAggregates(sources.events, items, tally),
      audience: audienceAggregates(
        tally.goingCountByUser,
        sources.followerRows,
      ),
    };
  }

  private async fetchSources(
    organizationId: string,
    arrangerId: string,
    now: Date,
    periodDays: number,
  ) {
    const thirtyDaysAgo = new Date(
      now.getTime() - FIXED_NET_WINDOW_DAYS * MILLISECONDS_PER_DAY,
    );
    const periodStart = new Date(
      now.getTime() - periodDays * MILLISECONDS_PER_DAY,
    );
    // The log feeds both the fixed 24h/7d/30d nets and the period series, so
    // the query has to span whichever window is widest.
    const followerLogStart =
      periodStart < thirtyDaysAgo ? periodStart : thirtyDaysAgo;

    const [
      followerTotal,
      followerGross30d,
      followerEvents,
      memberTotal,
      memberNewInPeriod,
      events,
      followerRows,
    ] = await Promise.all([
      this.prisma.arrangerFollower.count({ where: { arrangerId } }),
      this.prisma.arrangerFollower.count({
        where: { arrangerId, createdAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.arrangerFollowerEvent.findMany({
        where: { arrangerId, createdAt: { gte: followerLogStart } },
        select: { action: true, createdAt: true },
      }),
      this.prisma.userOrganizationRole.count({ where: { organizationId } }),
      this.prisma.userOrganizationRole.count({
        where: { organizationId, createdAt: { gte: periodStart } },
      }),
      this.prisma.event.findMany({
        where: {
          eventArrangers: { some: { arrangerId } },
          archivedAt: null,
          startDate: { gte: periodStart, lte: now },
        },
        select: {
          id: true,
          urlId: true,
          title: true,
          startDate: true,
          capacity: true,
          createdAt: true,
        },
        orderBy: { startDate: "asc" },
      }),
      this.prisma.arrangerFollower.findMany({
        where: { arrangerId },
        select: { userId: true },
      }),
    ]);

    return {
      followerTotal,
      followerGross30d,
      followerEvents,
      memberTotal,
      memberNewInPeriod,
      events,
      followerRows,
    };
  }

  private async fetchRegistrations(
    events: EventRow[],
  ): Promise<RegistrationRow[]> {
    if (events.length === 0) {
      return [];
    }
    return this.prisma.registration.findMany({
      take: ALL_ROWS,
      where: {
        eventId: { in: events.map((event) => event.id) },
        regStatus: {
          in: [RegStatus.GOING, RegStatus.NOT_GOING, RegStatus.WAITLISTED],
        },
      },
      select: {
        eventId: true,
        userId: true,
        regStatus: true,
        createdAt: true,
      },
    });
  }
}
