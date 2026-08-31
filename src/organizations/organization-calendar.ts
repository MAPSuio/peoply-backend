interface CalendarEvent {
  id: string;
  urlId: string;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date | null;
  updatedAt: Date;
  locationName: string;
  freeformAddress: string | null;
}

interface CalendarOrganization {
  id: string;
  urlId: string | null;
  name: string;
}

function escapeIcsText(value?: string | null) {
  if (!value) {
    return "";
  }

  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function formatIcsDate(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function getEventUrl(
  event: Pick<CalendarEvent, "id" | "urlId">,
  frontendUrl?: string,
) {
  const eventSlug = event.urlId || event.id;

  if (!frontendUrl || !eventSlug) {
    return "";
  }

  return `${frontendUrl.replace(/\/$/, "")}/events/${eventSlug}`;
}

function getEventDescription(event: CalendarEvent, frontendUrl?: string) {
  const parts = [event.description, getEventUrl(event, frontendUrl)].filter(
    Boolean,
  );
  return parts.join("\n\n");
}

export function createOrganizationCalendarIcs(
  organization: Pick<CalendarOrganization, "id" | "urlId" | "name">,
  events: CalendarEvent[],
  frontendUrl?: string,
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Peoply//Organization Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(organization.name)}`,
    `X-WR-CALDESC:${escapeIcsText(
      `Arrangementer fra ${organization.name} på Peoply`,
    )}`,
  ];

  for (const event of events) {
    const startDate = new Date(event.startDate);
    const endDate = event.endDate
      ? new Date(event.endDate)
      : new Date(startDate.getTime() + 60 * 60 * 1000);
    const eventUrl = getEventUrl(event, frontendUrl);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(`${event.id}@peoply.app`)}`,
      `DTSTAMP:${formatIcsDate(event.updatedAt ?? new Date())}`,
      `DTSTART:${formatIcsDate(startDate)}`,
      `DTEND:${formatIcsDate(endDate)}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      `DESCRIPTION:${escapeIcsText(getEventDescription(event, frontendUrl))}`,
      `LOCATION:${escapeIcsText(
        event.freeformAddress || event.locationName || "",
      )}`,
      `URL:${eventUrl}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  return `${lines.join("\r\n")}\r\n`;
}

export function getOrganizationCalendarFileName(
  organization: Pick<CalendarOrganization, "name" | "urlId" | "id">,
) {
  const base = (organization.urlId || organization.name || organization.id)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${base || "organization"}.ics`;
}
