import { EventVisibility, RegStatus } from "../generated/prisma/client";
import { RecommendationsService } from "./recommendations.service";

const candidateEvent = (
  id: string,
  {
    categoryIds = [] as number[],
    arrangerIds = [] as string[],
    registrations = 0,
    featured = false,
    startDate = new Date("2026-08-01T18:00:00Z"),
  } = {},
) => ({
  id,
  featured,
  startDate,
  eventCategories: categoryIds.map((categoryId) => ({
    categoryId,
    category: { name: `category-${categoryId}` },
  })),
  eventArrangers: arrangerIds.map((arrangerId) => ({ arrangerId })),
  _count: { registrations },
});

const candidateOrg = (
  id: string,
  arrangerId: string,
  { followers = 0, eventCategoryIds = [] as number[][] } = {},
) => ({
  id,
  arrangerId,
  name: `org-${id}`,
  arranger: {
    _count: { arrangerFollowers: followers },
    eventArrangers: eventCategoryIds.map((categoryIds) => ({
      event: {
        archivedAt: null,
        visibility: EventVisibility.PUBLIC,
        eventCategories: categoryIds.map((categoryId) => ({ categoryId })),
      },
    })),
  },
});

const attendedEvent = (
  eventId: string,
  categoryIds: number[],
  arrangerIds: string[] = [],
) => ({
  eventId,
  regStatus: RegStatus.GOING,
  event: {
    eventCategories: categoryIds.map((categoryId) => ({ categoryId })),
    eventArrangers: arrangerIds.map((arrangerId) => ({ arrangerId })),
  },
});

describe("RecommendationsService", () => {
  const prisma = {
    event: { findMany: jest.fn() },
    organization: { findMany: jest.fn() },
    registration: { findMany: jest.fn() },
    favorite: { findMany: jest.fn() },
    arrangerFollower: { findMany: jest.fn() },
    userOrganizationRole: { findMany: jest.fn() },
  } as any;
  let service: RecommendationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.registration.findMany.mockResolvedValue([]);
    prisma.favorite.findMany.mockResolvedValue([]);
    prisma.arrangerFollower.findMany.mockResolvedValue([]);
    prisma.userOrganizationRole.findMany.mockResolvedValue([]);
    service = new RecommendationsService(prisma);
  });

  describe("recommendEvents", () => {
    it("ranks anonymous visitors by popularity without reading history", async () => {
      prisma.event.findMany.mockResolvedValueOnce([
        candidateEvent("quiet"),
        candidateEvent("popular", { registrations: 50 }),
        candidateEvent("promoted", { featured: true }),
      ]);

      const events = await service.recommendEvents(undefined);

      expect(events.map((event: any) => event.id)).toEqual([
        "popular",
        "promoted",
        "quiet",
      ]);
      expect(prisma.registration.findMany).not.toHaveBeenCalled();
    });

    it("ranks events sharing categories and arrangers with attended events first", async () => {
      prisma.registration.findMany.mockResolvedValueOnce([
        attendedEvent("past-1", [1], ["arranger-a"]),
        attendedEvent("past-2", [1]),
      ]);
      prisma.event.findMany.mockResolvedValueOnce([
        candidateEvent("unrelated", { registrations: 40 }),
        candidateEvent("same-category", { categoryIds: [1] }),
        candidateEvent("same-arranger-and-category", {
          categoryIds: [1],
          arrangerIds: ["arranger-a"],
        }),
      ]);

      const events = await service.recommendEvents("user-1");

      expect(events.map((event: any) => event.id)).toEqual([
        "same-arranger-and-category",
        "same-category",
        "unrelated",
      ]);
    });

    it("never recommends events the user already registered for or favorited", async () => {
      prisma.registration.findMany.mockResolvedValueOnce([
        attendedEvent("registered", [1]),
      ]);
      prisma.favorite.findMany.mockResolvedValueOnce([
        {
          eventId: "favorited",
          event: { eventCategories: [], eventArrangers: [] },
        },
      ]);
      prisma.event.findMany.mockResolvedValueOnce([
        candidateEvent("registered", { categoryIds: [1] }),
        candidateEvent("favorited"),
        candidateEvent("fresh"),
      ]);

      const events = await service.recommendEvents("user-1");

      expect(events.map((event: any) => event.id)).toEqual(["fresh"]);
    });

    it("respects take and strips the scoring-only registration count", async () => {
      prisma.event.findMany.mockResolvedValueOnce([
        candidateEvent("a", { registrations: 3 }),
        candidateEvent("b", { registrations: 2 }),
        candidateEvent("c", { registrations: 1 }),
      ]);

      const events = await service.recommendEvents(undefined, 2);

      expect(events).toHaveLength(2);
      expect(events[0]).not.toHaveProperty("_count");
    });
  });

  describe("recommendOrganizations", () => {
    it("ranks organizations whose events match the user's categories above merely popular ones", async () => {
      prisma.registration.findMany.mockResolvedValueOnce([
        attendedEvent("past-1", [7]),
      ]);
      prisma.organization.findMany.mockResolvedValueOnce([
        candidateOrg("popular", "arranger-p", { followers: 30 }),
        candidateOrg("matching", "arranger-m", {
          eventCategoryIds: [[7], [7]],
        }),
      ]);

      const orgs = await service.recommendOrganizations("user-1");

      expect(orgs.map((org: any) => org.id)).toEqual(["matching", "popular"]);
      expect(orgs[0]).not.toHaveProperty("arranger");
    });

    it("never recommends organizations the user follows or is a member of", async () => {
      prisma.arrangerFollower.findMany.mockResolvedValueOnce([
        { arrangerId: "arranger-followed" },
      ]);
      prisma.userOrganizationRole.findMany.mockResolvedValueOnce([
        { organization: { arrangerId: "arranger-member" } },
      ]);
      prisma.organization.findMany.mockResolvedValueOnce([
        candidateOrg("followed", "arranger-followed", { followers: 10 }),
        candidateOrg("member", "arranger-member"),
        candidateOrg("fresh", "arranger-fresh"),
      ]);

      const orgs = await service.recommendOrganizations("user-1");

      expect(orgs.map((org: any) => org.id)).toEqual(["fresh"]);
    });

    it("ranks anonymous visitors by follower count", async () => {
      prisma.organization.findMany.mockResolvedValueOnce([
        candidateOrg("small", "arranger-s", { followers: 1 }),
        candidateOrg("large", "arranger-l", { followers: 25 }),
      ]);

      const orgs = await service.recommendOrganizations(undefined);

      expect(orgs.map((org: any) => org.id)).toEqual(["large", "small"]);
    });
  });
});
