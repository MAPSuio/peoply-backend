import { BadRequestException, Injectable } from "@nestjs/common";
import * as ical from "node-ical";
import { VEvent } from "node-ical";

const MAX_EVENTS_PER_SYNC = 500;
const DEFAULT_EVENT_DURATION_MS = 60 * 60 * 1000;
const WINDOW_MONTHS = 12;

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

    const parsedEvents = vevents
      .reduce<ParsedIcsEvent[]>(
        (events, entry) =>
          events.concat(this.expandEvent(entry, windowStart, windowEnd)),
        [],
      )
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

  private expandEvent(event: VEvent, windowStart: Date, windowEnd: Date) {
    if (event.status === "CANCELLED") {
      return [] as ParsedIcsEvent[];
    }

    if (!event.summary || !event.start) {
      return [] as ParsedIcsEvent[];
    }

    if (!event.rrule) {
      const normalized = this.normalizeOccurrence(
        event,
        event.start,
        event.end,
      );
      return normalized && normalized.startDate <= windowEnd
        ? [normalized]
        : [];
    }

    const recurrences = Object.values(event.recurrences ?? {});
    const dates = event.rrule.between(windowStart, windowEnd, true);

    return dates
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
