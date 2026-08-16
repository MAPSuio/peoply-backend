import { HttpStatus } from "@nestjs/common";
import { FeedbackService, FEEDBACK_COOLDOWN_MS } from "./feedback.service";

describe("FeedbackService", () => {
  const feedback = {
    findFirst: jest.fn(),
    create: jest.fn(),
  };
  /* The cooldown check and the insert run inside one transaction behind a row
     lock, so the double has to offer both. */
  const prisma = {
    feedback,
    $queryRaw: jest.fn(),
    $transaction: jest.fn((fn: any) => fn({ feedback, $queryRaw: jest.fn() })),
  };
  const discordAlert = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  let service: FeedbackService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FeedbackService(prisma as any, discordAlert as any);
  });

  it("creates feedback when cooldown has passed", async () => {
    const createdAt = new Date("2026-03-27T12:00:00.000Z");
    feedback.findFirst.mockResolvedValueOnce(null);
    feedback.create.mockResolvedValueOnce({
      id: "feedback-1",
      createdAt,
    });

    await expect(
      service.create("user-1", { message: "Dette er nyttig feedback." }),
    ).resolves.toEqual({
      id: "feedback-1",
      createdAt,
    });

    expect(feedback.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        message: "Dette er nyttig feedback.",
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    expect(discordAlert.send).toHaveBeenCalledWith({
      title: "Ny anonym feedback",
      description: "Dette er nyttig feedback.",
      color: 0x4a67ff,
      context: "Feedback",
    });
  });

  it("blocks feedback inside cooldown window", async () => {
    const now = new Date("2026-03-27T12:00:00.000Z");
    jest.useFakeTimers().setSystemTime(now);

    feedback.findFirst.mockResolvedValueOnce({
      id: "feedback-1",
      createdAt: new Date(now.getTime() - 5 * 60 * 1000),
    });

    await expect(
      service.create("user-1", { message: "Dette er nyttig feedback." }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });

    expect(feedback.findFirst).toHaveBeenCalledWith({
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

  it("takes the row lock before reading the cooldown", async () => {
    const lockingTrx = { feedback, $queryRaw: jest.fn() };
    prisma.$transaction.mockImplementationOnce((fn: any) => fn(lockingTrx));
    feedback.findFirst.mockResolvedValueOnce(null);
    feedback.create.mockResolvedValueOnce({
      id: "feedback-1",
      createdAt: new Date(),
    });

    await service.create("user-1", { message: "a".repeat(20) } as any);

    /* Without the lock two requests read the same empty window and both
       write, each posting to Discord. */
    expect(lockingTrx.$queryRaw).toHaveBeenCalled();
    const lock = lockingTrx.$queryRaw.mock.invocationCallOrder[0];
    const read = feedback.findFirst.mock.invocationCallOrder[0];
    expect(lock).toBeLessThan(read);
  });

  it("checks and inserts inside a single transaction", async () => {
    feedback.findFirst.mockResolvedValueOnce(null);
    feedback.create.mockResolvedValueOnce({
      id: "feedback-1",
      createdAt: new Date(),
    });

    await service.create("user-1", { message: "a".repeat(20) } as any);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(feedback.create).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when the cooldown blocks the request", async () => {
    feedback.findFirst.mockResolvedValueOnce({
      createdAt: new Date(),
    });

    await expect(
      service.create("user-1", { message: "a".repeat(20) } as any),
    ).rejects.toThrow();

    expect(feedback.create).not.toHaveBeenCalled();
  });
});
