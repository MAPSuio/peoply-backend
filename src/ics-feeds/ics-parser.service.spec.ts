jest.mock("node-ical", () => ({
  sync: {
    parseICS: jest.fn(),
  },
}));

import { BadRequestException } from "@nestjs/common";
import * as ical from "node-ical";
import { IcsParserService } from "./ics-parser.service";

describe("IcsParserService", () => {
  let service: IcsParserService;

  /**
   * Mirrors rrule's `between(after, before, inc, iterator)`: the iterator is
   * called per occurrence and returning false stops the expansion. The parser
   * relies on that to bound the work, so a mock that only returns an array
   * would not exercise the thing under test.
   */
  const rruleOver = (dates: Date[]) => ({
    between: jest.fn(
      (
        _after: Date,
        _before: Date,
        _inc: boolean,
        iterator?: (date: Date, index: number) => boolean,
      ) => {
        const emitted: Date[] = [];
        for (const date of dates) {
          if (iterator && !iterator(date, emitted.length)) break;
          emitted.push(date);
        }
        return emitted;
      },
    ),
  });

  /** An RRULE that never stops on its own - the abusive case. */
  const infiniteRrule = () => ({
    between: jest.fn(
      (
        _after: Date,
        _before: Date,
        _inc: boolean,
        iterator?: (date: Date, index: number) => boolean,
      ) => {
        const emitted: Date[] = [];
        for (let i = 0; ; i++) {
          const date = new Date(Date.UTC(2026, 3, 1) + i * 60_000);
          if (iterator && !iterator(date, i)) break;
          emitted.push(date);
          // Without the iterator bound this would run to 525,481. Cap the
          // fake far above the parser's ceiling so an unbounded parser fails
          // the test rather than hanging it.
          if (i > 50_000) throw new Error("parser did not bound the expansion");
        }
        return emitted;
      },
    ),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new IcsParserService();
  });

  it("parses a simple ICS event and strips HTML", () => {
    (ical.sync.parseICS as jest.Mock).mockReturnValueOnce({
      event1: {
        type: "VEVENT",
        uid: "event-1@example.com",
        summary: "Testevent",
        description: "<p>Hei</p><br/>Verden",
        start: new Date("2026-04-01T18:00:00.000Z"),
        end: new Date("2026-04-01T20:00:00.000Z"),
        location: "Escape",
        url: "https://example.com/event-1",
        lastmodified: new Date("2026-03-23T12:00:00.000Z"),
      },
    });

    const result = service.parse(
      "BEGIN:VCALENDAR\r\nEND:VCALENDAR",
      new Date("2026-03-23T00:00:00.000Z"),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      externalId: "event-1@example.com",
      title: "Testevent",
      description: "HeiVerden",
      locationName: "Escape",
      externalUrl: "https://example.com/event-1",
    });
    expect(result[0].startDate.toISOString()).toBe("2026-04-01T18:00:00.000Z");
    expect(result[0].endDate.toISOString()).toBe("2026-04-01T20:00:00.000Z");
    expect(result[0].externalUpdatedAt?.toISOString()).toBe(
      "2026-03-23T12:00:00.000Z",
    );
  });

  it("expands recurring events into unique occurrences", () => {
    (ical.sync.parseICS as jest.Mock).mockReturnValueOnce({
      recurring: {
        type: "VEVENT",
        uid: "weekly-event@example.com",
        summary: "Styremote",
        start: new Date("2026-04-01T18:00:00.000Z"),
        end: new Date("2026-04-01T19:00:00.000Z"),
        rrule: rruleOver([
          new Date("2026-04-01T18:00:00.000Z"),
          new Date("2026-04-08T18:00:00.000Z"),
          new Date("2026-04-15T18:00:00.000Z"),
        ]),
      },
    });

    const result = service.parse(
      "BEGIN:VCALENDAR\r\nEND:VCALENDAR",
      new Date("2026-03-23T00:00:00.000Z"),
    );

    expect(result).toHaveLength(3);
    expect(result.map((event) => event.externalId)).toEqual([
      "weekly-event@example.com::2026-04-01T18:00:00.000Z",
      "weekly-event@example.com::2026-04-08T18:00:00.000Z",
      "weekly-event@example.com::2026-04-15T18:00:00.000Z",
    ]);
  });

  // A 231-byte file with RRULE:FREQ=MINUTELY expands to 525,481 occurrences
  // over the 12-month window. rrule expands synchronously, so that was 46
  // seconds of blocked event loop - and the 5-minute sync cron replayed it
  // forever after a single PUT.
  it("rejects an RRULE that expands past the occurrence ceiling", () => {
    (ical.sync.parseICS as jest.Mock).mockReturnValueOnce({
      boom: {
        type: "VEVENT",
        uid: "boom@evil.test",
        summary: "boom",
        start: new Date("2026-04-01T18:00:00.000Z"),
        end: new Date("2026-04-01T19:00:00.000Z"),
        rrule: infiniteRrule(),
      },
    });

    expect(() =>
      service.parse(
        "BEGIN:VCALENDAR\r\nEND:VCALENDAR",
        new Date("2026-03-23T00:00:00.000Z"),
      ),
    ).toThrow(BadRequestException);
  });

  // Splitting one abusive RRULE across many VEVENTs must not buy more budget.
  it("spends the occurrence ceiling across every VEVENT", () => {
    const dates = Array.from(
      { length: 400 },
      (_, i) => new Date(Date.UTC(2026, 3, 1) + i * 86_400_000),
    );

    (ical.sync.parseICS as jest.Mock).mockReturnValueOnce(
      Object.fromEntries(
        Array.from({ length: 20 }, (_, i) => [
          `event-${i}`,
          {
            type: "VEVENT",
            uid: `event-${i}@evil.test`,
            summary: "spread",
            start: new Date("2026-04-01T18:00:00.000Z"),
            end: new Date("2026-04-01T19:00:00.000Z"),
            rrule: rruleOver(dates),
          },
        ]),
      ),
    );

    expect(() =>
      service.parse(
        "BEGIN:VCALENDAR\r\nEND:VCALENDAR",
        new Date("2026-03-23T00:00:00.000Z"),
      ),
    ).toThrow(BadRequestException);
  });

  // The ceiling sits ten times above the event cap, so a calendar that could
  // legitimately pass the 500-event limit is never cut short by it.
  it("still accepts a calendar just under the event cap", () => {
    const dates = Array.from(
      { length: 499 },
      (_, i) => new Date(Date.UTC(2026, 3, 1) + i * 86_400_000),
    );

    (ical.sync.parseICS as jest.Mock).mockReturnValueOnce({
      busy: {
        type: "VEVENT",
        uid: "busy@example.com",
        summary: "Daglig",
        start: new Date("2026-04-01T18:00:00.000Z"),
        end: new Date("2026-04-01T19:00:00.000Z"),
        rrule: rruleOver(dates),
      },
    });

    expect(
      service.parse(
        "BEGIN:VCALENDAR\r\nEND:VCALENDAR",
        new Date("2026-03-23T00:00:00.000Z"),
      ),
    ).toHaveLength(499);
  });

  it("rejects invalid ICS payloads", () => {
    (ical.sync.parseICS as jest.Mock).mockImplementationOnce(() => {
      throw new Error("boom");
    });

    expect(() => service.parse("not-an-ics-file")).toThrow(BadRequestException);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "not-a-url",
  ])("drops a remote URL of %s rather than storing it", (url) => {
    /* The frontend hands externalUrl to window.open, and this value is
       written by whoever owns the remote calendar. Dropped rather than
       rejected - one bad URL must not fail the whole feed sync. */
    (ical.sync.parseICS as jest.Mock).mockReturnValueOnce({
      event1: {
        type: "VEVENT",
        uid: "event-1@example.com",
        summary: "Testevent",
        start: new Date("2026-04-01T18:00:00.000Z"),
        end: new Date("2026-04-01T20:00:00.000Z"),
        url,
      },
    });

    const result = service.parse(
      "BEGIN:VCALENDAR\r\nEND:VCALENDAR",
      new Date("2026-03-23T00:00:00.000Z"),
    );

    expect(result).toHaveLength(1);
    expect(result[0].externalUrl).toBeUndefined();
  });
});
