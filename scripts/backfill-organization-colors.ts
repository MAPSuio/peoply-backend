import { readBrandColors } from "../src/azure/image-colors";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  type BackfillTally,
  type ColorableOrganization,
  type OrganizationStore,
  organizationsLeftToColor,
  parseLimit,
  storeColorsIfImageUnchanged,
  summarize,
} from "../src/organizations/organization-color-backfill";
import { createPrismaAdapter } from "../src/prisma/prisma.adapter";

const DOWNLOAD_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 2_000;
const MAX_ATTEMPTS = 3;

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

async function colorOne(
  organizations: OrganizationStore,
  organization: ColorableOrganization,
  dryRun: boolean,
): Promise<keyof BackfillTally> {
  const image = await downloadImage(organization.image as string);
  const colors = await readBrandColors(image);

  if (!colors) {
    console.log(`${organization.name}: no color in the picture, skipping`);
    return "colorless";
  }

  const found = `${colors.primary} ${colors.accent ?? "(no accent)"}`;

  if (dryRun) {
    console.log(`${organization.name}: ${found}`);
    return "written";
  }

  if (
    !(await storeColorsIfImageUnchanged(organizations, organization, colors))
  ) {
    console.log(`${organization.name}: logo changed mid-run, leaving it alone`);
    return "colorless";
  }

  console.log(`${organization.name}: ${found}`);
  return "written";
}

async function main() {
  const limit = parseLimit(process.argv);
  const dryRun = process.argv.includes("--dry-run");
  const prisma = new PrismaClient({ adapter: createPrismaAdapter() });
  const tally: BackfillTally = { written: 0, colorless: 0, failed: 0 };

  try {
    const pending = await organizationsLeftToColor(prisma.organization, limit);
    console.log(`${pending.length} organizations without colors`);

    for (const organization of pending) {
      try {
        tally[await colorOne(prisma.organization, organization, dryRun)]++;
      } catch (error) {
        tally.failed++;
        console.error(
          `${organization.name}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(summarize(tally, dryRun));
  if (tally.failed > 0) process.exitCode = 1;
}

void main();
