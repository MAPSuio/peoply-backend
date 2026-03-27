import { HttpStatus } from "@nestjs/common";
import { FeedbackService, FEEDBACK_COOLDOWN_MS } from "./feedback.service";

jest.mock("../threat-detection/discord-webhook", () => ({
  postDiscordWebhook: jest.fn(),
}));

import { postDiscordWebhook } from "../threat-detection/discord-webhook";

describe("FeedbackService", () => {
  const prisma = {
    feedback: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
  const config = {
    get: jest.fn(),
  };

  let service: FeedbackService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FeedbackService(prisma as any, config as any);
  });

  it("creates feedback when cooldown has passed", async () => {
    const createdAt = new Date("2026-03-27T12:00:00.000Z");
    prisma.feedback.findFirst.mockResolvedValueOnce(null);
    prisma.feedback.create.mockResolvedValueOnce({
      id: "feedback-1",
      createdAt,
    });
    config.get.mockReturnValueOnce("https://discord.example/webhook");
    (postDiscordWebhook as jest.Mock).mockResolvedValueOnce({
      statusCode: 204,
      body: "",
    });

    await expect(
      service.create("user-1", { message: "Dette er nyttig feedback." }),
    ).resolves.toEqual({
      id: "feedback-1",
      createdAt,
    });

    expect(prisma.feedback.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        message: "Dette er nyttig feedback.",
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    expect(postDiscordWebhook).toHaveBeenCalledWith(
      "https://discord.example/webhook",
      expect.any(String),
    );

    const discordPayload = JSON.parse(
      (postDiscordWebhook as jest.Mock).mock.calls[0][1],
    );

    expect(discordPayload).toMatchObject({
      embeds: [
        {
          title: "Ny anonym feedback",
          description: "Dette er nyttig feedback.",
          color: 0x4a67ff,
        },
      ],
    });
    expect(discordPayload.embeds[0].timestamp).toEqual(expect.any(String));
  });

  it("blocks feedback inside cooldown window", async () => {
    const now = new Date("2026-03-27T12:00:00.000Z");
    jest.useFakeTimers().setSystemTime(now);

    prisma.feedback.findFirst.mockResolvedValueOnce({
      id: "feedback-1",
      createdAt: new Date(now.getTime() - 5 * 60 * 1000),
    });

    await expect(
      service.create("user-1", { message: "Dette er nyttig feedback." }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });

    expect(prisma.feedback.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        createdAt: {
          gte: new Date(now.getTime() - FEEDBACK_COOLDOWN_MS),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    jest.useRealTimers();
  });
});
