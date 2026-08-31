import { OrganizationsService } from "./organizations.service";
import { MAX_PAGE_SIZE } from "../util/pagination";

describe("OrganizationsService", () => {
  const prisma = {
    organization: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    organizationReport: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    userOrganizationRole: {
      findFirst: jest.fn(),
    },
    /* The cooldown check and the report insert now share one transaction
       behind a row lock on the organization, so the mock has to hand the
       callback a client. Same object: these tests assert on the calls, not on
       transactional isolation. */
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((cb: any) => cb(prisma));
  // undefined is "the request said nothing about the image", which is what
  // these tests send.
  const azureStorageService = {
    swapImage: jest.fn().mockResolvedValue(undefined),
  };
  const discordAlert = {
    send: jest.fn().mockResolvedValue(undefined),
    isConfigured: true,
  };

  let service: OrganizationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    discordAlert.isConfigured = true;
    service = new OrganizationsService(
      prisma as any,
      azureStorageService as any,
      discordAlert as any,
    );
  });

  describe("findByRefOrThrow", () => {
    const storedOrganization = {
      id: "3f2b8c1a-4d5e-4f6a-8b9c-0d1e2f3a4b5c",
      name: "MAPS",
      _count: { organizationRoles: 2 },
    };

    const memberCountAggregate = {
      _count: { select: { organizationRoles: true } },
    };

    it("answers the member count without exposing the member rows", async () => {
      prisma.organization.findUnique.mockResolvedValueOnce(storedOrganization);

      const organization = await service.findByRefOrThrow(
        storedOrganization.id,
      );

      expect(prisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: storedOrganization.id },
        include: memberCountAggregate,
      });
      expect(organization.memberCount).toBe(2);
      expect(organization).not.toHaveProperty("_count");
      expect(organization).not.toHaveProperty("organizationRoles");
    });

    it("counts members when looked up by urlId too", async () => {
      prisma.organization.findUnique.mockResolvedValueOnce({
        ...storedOrganization,
        urlId: "MAPSUIO",
      });

      const organization = await service.findByRefOrThrow("MAPSUIO");

      expect(prisma.organization.findUnique).toHaveBeenCalledWith({
        where: { urlId: "MAPSUIO" },
        include: memberCountAggregate,
      });
      expect(organization.memberCount).toBe(2);
    });
  });

  it("sends organization reports to Discord with everyone mention", async () => {
    prisma.organizationReport.findFirst.mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      firstName: "Ola",
      lastName: "Nordmann",
      email: "ola@example.com",
    });
    await expect(
      service.reportOrganization("user-1", {
        id: "org-1",
        urlId: "maps",
        name: "MAPS",
      } as any),
    ).resolves.toMatchObject({ reported: true });

    expect(prisma.organizationReport.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        userId: "user-1",
      },
    });

    expect(discordAlert.send).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Forening rapportert",
        content: "@everyone",
        fields: expect.arrayContaining([
          {
            name: "Forening",
            value: "MAPS",
            inline: true,
          },
          {
            name: "Rapportert av",
            value: "Ola Nordmann (ola@example.com)",
          },
        ]),
      }),
    );
  });

  it("returns success without Discord when webhook is missing", async () => {
    prisma.organizationReport.findFirst.mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValueOnce(null);
    discordAlert.isConfigured = false;

    await expect(
      service.reportOrganization("user-1", {
        id: "org-1",
        urlId: null,
        name: "Testforening",
      } as any),
    ).resolves.toMatchObject({ reported: true });

    expect(discordAlert.send).not.toHaveBeenCalled();
  });

  it("reports status shows remaining cooldown", async () => {
    const createdAt = new Date(Date.now() - 10 * 60 * 1000);
    prisma.organizationReport.findFirst.mockResolvedValueOnce({ createdAt });

    const result = await service.getOrganizationReportStatus("user-1", "org-1");

    expect(result.canReport).toBe(false);
    expect(result.nextReportAt).not.toBeNull();
    expect(result.remainingSeconds).toBeGreaterThan(0);
  });

  it("blocks duplicate organization reports during cooldown", async () => {
    const createdAt = new Date();
    prisma.organizationReport.findFirst.mockResolvedValueOnce({ createdAt });

    await expect(
      service.reportOrganization("user-1", {
        id: "org-1",
        urlId: null,
        name: "MAPS",
      } as any),
    ).rejects.toThrow(
      "You can only report the same organization once per hour",
    );

    expect(prisma.organizationReport.create).not.toHaveBeenCalled();
    expect(discordAlert.send).not.toHaveBeenCalled();
  });

  it("filters public organization lists to approved organizations", async () => {
    prisma.organization.findMany.mockResolvedValueOnce([]);

    await service.findAll({});

    expect(prisma.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          approved: true,
        }),
      }),
    );
  });

  it("lists all organizations for MAPS admin views", async () => {
    prisma.organization.findMany.mockResolvedValueOnce([]);

    await service.findAllIncludingUnapproved({});

    expect(prisma.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          approved: undefined,
        }),
      }),
    );
  });

  it("updates organization approval", async () => {
    prisma.organization.update.mockResolvedValueOnce({
      id: "org-1",
      approved: false,
    });

    await expect(service.updateApproval("org-1", false)).resolves.toEqual({
      id: "org-1",
      approved: false,
    });

    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: {
        id: "org-1",
      },
      data: {
        approved: false,
      },
    });
  });

  it("normalizes social links before updating organization", async () => {
    prisma.organization.update.mockResolvedValueOnce({
      id: "org-1",
      websiteUrl: null,
      instagramUrl: "https://instagram.com/maps",
    });

    await service.update(
      {
        id: "org-1",
        image: null,
      } as any,
      {
        websiteUrl: "   ",
        instagramUrl: " https://instagram.com/maps ",
      } as any,
    );

    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: {
        websiteUrl: null,
        instagramUrl: "https://instagram.com/maps",
      },
    });
  });

  describe("the image and its colors", () => {
    const updatedWith = () => prisma.organization.update.mock.calls[0][0].data;

    it("stores the colors of the logo it just uploaded", async () => {
      azureStorageService.swapImage.mockResolvedValueOnce({
        image: "https://blob/organization-images/maps.png",
        colors: { primary: "#e62239", accent: "#0ca3b1" },
      });
      prisma.organization.update.mockResolvedValueOnce({ id: "org-1" });

      await service.update({ id: "org-1", image: null } as any, {} as any);

      expect(updatedWith()).toEqual({
        image: "https://blob/organization-images/maps.png",
        imagePrimaryColor: "#e62239",
        imageAccentColor: "#0ca3b1",
      });
    });

    it("clears the colors along with the logo they came from", async () => {
      azureStorageService.swapImage.mockResolvedValueOnce({
        image: null,
        colors: null,
      });
      prisma.organization.update.mockResolvedValueOnce({ id: "org-1" });

      await service.update({ id: "org-1", image: "old.png" } as any, {} as any);

      expect(updatedWith()).toEqual({
        image: null,
        imagePrimaryColor: null,
        imageAccentColor: null,
      });
    });

    it("leaves all three alone when the request said nothing about the logo", async () => {
      prisma.organization.update.mockResolvedValueOnce({ id: "org-1" });

      await service.update(
        { id: "org-1", image: "kept.png" } as any,
        {} as any,
      );

      expect(updatedWith()).toEqual({});
    });

    it("keeps a logo that yielded no color from carrying the previous one's", async () => {
      azureStorageService.swapImage.mockResolvedValueOnce({
        image: "https://blob/organization-images/greyscale.png",
        colors: null,
      });
      prisma.organization.update.mockResolvedValueOnce({ id: "org-1" });

      await service.update({ id: "org-1", image: "old.png" } as any, {} as any);

      expect(updatedWith()).toEqual({
        image: "https://blob/organization-images/greyscale.png",
        imagePrimaryColor: null,
        imageAccentColor: null,
      });
    });
  });

  describe("findOrgsByUserIdAndRole", () => {
    const someFilter = () =>
      prisma.organization.findMany.mock.calls[0][0].where.organizationRoles
        .some;

    it("filters on the role when one is given", async () => {
      prisma.organization.findMany.mockResolvedValueOnce([]);

      await service.findOrgsByUserIdAndRole("user-1", "ADMIN" as any);

      expect(someFilter()).toEqual({ userId: "user-1", role: "ADMIN" });
    });

    it("passes role through as undefined when none is given", async () => {
      prisma.organization.findMany.mockResolvedValueOnce([]);

      await service.findOrgsByUserIdAndRole("user-1");

      // Prisma drops undefined fields from a where clause, so this is the
      // same query as omitting `role` entirely — which is what lets the two
      // hand-built filter objects collapse into one.
      expect(someFilter()).toEqual({ userId: "user-1", role: undefined });
      expect(someFilter().role).toBeUndefined();
    });

    it("asks the database for the page rather than every row", async () => {
      prisma.organization.findMany.mockResolvedValueOnce([]);

      await service.findOrgsByUserIdAndRole("user-1", undefined, {
        skip: 10,
        take: 5,
      });

      expect(prisma.organization.findMany.mock.calls[0][0]).toMatchObject({
        skip: 10,
        take: 5,
        /* Two organizations may share a name, so the page order needs the
           primary key as well or one of them can be served on two pages. */
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
    });

    it("bounds the page at the row cap when the caller sent none", async () => {
      prisma.organization.findMany.mockResolvedValueOnce([]);

      await service.findOrgsByUserIdAndRole("user-1");

      expect(prisma.organization.findMany.mock.calls[0][0]).toMatchObject({
        skip: 0,
        take: MAX_PAGE_SIZE,
      });
    });
  });
});
