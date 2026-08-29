import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return entry === "generated" ? [] : sourceFilesUnder(path);
    }
    return path.endsWith(".ts") && !path.endsWith(".spec.ts") ? [path] : [];
  });
}

/**
 * The organization's colors are read from its picture, so a write that sets
 * `image` without them leaves the two disagreeing until the next upload.
 * `organizationImageColumns` is the one place that builds all three, and this
 * fails the moment a second write site appears that does not go through it.
 */
describe("writes to organizations.image", () => {
  it("all go through organizationImageColumns", () => {
    const offenders = sourceFilesUnder(join(__dirname, "..")).filter((path) => {
      const source = readFileSync(path, "utf8");
      if (
        !/prisma\.organization\.(update|create|upsert)|trx\.organization\.(update|create|upsert)/.test(
          source,
        )
      ) {
        return false;
      }
      return (
        /\bimage:/.test(source) && !source.includes("organizationImageColumns")
      );
    });

    expect(offenders).toEqual([]);
  });
});
