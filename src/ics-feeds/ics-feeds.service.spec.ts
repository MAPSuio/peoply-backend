jest.mock("node-ical", () => ({
  sync: {
    parseICS: jest.fn(),
  },
}));

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { IcsFeedsService, toPublicSyncError } from "./ics-feeds.service";

describe("IcsFeedsService", () => {
  const prisma = {
    organizationIcsFeed: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  } as any;
  const organizationsService = {
    findOne: jest.fn(),
  } as any;
  const azureCommunicationService = {} as any;
  const icsFetchService = {
    fetchCalendar: jest.fn(),
  } as any;
  const icsParserService = {
    parse: jest.fn(),
  } as any;

  let service: IcsFeedsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new IcsFeedsService(
      prisma,
      organizationsService,
      azureCommunicationService,
      icsFetchService,
      icsParserService,
    );
  });

  it("validates, stores and triggers sync when subscribing an organization", async () => {
    organizationsService.findOne.mockResolvedValueOnce({ id: "org-1" });
    icsFetchService.fetchCalendar.mockResolvedValueOnce({
      url: "https://example.com/calendar.ics",
      body: "BEGIN:VCALENDAR\r\nEND:VCALENDAR",
    });
    prisma.organizationIcsFeed.upsert.mockResolvedValueOnce({ id: "feed-1" });
    prisma.organizationIcsFeed.findUnique.mockResolvedValueOnce({
      id: "feed-1",
      organizationId: "org-1",
      url: "https://example.com/calendar.ics",
    });

    const syncSpy = jest
      .spyOn(service as any, "syncFeedById")
      .mockResolvedValueOnce(undefined);

    const result = await service.upsertOrganizationFeed("org-1", {
      url: "https://example.com/calendar.ics",
    });

    expect(icsFetchService.fetchCalendar).toHaveBeenCalledWith(
      "https://example.com/calendar.ics",
    );
    expect(icsParserService.parse).toHaveBeenCalledWith(
      "BEGIN:VCALENDAR\r\nEND:VCALENDAR",
    );
    expect(prisma.organizationIcsFeed.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1" },
      }),
    );
    expect(syncSpy).toHaveBeenCalledWith(
      "feed-1",
      "BEGIN:VCALENDAR\r\nEND:VCALENDAR",
    );
    expect(result).toEqual({
      id: "feed-1",
      organizationId: "org-1",
      url: "https://example.com/calendar.ics",
    });
  });

  it("rejects manual sync when the organization has no feed", async () => {
    prisma.organizationIcsFeed.findUnique.mockResolvedValueOnce(null);

    await expect(service.syncOrganizationFeed("org-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("toPublicSyncError", () => {
  // lastSyncError is persisted and returned by GET .../ics-feed, so raw Node
  // network errors would let whoever chose the URL read our network back:
  // refused vs. responding, and internal hostnames out of TLS SAN lists.
  it.each([
    ["connect ECONNREFUSED 10.0.0.5:8443", "a refused connection"],
    [
      "Hostname/IP does not match certificate's altnames: Host: 127.0.0.2. is not in the cert's altnames: DNS:vault.internal.peoply",
      "a certificate mismatch naming internal hosts",
    ],
    ["getaddrinfo ENOTFOUND internal.peoply", "a DNS failure"],
  ])("collapses %p (%s)", (message) => {
    expect(toPublicSyncError(new Error(message))).toBe(
      "Kunne ikke hente kalenderen",
    );
  });

  it("collapses values that are not errors at all", () => {
    expect(toPublicSyncError("boom")).toBe("Kunne ikke hente kalenderen");
    expect(toPublicSyncError(undefined)).toBe("Kunne ikke hente kalenderen");
  });

  // Our own exceptions are strings written for organisers to act on.
  it.each([
    "Only HTTPS ICS URLs are supported",
    "ICS URL points to a blocked address",
    "ICS file exceeds 5 MB",
  ])("keeps our own message %p", (message) => {
    expect(toPublicSyncError(new BadRequestException(message))).toBe(message);
  });
});
