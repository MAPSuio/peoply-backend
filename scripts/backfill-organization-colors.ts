import { readBrandColors } from "../src/azure/image-colors";
import { createPrismaAdapter } from "../src/prisma/prisma.adapter";
import { PrismaClient } from "../src/generated/prisma/client";

const DOWNLOAD_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 2_000;
const MAX_ATTEMPTS = 3;

const LIMIT = Number(
  process.argv
    .find((argument) => argument.startsWith("--limit="))
    ?.split("=")[1] ?? Number.POSITIVE_INFINITY,
);
const DRY_RUN = process.argv.includes("--dry-run");

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function downloadImage(url: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await wait(RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError;
}

async function main() {
  const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

  const pending = await prisma.organization.findMany({
    where: { image: { not: null }, imagePrimaryColor: null },
    select: { id: true, name: true, image: true },
    orderBy: { id: "asc" },
    take: Number.isFinite(LIMIT) ? LIMIT : undefined,
  });

  console.log(`${pending.length} organizations without colors`);

  let written = 0;
  let colorless = 0;
  let failed = 0;

  for (const organization of pending) {
    try {
      const image = await downloadImage(organization.image as string);
      const colors = await readBrandColors(image);

      if (!colors) {
        colorless++;
        console.log(`${organization.name}: no color in the picture, skipping`);
        continue;
      }

      if (!DRY_RUN) {
        await prisma.organization.update({
          where: { id: organization.id },
          data: {
            imagePrimaryColor: colors.primary,
            imageAccentColor: colors.accent,
          },
        });
      }

      written++;
      console.log(
        `${organization.name}: ${colors.primary} ${colors.accent ?? "(no accent)"}`,
      );
    } catch (error) {
      failed++;
      console.error(
        `${organization.name}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  console.log(
    `${DRY_RUN ? "would write" : "wrote"} ${written}, colorless ${colorless}, failed ${failed}`,
  );
  await prisma.$disconnect();
  if (failed > 0) process.exitCode = 1;
}

void main();
