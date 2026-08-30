import { MCP_REQUESTS_PER_MINUTE } from "./mcp.constants";
import { McpRateLimitService } from "./mcp-rate-limit.service";

describe("McpRateLimitService", () => {
  const service = new McpRateLimitService();

  afterAll(() => service.onModuleDestroy());

  it("allows the configured minute quota and resets after the window", () => {
    const now = 1_000_000;
    for (let request = 0; request < MCP_REQUESTS_PER_MINUTE; request++) {
      expect(service.consume("key-1", now).allowed).toBe(true);
    }

    expect(service.consume("key-1", now).allowed).toBe(false);
    expect(service.consume("key-1", now + 60_000).allowed).toBe(true);
  });
});
