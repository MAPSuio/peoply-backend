import { HttpException, Logger } from "@nestjs/common";
import type { CallToolResult } from "@modelcontextprotocol/server";

export type ToolResult = CallToolResult;

function mcpResult(value: unknown): ToolResult {
  const structuredContent = { data: value };
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

export async function runMcpTool(
  logger: Logger,
  operation: () => Promise<unknown>,
): Promise<CallToolResult> {
  try {
    return mcpResult(await operation());
  } catch (error) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const responseMessage =
        typeof response === "string"
          ? response
          : (response as { message?: string | string[] }).message;
      const message = Array.isArray(responseMessage)
        ? responseMessage.join(", ")
        : (responseMessage ?? "Request refused");
      return {
        content: [{ type: "text", text: message }],
        isError: true,
      };
    }

    logger.error(error instanceof Error ? error.stack : error);
    return {
      content: [{ type: "text", text: "The Peoply request failed" }],
      isError: true,
    };
  }
}
