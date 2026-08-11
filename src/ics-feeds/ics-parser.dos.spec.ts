import { BadRequestException } from "@nestjs/common";
import { IcsParserService } from "./ics-parser.service";

/**
 * Deliberately does NOT mock node-ical, unlike ics-parser.service.spec.ts.
 *
 * The vulnerability this covers was in how the parser drives the real rrule
 * library - it called `between()` without an iterator, so the whole occurrence
 * set was materialised before any cap could reject it. A mocked rrule cannot
 * demonstrate that, because the cost is the library's, not ours.
 *
 * Measured against node-ical 0.20.1 before the fix: 46 seconds of blocked
 * event loop and 125 MB of heap, from the 231-byte payload below. The API
 * process serves nothing during that time, and the 5-minute sync cron replays
 * it forever once the feed URL is stored.
 */

const NOW = new Date("2026-03-23T00:00:00.000Z");

function icsWithRule(rule: string) {
  const stamp = "20260323T000000Z";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//x//x//EN",
    "BEGIN:VEVENT",
    "UID:boom@evil.test",
    `DTSTAMP:${stamp}`,
    `DTSTART:${stamp}`,
    `DTEND:${stamp}`,
    "SUMMARY:boom",
    `RRULE:${rule}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

describe("IcsParserService (real node-ical)", () => {
  const service = new IcsParserService();

  it.each([
    ["FREQ=MINUTELY;INTERVAL=1", 525_481],
    ["FREQ=HOURLY;INTERVAL=1", 8_761],
  ])("rejects RRULE:%s quickly instead of expanding it", (rule) => {
    const body = icsWithRule(rule);
    const startedAt = Date.now();

    expect(() => service.parse(body, NOW)).toThrow(BadRequestException);

    // The bounded parse takes single-digit milliseconds; the unbounded one
    // took 46,000. The threshold sits far above the former and far below the
    // latter on purpose - jest runs suites in parallel, and a tight bound
    // flakes under CPU contention rather than reporting anything real.
    expect(Date.now() - startedAt).toBeLessThan(10_000);
  });

  it("still parses an ordinary weekly calendar", () => {
    const events = service.parse(icsWithRule("FREQ=WEEKLY;COUNT=10"), NOW);

    expect(events).toHaveLength(10);
    expect(events[0].title).toBe("boom");
  });
});
