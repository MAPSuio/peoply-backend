import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SOURCE_ROOT = join(__dirname, "..");
const IGNORED_DIRECTORIES = ["generated", "node_modules"];
const THE_ONE_VERIFIER = join(SOURCE_ROOT, "auth", "access-session.service.ts");
const SECOND_VERIFIER = /jwtService\.verify|validateJWT/;

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      return IGNORED_DIRECTORIES.includes(entry) ? [] : sourceFilesUnder(path);
    }

    return path.endsWith(".ts") && !path.endsWith(".spec.ts") ? [path] : [];
  });
}

describe("access token verification", () => {
  it("happens in exactly one place, so revoking a session cannot be skipped", () => {
    const offenders = sourceFilesUnder(SOURCE_ROOT).filter(
      (path) =>
        path !== THE_ONE_VERIFIER &&
        SECOND_VERIFIER.test(readFileSync(path, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});
