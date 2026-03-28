CREATE TABLE "organization_reports" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "organization_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "organization_reports_organization_id_user_id_created_at_idx"
ON "organization_reports"("organization_id", "user_id", "created_at");

ALTER TABLE "organization_reports"
ADD CONSTRAINT "organization_reports_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_reports"
ADD CONSTRAINT "organization_reports_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
