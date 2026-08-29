import type { BrandColors } from "../azure/image-colors";
import type { PrismaClient } from "../generated/prisma/client";

export type OrganizationStore = PrismaClient["organization"];

export interface ColorableOrganization {
  id: string;
  name: string;
  image: string | null;
}

export interface BackfillTally {
  written: number;
  colorless: number;
  failed: number;
}

export function parseLimit(argv: string[]) {
  const given = argv
    .find((argument) => argument.startsWith("--limit="))
    ?.split("=")[1];

  if (given === undefined) return Number.POSITIVE_INFINITY;

  const limit = Number(given);
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new Error(
      `--limit must be a non-negative whole number, got "${given}"`,
    );
  }

  return limit;
}

export function organizationsLeftToColor(
  organizations: OrganizationStore,
  limit: number,
) {
  return organizations.findMany({
    where: { image: { not: null }, imagePrimaryColor: null },
    select: { id: true, name: true, image: true },
    orderBy: { id: "asc" },
    take: Number.isFinite(limit) ? limit : undefined,
  });
}

/**
 * Writes the colors only while the row still points at the image they were
 * read from, so an upload landing mid-run keeps its own colors rather than
 * the ones read from the logo it replaced.
 */
export async function storeColorsIfImageUnchanged(
  organizations: OrganizationStore,
  organization: ColorableOrganization,
  colors: BrandColors,
) {
  const { count } = await organizations.updateMany({
    where: { id: organization.id, image: organization.image },
    data: {
      imagePrimaryColor: colors.primary,
      imageAccentColor: colors.accent,
    },
  });

  return count > 0;
}

export function summarize(tally: BackfillTally, dryRun: boolean) {
  return `${dryRun ? "would write" : "wrote"} ${tally.written}, colorless ${tally.colorless}, failed ${tally.failed}`;
}
