import { PrismaClient } from ".prisma/client";

const prisma = new PrismaClient();

async function main() {
  const userAndy = await prisma.users.upsert({
    where: { email: "andy@gmail.com" },
    update: {},
    create: {
      email: "andy@gmail.com",
      first_name: "Andy",
      phone: 94144149,
    },
  });

  const userHansy = await prisma.users.create({
    data: {
      email: "hansy@gmail.com",
      first_name: "Hansy",
      phone: 99999999,
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
