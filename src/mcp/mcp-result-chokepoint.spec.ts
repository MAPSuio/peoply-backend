import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MCP_ROOT = __dirname;
const RESULT_MODULE = "mcp-result.ts";
const CONTENT_BLOCK = 'type: "text"';

function sourceFilesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return sourceFilesIn(path);

    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("every tool answer goes through one framed result", () => {
  it("builds model-visible content in one module, so a new tool inherits the framing", () => {
    const offenders = sourceFilesIn(MCP_ROOT).filter((path) => {
      if (path.endsWith(RESULT_MODULE) || path.endsWith(".spec.ts")) {
        return false;
      }

      return readFileSync(path, "utf8").includes(CONTENT_BLOCK);
    });

    expect(offenders).toEqual([]);
  });

  it("hands the SDK a handler that came from that module", () => {
    const target = readFileSync(join(MCP_ROOT, "mcp-tool-target.ts"), "utf8");
    const factory = readFileSync(
      join(MCP_ROOT, "mcp-server.factory.ts"),
      "utf8",
    );

    expect(target.match(/registerTool\(/g)).toHaveLength(1);
    expect(factory).toContain("runMcpTool(");
    expect(factory.match(/target\.add\(/g)).toHaveLength(1);
  });
});
