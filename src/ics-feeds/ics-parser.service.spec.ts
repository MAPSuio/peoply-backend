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
        rrule: {
          between: jest
            .fn()
            .mockReturnValue([
              new Date("2026-04-01T18:00:00.000Z"),
              new Date("2026-04-08T18:00:00.000Z"),
              new Date("2026-04-15T18:00:00.000Z"),
            ]),
        },
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
