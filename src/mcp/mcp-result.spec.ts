import { BadRequestException, Logger } from "@nestjs/common";
import { runMcpTool } from "./mcp-result";

describe("runMcpTool", () => {
  const logger = { error: jest.fn() } as unknown as Logger;

  beforeEach(() => jest.clearAllMocks());

  it("formats validation message arrays", async () => {
    const result = await runMcpTool(logger, async () => {
      throw new BadRequestException({
        message: ["title is required", "date is invalid"],
      });
    });

    expect(result).toEqual({
      content: [{ type: "text", text: "title is required, date is invalid" }],
      isError: true,
    });
  });

  it("hides and logs unexpected errors", async () => {
    const result = await runMcpTool(logger, async () => {
      throw new Error("database detail");
    });

    expect(result.content[0].text).toBe("The Peoply request failed");
    expect(logger.error).toHaveBeenCalled();
  });
});
