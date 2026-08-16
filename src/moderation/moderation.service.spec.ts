import { ModerationService } from "./moderation.service";

/**
 * The five counters are one shared query with five different models behind it,
 * so what is worth pinning is that each still asks its own model, and that the
 * day window is the same arithmetic it always was.
 */
describe("ModerationService", () => {
  const models = [
    "user",
    "event",
    "organization",
    "registration",
    "favorite",
  ] as const;

  const buildPrisma = () =>
    Object.fromEntries(
      models.map((model) => [model, { count: jest.fn(async () => 7) }]),
    ) as any;

  it.each(models)("counts on the %s model", async (model) => {
    const prisma = buildPrisma();
    const service = new ModerationService(prisma);

    await expect(service.countCreatedWithin(model, 30)).resolves.toBe(7);

    expect(prisma[model].count).toHaveBeenCalledTimes(1);
    // Every other model was left alone.
    for (const other of models.filter((name) => name !== model)) {
      expect(prisma[other].count).not.toHaveBeenCalled();
    }
  });

  it("asks for rows created within the given number of days", async () => {
    const prisma = buildPrisma();
    const before = Date.now();

    await new ModerationService(prisma).countCreatedWithin("user", 30);

    const { gte } = prisma.user.count.mock.calls[0][0].where.createdAt;
    const expected = before - 30 * 24 * 60 * 60 * 1000;

    // A second of slack for the clock reading inside the call.
    expect(gte.getTime()).toBeGreaterThanOrEqual(expected - 1000);
    expect(gte.getTime()).toBeLessThanOrEqual(expected + 1000);
  });

  it("treats 0 days as everything since this instant", async () => {
    const prisma = buildPrisma();
    const before = Date.now();

    await new ModerationService(prisma).countCreatedWithin("event", 0);

    const { gte } = prisma.event.count.mock.calls[0][0].where.createdAt;

    expect(gte.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});
