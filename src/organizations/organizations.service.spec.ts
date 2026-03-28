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
    user: {
      findUnique: jest.fn(),
    },
    userOrganizationRole: {
      findFirst: jest.fn(),
    },
  };
  const azureStorageService = {};
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
    ).resolves.toEqual({ reported: true });

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
    prisma.user.findUnique.mockResolvedValueOnce(null);
    config.get.mockReturnValueOnce(undefined);

    await expect(
      service.reportOrganization("user-1", {
        id: "org-1",
        urlId: null,
        name: "Testforening",
      } as any),
    ).resolves.toEqual({ reported: true });

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
});
