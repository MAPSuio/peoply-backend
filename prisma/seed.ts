import { PrismaClient } from "@prisma/client";
import { categories } from "./dbProdData";

const prisma = new PrismaClient();

async function main() {
  await prisma.category.createMany({
    data: categories,
    skipDuplicates: true,
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
