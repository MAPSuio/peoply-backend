import { McpServer } from "@modelcontextprotocol/server";

export type McpToolSummary = {
  name: string;
  title: string;
  description: string;
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
      scope: this.scope,
    });
    this.server?.registerTool(name, metadata as never, handler as never);
  }
}
