import { AnalyticsPeriod } from "./organization-analytics.query";

/** Aggregates only: the payload is served to every org role (including
 *  MEMBER), so it must never carry user ids or other per-user data. */
export interface OrganizationAnalyticsEventItem {
  id: string;
  urlId: string;
  title: string;
  startDate: string;
  capacity: number | null;
  goingCount: number;
  waitlistedCount: number;
  /** goingCount / capacity; null when the event has no capacity. */
  fillRate: number | null;
}

export type TimeOfDayBucket = "MORNING" | "AFTERNOON" | "EVENING";

export interface OrganizationAnalyticsResponse {
  generatedAt: string;
  /** The window every period-scoped number below was computed over. */
  period: AnalyticsPeriod;
  followers: {
    total: number;
    /** Net change (follows minus unfollows) from the append-only event log.
     *  Accurate from the log's deploy date onward. */
    net24h: number;
    net7d: number;
    net30d: number;
    /** Net change inside the requested period. */
    netPeriod: number;
    /** New follows the last 30 days, from ArrangerFollower.createdAt —
     *  covers history from before the event log existed. */
    gross30d: number;
    /** One net-per-day entry per day in the period, zero-filled, ascending,
     *  UTC dates. */
    dailyNet: { date: string; net: number }[];
  };
  members: { total: number; newInPeriod: number };
  events: {
    /** Events from the last 12 months, ascending by startDate. */
    items: OrganizationAnalyticsEventItem[];
    totalGoing: number;
    totalWaitlisted: number;
    averageGoing: number | null;
    /** Mean fillRate over events with a capacity. */
    averageFillRate: number | null;
    /** Share of capacity events where going reached capacity. */
    soldOutRate: number | null;
    /** Median of (going + waitlisted) per event. */
    medianDemand: number | null;
    /** Median days between a GOING signup and the event start. */
    medianSignupLeadDays: number | null;
    /** Share of GOING signups made within 48h of the event start. */
    lastMinuteShare: number | null;
    /** Median days between event creation and its start. */
    medianPublishLeadDays: number | null;
    /** NOT_GOING / (GOING + NOT_GOING). */
    dropoutRate: number | null;
    /** All 7 buckets, weekday 0 = Monday .. 6 = Sunday, Europe/Oslo time. */
    byWeekday: { weekday: number; averageGoing: number; eventCount: number }[];
    /** All 3 buckets in MORNING/AFTERNOON/EVENING order, Europe/Oslo time. */
    byTimeOfDay: {
      bucket: TimeOfDayBucket;
      averageGoing: number;
      eventCount: number;
    }[];
  };
  audience: {
    /** Distinct users with at least one GOING registration in the period. */
    uniqueAttendees: number;
    /** Share of unique attendees with 2+ GOING registrations. */
    returningAttendeeRate: number | null;
    /** Users with 3+ GOING registrations in the period. */
    coreAudienceCount: number;
    /** Share of unique attendees who follow the arranger. */
    attendeeFollowerRate: number | null;
  };
}
