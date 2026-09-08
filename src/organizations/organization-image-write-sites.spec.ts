import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shippedSourceFilesUnder } from "../test-support/source-files";

/**
 * The organization's colors are read from its picture, so a write that sets
 * `image` without them leaves the two disagreeing until the next upload.
 * `organizationImageColumns` is the one place that builds all three, and this
 * fails the moment a second write site appears that does not go through it.
 */
describe("writes to organizations.image", () => {
  it("all go through organizationImageColumns", () => {
    const offenders = shippedSourceFilesUnder(join(__dirname, "..")).filter(
      (path) => {
        const source = readFileSync(path, "utf8");
        if (
          !/prisma\.organization\.(update|create|upsert)|trx\.organization\.(update|create|upsert)/.test(
            source,
          )
        ) {
          return false;
        }
        return (
          /\bimage:/.test(source) &&
          !source.includes("organizationImageColumns")
        );
      },
    );

    expect(offenders).toEqual([]);
  });
});
