import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";

describe("user email identity against Postgres", () => {
  const prisma = new PrismaService();
  const mailbox = `case-fold-${randomUUID()}@peoply.app`;
  const shouted = mailbox.toUpperCase();
  const createdArrangerIds: string[] = [];

  async function createUserWithEmail(email: string) {
    const arranger = await prisma.arranger.create({
      data: { isBusiness: false },
    });

    createdArrangerIds.push(arranger.id);

    return prisma.user.create({
      data: {
        arrangerId: arranger.id,
        firstName: "Case",
        lastName: "Fold",
        email,
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
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

  it("finds the account whatever case the provider sends the address in", async () => {
    const created = await createUserWithEmail(mailbox);

    const found = await prisma.user.findUnique({ where: { email: shouted } });

    expect(found?.id).toBe(created.id);
  });

  it("refuses a second account on the same mailbox spelled differently", async () => {
    await createUserWithEmail(mailbox);

    await expect(createUserWithEmail(shouted)).rejects.toMatchObject({
      code: "P2002",
    });
  });
});
