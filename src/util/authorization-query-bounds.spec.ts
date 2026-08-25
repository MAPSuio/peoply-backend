import * as fs from "node:fs";
import * as path from "node:path";
import { MODELS_WHOSE_ROWS_GRANT_ACCESS } from "./pagination";

const SOURCE_ROOT = path.resolve(__dirname, "..");

function sourceFilesUnder(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "generated" ? [] : sourceFilesUnder(entryPath);
    }
    const isTest = entry.name.endsWith(".spec.ts");
    return entry.name.endsWith(".ts") && !isTest ? [entryPath] : [];
  });
}

function argumentsOfCallAt(source: string, openingParenthesis: number): string {
  let depth = 0;

  for (let cursor = openingParenthesis; cursor < source.length; cursor++) {
    if (source[cursor] === "(") depth++;
    if (source[cursor] === ")" && --depth === 0) {
      return source.slice(openingParenthesis, cursor);
    }
  }

  return source.slice(openingParenthesis);
}

function accessQueriesWithoutARowBound(): string[] {
  const guarded = new Set<string>(MODELS_WHOSE_ROWS_GRANT_ACCESS);
  const callPattern = /\.(\w+)\.findMany\(/g;

  return sourceFilesUnder(SOURCE_ROOT).flatMap((file) => {
    const source = fs.readFileSync(file, "utf8");

    return [...source.matchAll(callPattern)]
      .filter((call) => guarded.has(call[1]))
      .filter(
        (call) =>
          !argumentsOfCallAt(source, call.index + call[0].length - 1).includes(
            "take",
          ),
      )
      .map((call) => {
        const line = source.slice(0, call.index).split("\n").length;
        return `${path.relative(SOURCE_ROOT, file)}:${line} reads ${call[1]}`;
      });
  });
}

describe("queries on models whose rows grant access", () => {
  it("all state a row bound, so no access decision is silently truncated", () => {
    expect(accessQueriesWithoutARowBound()).toEqual([]);
  });
});
