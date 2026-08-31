import { HttpException, Logger } from "@nestjs/common";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { UNTRUSTED_DATA_NOTICE, clampUserText } from "./untrusted-content";

function mcpResult(value: unknown): CallToolResult {
  const structuredContent = {
    notice: UNTRUSTED_DATA_NOTICE,
    data: clampUserText(value),
  };

  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

function mcpRefusal(message: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          notice: UNTRUSTED_DATA_NOTICE,
          error: clampUserText(message),
        }),
      },
    ],
    isError: true,
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
      return mcpRefusal(message);
    }

    logger.error(error instanceof Error ? error.stack : error);
    return mcpRefusal("The Peoply request failed");
  }
}
