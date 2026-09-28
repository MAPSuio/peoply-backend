SET lock_timeout = '5s';

CREATE TABLE "login_links" (
    "token_hash" CHAR(64) NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_links_pkey" PRIMARY KEY ("token_hash")
);

CREATE INDEX "login_links_user_id_created_at_idx" ON "login_links"("user_id", "created_at");

CREATE INDEX "login_links_expires_at_idx" ON "login_links"("expires_at");

ALTER TABLE "login_links" ADD CONSTRAINT "login_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
