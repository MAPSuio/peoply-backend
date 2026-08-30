import { McpServer } from "@modelcontextprotocol/server";
import { MCP_TOOL_SUMMARIES } from "./mcp-tool-summaries";

export type McpToolSummary = {
  name: string;
  title: string;
  description: string;
  summary: string;
  scope: string;
};

export class McpToolTarget {
  constructor(
    private readonly scope: string,
    private readonly summaries: McpToolSummary[],
    private readonly server?: McpServer,
  ) {}

  add(
    name: string,
    metadata: { title: string; description: string },
    handler: unknown,
  ) {
    this.summaries.push({
      name,
      title: metadata.title,
      description: metadata.description,
      summary: MCP_TOOL_SUMMARIES[name] ?? "",
      scope: this.scope,
    });
    this.server?.registerTool(name, metadata as never, handler as never);
  }
}
