jest.mock("../threat-detection/discord-webhook", () => ({
  postDiscordWebhook: jest.fn(),
}));

import { OrganizationsService } from "./organizations.service";
import { postDiscordWebhook } from "../threat-detection/discord-webhook";

describe("OrganizationsService", () => {
  const prisma = {
    organization: {
      findMany: jest.fn(),
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
  const config = {
    get: jest.fn(),
  };

  let service: OrganizationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrganizationsService(
      prisma as any,
      azureStorageService as any,
      config as any,
    );
  });

  it("sends organization reports to Discord with everyone mention", async () => {
    prisma.organizationReport.findFirst.mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      firstName: "Ola",
      lastName: "Nordmann",
      email: "ola@example.com",
    });
    config.get.mockReturnValueOnce("https://discord.example/webhook");
    (postDiscordWebhook as jest.Mock).mockResolvedValueOnce({
      statusCode: 204,
      body: "",
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

    expect(postDiscordWebhook).toHaveBeenCalledWith(
      "https://discord.example/webhook",
      expect.any(String),
    );

    const payload = JSON.parse(
      (postDiscordWebhook as jest.Mock).mock.calls[0][1],
    );

    expect(payload).toMatchObject({
      content: "@everyone",
      allowed_mentions: {
        parse: ["everyone"],
      },
      embeds: [
        {
          title: "Forening rapportert",
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
        },
      ],
    });
  });

  it("returns success without Discord when webhook is missing", async () => {
    prisma.organizationReport.findFirst.mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValueOnce(null);
    config.get.mockReturnValueOnce(undefined);

    await expect(
      service.reportOrganization("user-1", {
        id: "org-1",
        urlId: null,
        name: "Testforening",
      } as any),
    ).resolves.toMatchObject({ reported: true });

    expect(postDiscordWebhook).not.toHaveBeenCalled();
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
    expect(postDiscordWebhook).not.toHaveBeenCalled();
  });

  it("filters public organization lists to approved organizations", async () => {
    prisma.organization.findMany.mockResolvedValueOnce([]);

    await service.findAll({}, 0, 10);

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

    await service.findAllIncludingUnapproved({}, 0, 10);

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
  });
});
