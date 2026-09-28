import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { AzureCommunicationService } from "../azure/azure-communication.service";
import { PrismaService } from "../prisma/prisma.service";
import { EmailLoginService } from "./email-login.service";

describe("email login links against Postgres", () => {
  const prisma = new PrismaService();
  const mailer = { send: jest.fn().mockResolvedValue(undefined) };
  const service = new EmailLoginService(
    prisma,
    mailer as unknown as AzureCommunicationService,
    new ConfigService({ FRONTEND_URL: "https://peoply.test" }),
  );
  const createdArrangerIds: string[] = [];

  async function createUser() {
    const arranger = await prisma.arranger.create({
      data: { isBusiness: false },
    });
    createdArrangerIds.push(arranger.id);

    return prisma.user.create({
      data: {
        arrangerId: arranger.id,
        firstName: "Link",
        lastName: "Racer",
        email: `email-login-${randomUUID()}@peoply.app`,
      },
    });
  }

  const flushMail = () => new Promise((resolve) => setImmediate(resolve));

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(() => {
    mailer.send.mockClear();
  });

  afterEach(async () => {
    await prisma.arranger.deleteMany({
      where: { id: { in: createdArrangerIds } },
    });
    createdArrangerIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("stores and mails one link when the same address asks many times at once", async () => {
    const user = await createUser();

    await Promise.all(
      Array.from({ length: 5 }, () => service.requestLink(user.email)),
    );
    await flushMail();

    expect(await prisma.loginLink.count({ where: { userId: user.id } })).toBe(
      1,
    );
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it("leaves other users' links alone when issuing a new one", async () => {
    const other = await createUser();
    const expired = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.loginLink.create({
      data: {
        tokenHash: "a".repeat(64),
        userId: other.id,
        createdAt: expired,
        expiresAt: expired,
      },
    });
    const user = await createUser();

    await service.requestLink(user.email);

    expect(await prisma.loginLink.count({ where: { userId: other.id } })).toBe(
      1,
    );
  });
});
