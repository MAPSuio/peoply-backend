import { readdirSync } from "node:fs";
import { join } from "node:path";

const NOT_OURS_TO_JUDGE = ["generated", "node_modules"];

export function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return NOT_OURS_TO_JUDGE.includes(entry.name)
        ? []
        : sourceFilesUnder(path);
    }

    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

export function shippedSourceFilesUnder(directory: string): string[] {
  return sourceFilesUnder(directory).filter(
    (path) => !path.endsWith(".spec.ts"),
  );
}
