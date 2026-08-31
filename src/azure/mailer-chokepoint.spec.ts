import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SOURCE_ROOT = join(__dirname, "..");
const MAILER_MODULE = join("azure", "azure-communication.service.ts");
const SENDING_SYMBOLS = ["EmailClient", "beginSend"];

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return sourceFilesUnder(path);

    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("the mailer is the only way to reach Azure", () => {
  it("keeps sending, in shipped code, inside the service that charges for it", () => {
    const offenders = sourceFilesUnder(SOURCE_ROOT).filter((path) => {
      if (path.endsWith(MAILER_MODULE) || path.endsWith(".spec.ts")) {
        return false;
      }

      const source = readFileSync(path, "utf8");

      return SENDING_SYMBOLS.some((symbol) => source.includes(symbol));
    });

    expect(offenders).toEqual([]);
  });
});
