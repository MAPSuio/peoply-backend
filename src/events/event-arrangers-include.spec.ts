import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { EVENT_ARRANGERS_INCLUDE } from "./event.select";
import { PUBLIC_ARRANGER_INCLUDE } from "../arrangers/arranger.select";

const SOURCE_ROOT = join(__dirname, "..");
const OWNING_MODULE = join("events", "event.select.ts");
const INLINE_TREE = /arranger:\s*\{\s*include:\s*PUBLIC_ARRANGER_INCLUDE/;

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return sourceFilesUnder(path);

    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("EVENT_ARRANGERS_INCLUDE", () => {
  it("is the tree the four call sites carried inline", () => {
    expect(EVENT_ARRANGERS_INCLUDE).toEqual({
      include: { arranger: { include: PUBLIC_ARRANGER_INCLUDE } },
    });
  });

  it("is the only place that tree is written out", () => {
    const offenders = sourceFilesUnder(SOURCE_ROOT).filter((path) => {
      if (path.endsWith(OWNING_MODULE) || path.endsWith(".spec.ts")) {
        return false;
      }

      return INLINE_TREE.test(readFileSync(path, "utf8"));
    });

    expect(offenders).toEqual([]);
  });
});
