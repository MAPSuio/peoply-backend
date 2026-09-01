import { Public } from "../auth/public.decorator";
import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { McpServerFactory } from "./mcp-server.factory";
import { McpToolSummary } from "./mcp-tool-target";

@ApiTags("MCP")
@Controller("mcp/tools")
export class McpToolsController {
  constructor(private readonly factory: McpServerFactory) {}

  @Public()
  @Get()
  list(): McpToolSummary[] {
    return this.factory.describeTools();
  }
}
