ALTER TABLE "users"
ADD COLUMN "refresh_token_id" TEXT;

CREATE INDEX "users_refresh_token_id_idx"
ON "users"("refresh_token_id");
