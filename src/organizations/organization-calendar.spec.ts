import {
  createOrganizationCalendarIcs,
  getOrganizationCalendarFileName,
} from "./organization-calendar";

describe("organization calendar export", () => {
  it("creates an ICS feed for organization events", () => {
    const ics = createOrganizationCalendarIcs(
      { id: "org-1", urlId: "cyb", name: "CYB" },
      [
        {
          id: "event-1",
          urlId: "lan-party",
          title: "LAN Party",
          description: "Ta med PC",
          startDate: new Date("2026-04-01T18:00:00.000Z"),
          endDate: new Date("2026-04-01T22:00:00.000Z"),
          updatedAt: new Date("2026-03-23T10:00:00.000Z"),
          createdAt: new Date("2026-03-23T10:00:00.000Z"),
          visibility: "PUBLIC",
          hasFood: false,
          featured: false,
          locationName: "Escape",
          freeformAddress: null,
        } as any,
      ],
      "https://peoply.app",
    );

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("X-WR-CALNAME:CYB");
    expect(ics).toContain("SUMMARY:LAN Party");
    expect(ics).toContain("URL:https://peoply.app/events/lan-party");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("escapes a bare carriage return so a title cannot forge a VEVENT", () => {
    const ics = createOrganizationCalendarIcs(
      { id: "org-1", urlId: "cyb", name: "CYB" },
      [
        {
          id: "event-1",
          urlId: "lan-party",
          title: "Fest\rBEGIN:VEVENT\rSUMMARY:AVLYST\rEND:VEVENT",
          description: "x",
          startDate: new Date("2026-04-01T18:00:00.000Z"),
          endDate: new Date("2026-04-01T22:00:00.000Z"),
          updatedAt: new Date("2026-03-23T10:00:00.000Z"),
          createdAt: new Date("2026-03-23T10:00:00.000Z"),
          visibility: "PUBLIC",
          hasFood: false,
          featured: false,
          locationName: "Escape",
          freeformAddress: null,
        } as any,
      ],
      "https://peoply.app",
    );

    const beginVevents = ics
      .split(/\r\n|\r|\n/)
      .filter((line) => line === "BEGIN:VEVENT");
    expect(beginVevents).toHaveLength(1);
    expect(ics).toContain(
      "SUMMARY:Fest\\nBEGIN:VEVENT\\nSUMMARY:AVLYST\\nEND:VEVENT",
    );
  });

  it("creates stable organization calendar file names", () => {
    expect(
      getOrganizationCalendarFileName({
        id: "org-1",
        urlId: "ifi-cyb",
        name: "CYB",
      }),
    ).toBe("ifi-cyb.ics");
  });
});
