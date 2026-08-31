import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PER_ROUTE_THROTTLER, WHOLE_APP_THROTTLER } from "./rate-limit";

const SOURCE_ROOT = join(__dirname);
const OWNING_MODULE = "rate-limit.ts";

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return sourceFilesUnder(path);

    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("rate limit exemptions", () => {
  it("goes through SkipRateLimit, so nobody exempts a route from one allowance and not the other", () => {
    const offenders = sourceFilesUnder(SOURCE_ROOT).filter(
      (path) =>
        !path.endsWith(OWNING_MODULE) &&
        !path.endsWith("rate-limit.spec.ts") &&
        readFileSync(path, "utf8").includes("SkipThrottle"),
    );

    expect(offenders).toEqual([]);
  });

  it("names two allowances, so a route is counted both on its own and app-wide", () => {
    expect(PER_ROUTE_THROTTLER).not.toBe(WHOLE_APP_THROTTLER);
  });
});
