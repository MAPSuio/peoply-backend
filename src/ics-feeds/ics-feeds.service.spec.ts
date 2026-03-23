jest.mock("node-ical", () => ({
  sync: {
    parseICS: jest.fn(),
  },
}));

import { NotFoundException } from "@nestjs/common";
import { IcsFeedsService } from "./ics-feeds.service";

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
