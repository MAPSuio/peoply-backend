import { BadRequestException, Injectable } from "@nestjs/common";
import * as ical from "node-ical";
import { VEvent } from "node-ical";

const MAX_EVENTS_PER_SYNC = 500;
const DEFAULT_EVENT_DURATION_MS = 60 * 60 * 1000;
const WINDOW_MONTHS = 12;

/**
 * Hard ceiling on how many recurrence occurrences the whole calendar may
 * expand to, across every VEVENT in it.
 *
 * MAX_EVENTS_PER_SYNC bounds the *result*, and used to be checked after the
 * expansion had already run - so it bounded nothing an attacker cared about.
 * `RRULE:FREQ=MINUTELY` over the 12-month window is 525,481 occurrences from a
 * 231-byte file, and rrule expands synchronously: measured at 46 seconds of
 * blocked event loop on this dependency set. `FREQ=SECONDLY` does not finish.
 *
 * This is deliberately well above MAX_EVENTS_PER_SYNC so that a calendar which
 * could legitimately pass the 500-event cap is never cut short by it - a feed
 * would have to have 90% of its occurrences excluded by EXDATE to notice.
 * Hitting this ceiling is rejected, not truncated.
 */
const MAX_OCCURRENCES_PER_SYNC = 10 * MAX_EVENTS_PER_SYNC;

export interface ParsedIcsEvent {
  externalId: string;
  title: string;
  description: string;
  locationName: string;
  startDate: Date;
  endDate: Date;
  externalUpdatedAt?: Date;
  externalUrl?: string;
}

@Injectable()
export class IcsParserService {
  parse(body: string, now = new Date()): ParsedIcsEvent[] {
    let calendar: ical.CalendarResponse;

    try {
      calendar = ical.sync.parseICS(body);
    } catch {
      throw new BadRequestException("Could not parse ICS calendar");
    }

    const windowStart = now;
    const windowEnd = new Date(now);
    windowEnd.setMonth(windowEnd.getMonth() + WINDOW_MONTHS);

    const vevents = Object.values(calendar)
      .filter((entry): entry is VEvent => entry.type === "VEVENT")
      .filter((entry) => !entry.recurrenceid);

    // Spent across every VEVENT, so a calendar cannot get around the ceiling
    // by splitting one huge RRULE into many smaller ones.
    let remainingOccurrences = MAX_OCCURRENCES_PER_SYNC;
    const expanded: ParsedIcsEvent[] = [];

    for (const entry of vevents) {
      const { events, occurrences } = this.expandEvent(
        entry,
        windowStart,
        windowEnd,
        remainingOccurrences,
      );

      expanded.push(...events);
      remainingOccurrences -= occurrences;

      if (remainingOccurrences <= 0) {
        throw new BadRequestException(
          `ICS calendar exceeds ${MAX_EVENTS_PER_SYNC} events per sync`,
        );
      }
    }

    const parsedEvents = expanded
      .filter((entry) => entry.startDate >= windowStart)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    if (!parsedEvents.length && !body.includes("VEVENT")) {
      throw new BadRequestException("ICS calendar does not contain any events");
    }

    if (parsedEvents.length > MAX_EVENTS_PER_SYNC) {
      throw new BadRequestException("ICS calendar exceeds 500 events per sync");
    }

    return parsedEvents;
  }

  private expandEvent(
    event: VEvent,
    windowStart: Date,
    windowEnd: Date,
    maxOccurrences: number,
  ): { events: ParsedIcsEvent[]; occurrences: number } {
    if (event.status === "CANCELLED") {
      return { events: [], occurrences: 0 };
    }

    if (!event.summary || !event.start) {
      return { events: [], occurrences: 0 };
    }

    if (!event.rrule) {
      const normalized = this.normalizeOccurrence(
        event,
        event.start,
        event.end,
      );
      return {
        events:
          normalized && normalized.startDate <= windowEnd ? [normalized] : [],
        // A plain VEVENT still costs one, so a calendar of 40,000 of them is
        // bounded by the same ceiling.
        occurrences: 1,
      };
    }

    const recurrences = Object.values(event.recurrences ?? {});

    // The iterator form stops rrule mid-expansion. Without it the full
    // occurrence set is materialised before anything gets to reject it.
    const dates: Date[] = [];
    event.rrule.between(windowStart, windowEnd, true, (date) => {
      dates.push(date);
      return dates.length < maxOccurrences;
    });

    const events = dates
      .filter((date) => !this.isExcludedDate(event, date))
      .map((date) => {
        const override = recurrences.find((recurrence) => {
          if (!recurrence.recurrenceid) {
            return false;
          }

          return new Date(recurrence.recurrenceid).getTime() === date.getTime();
        });

        const sourceEvent = override ?? event;
        return this.normalizeOccurrence(
          sourceEvent,
          date,
          sourceEvent.end ?? event.end,
        );
      })
      .filter((value): value is ParsedIcsEvent => Boolean(value));

    // Charge the raw occurrence count, not the surviving events: expanding is
    // the work being bounded, and EXDATE must not buy an attacker more of it.
    return { events, occurrences: dates.length };
  }

  private isExcludedDate(event: VEvent, date: Date) {
    if (!event.exdate) {
      return false;
    }

    return Object.values(event.exdate).some((value) => {
      if (!(value instanceof Date)) {
        return false;
      }

      return value.getTime() === date.getTime();
    });
  }

  private normalizeOccurrence(
    event: VEvent,
    startDate: Date,
    endDate?: Date,
  ): ParsedIcsEvent | null {
    const start = new Date(startDate);
    const baseStart = new Date(event.start);
    const baseEnd = event.end ? new Date(event.end) : undefined;
    const durationMs = baseEnd
      ? Math.max(baseEnd.getTime() - baseStart.getTime(), 0)
      : DEFAULT_EVENT_DURATION_MS;

    const end = endDate
      ? new Date(endDate)
      : new Date(start.getTime() + durationMs);

    if (!event.uid || !event.summary) {
      return null;
    }

    const normalizedDescription = (event.description ?? "")
      .replace(/<[^>]*>/g, "")
      .trim();

    return {
      externalId: event.rrule
        ? `${event.uid}::${start.toISOString()}`
        : event.uid,
      title: event.summary.trim(),
      description: normalizedDescription,
      locationName: (event.location ?? "").trim() || "Ikke oppgitt",
      startDate: start,
      endDate: end,
      externalUpdatedAt: event.lastmodified
        ? new Date(event.lastmodified)
        : undefined,
      externalUrl: event.url?.trim() || undefined,
    };
  }
}
