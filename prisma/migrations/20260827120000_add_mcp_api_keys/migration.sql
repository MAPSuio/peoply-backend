CREATE TYPE "McpApiKeyScope" AS ENUM ('READ', 'WRITE', 'ORGANIZE');

CREATE TABLE "mcp_api_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "secret_hash" CHAR(64) NOT NULL,
    "scopes" "McpApiKeyScope"[] NOT NULL DEFAULT ARRAY['READ']::"McpApiKeyScope"[],
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mcp_api_keys_user_id_revoked_at_idx" ON "mcp_api_keys"("user_id", "revoked_at");
CREATE INDEX "mcp_api_keys_user_id_created_at_idx" ON "mcp_api_keys"("user_id", "created_at" DESC);
CREATE INDEX "mcp_api_keys_expires_at_idx" ON "mcp_api_keys"("expires_at");

ALTER TABLE "mcp_api_keys" ADD CONSTRAINT "mcp_api_keys_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
