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

/**
 * A `take` inside a nested relation bounds that relation, not the query, so
 * only a `take` property of the outer options object counts as the decision.
 */
function statesARowBoundOnTheOuterOptions(callArguments: string): boolean {
  let braceDepth = 0;

  for (let cursor = 0; cursor < callArguments.length; cursor++) {
    if (callArguments[cursor] === "{") braceDepth++;
    if (callArguments[cursor] === "}") braceDepth--;

    const isPropertyOfOuterObject =
      braceDepth === 1 &&
      /^[\s,{]$/.test(callArguments[cursor]) &&
      /^\s*take\s*[:,}]/.test(callArguments.slice(cursor + 1));

    if (isPropertyOfOuterObject) return true;
  }

  return false;
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
          !statesARowBoundOnTheOuterOptions(
            argumentsOfCallAt(source, call.index + call[0].length - 1),
          ),
      )
      .map((call) => {
        const line = source.slice(0, call.index).split("\n").length;
        return `${path.relative(SOURCE_ROOT, file)}:${line} reads ${call[1]}`;
      });
  });
}

describe("recognising the row bound decision", () => {
  it("accepts a take on the outer options object", () => {
    expect(
      statesARowBoundOnTheOuterOptions("({ take: ALL_ROWS, where: { id } })"),
    ).toBe(true);
  });

  it("rejects a take that only bounds a nested relation", () => {
    expect(
      statesARowBoundOnTheOuterOptions(
        "({ where: { id }, include: { members: { take: 5 } } })",
      ),
    ).toBe(false);
  });

  it("accepts the shorthand property form", () => {
    expect(
      statesARowBoundOnTheOuterOptions("({ where: { eventId }, skip, take })"),
    ).toBe(true);
  });

  it("rejects a where field that merely starts with the word take", () => {
    expect(
      statesARowBoundOnTheOuterOptions("({ where: { takenBy: userId } })"),
    ).toBe(false);
  });
});

describe("queries on models whose rows grant access", () => {
  it("all state a row bound, so no access decision is silently truncated", () => {
    expect(accessQueriesWithoutARowBound()).toEqual([]);
  });
});
