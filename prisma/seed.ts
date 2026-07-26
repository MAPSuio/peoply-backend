import { PrismaClient } from "../src/generated/prisma/client";
import { createPrismaAdapter } from "../src/prisma/prisma.adapter";
import { allergens, categories } from "./dbProdData";

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

async function main() {
  await prisma.category.createMany({
    data: categories,
    skipDuplicates: true,
  });
  await prisma.allergen.createMany({
    data: allergens,
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
