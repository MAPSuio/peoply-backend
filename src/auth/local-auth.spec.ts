import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { ConfigService } from "@nestjs/config";

import { isLocalAuthEnabled } from "./local-auth";

const SOURCE_ROOT = join(__dirname, "..");
const OWNING_MODULE = join("auth", "local-auth.ts");
const ENV_SCHEMA = join("src", "app.module.ts");
const READS_THE_FLAG_WITH_ITS_OWN_RULE = join("mcp", "mcp-handler.service.ts");
const THE_RULE_SPELLED_OUT = /get<boolean>\("LOCAL_AUTH_ENABLED"\)/;

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return sourceFilesUnder(path);

    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

function configWith(localAuthEnabled: unknown) {
  return { get: () => localAuthEnabled } as unknown as ConfigService;
}

describe("isLocalAuthEnabled", () => {
  const nodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = nodeEnv;
  });

  it("is on when the flag is the boolean true outside production", () => {
    process.env.NODE_ENV = "development";

    expect(isLocalAuthEnabled(configWith(true))).toBe(true);
  });

  it("stays off in production no matter what the flag says", () => {
    process.env.NODE_ENV = "production";

    expect(isLocalAuthEnabled(configWith(true))).toBe(false);
  });

  it("does not accept a truthy string for the flag", () => {
    process.env.NODE_ENV = "development";

    expect(isLocalAuthEnabled(configWith("true"))).toBe(false);
  });

  it("is the only place the auth gate reads the flag, so a third caller cannot get it wrong", () => {
    const readers = sourceFilesUnder(SOURCE_ROOT).filter((path) => {
      if (
        path.endsWith(OWNING_MODULE) ||
        path.endsWith(ENV_SCHEMA) ||
        path.endsWith(".spec.ts")
      ) {
        return false;
      }

      return THE_RULE_SPELLED_OUT.test(readFileSync(path, "utf8"));
    });

    expect(readers.map((path) => path.replace(`${SOURCE_ROOT}/`, ""))).toEqual([
      READS_THE_FLAG_WITH_ITS_OWN_RULE,
    ]);
  });
});
