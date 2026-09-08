import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shippedSourceFilesUnder } from "../test-support/source-files";

const SOURCE_ROOT = join(__dirname, "..");
const THE_ONE_VERIFIER = join(SOURCE_ROOT, "auth", "access-session.service.ts");
const SECOND_VERIFIER = /jwtService\.verify|validateJWT/;

describe("access token verification", () => {
  it("happens in exactly one place, so revoking a session cannot be skipped", () => {
    const offenders = shippedSourceFilesUnder(SOURCE_ROOT).filter(
      (path) =>
        path !== THE_ONE_VERIFIER &&
        SECOND_VERIFIER.test(readFileSync(path, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});
