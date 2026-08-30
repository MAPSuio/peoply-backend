import { McpApiKeyScope } from "../generated/prisma/client";

export const MCP_SCOPE_NAMES: Record<McpApiKeyScope, string> = {
  [McpApiKeyScope.READ]: "peoply:read",
  [McpApiKeyScope.WRITE]: "peoply:write",
  [McpApiKeyScope.ORGANIZE]: "peoply:organize",
};

export const MCP_KEY_PREFIX = "ppl_mcp";
export const MCP_DEFAULT_EXPIRY_DAYS = 90;
export const MCP_MAX_EXPIRY_DAYS = 365;
export const MCP_MAX_ACTIVE_KEYS_PER_USER = 10;
export const MCP_REQUESTS_PER_MINUTE = 120;
