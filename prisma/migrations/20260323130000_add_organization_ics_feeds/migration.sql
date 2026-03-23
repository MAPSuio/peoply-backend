CREATE TYPE "event_sources" AS ENUM ('MANUAL', 'ICS');

CREATE TYPE "ics_feed_sync_status" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'DISABLED');

CREATE TABLE "organization_ics_feeds" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sync_interval_minutes" INTEGER NOT NULL DEFAULT 60,
  "last_synced_at" TIMESTAMP(3),
  "last_successful_sync_at" TIMESTAMP(3),
  "last_sync_status" "ics_feed_sync_status" NOT NULL DEFAULT 'PENDING',
  "last_sync_error" TEXT,
  "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
  "disabled_at" TIMESTAMP(3),
  "sync_started_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "organization_ics_feeds_pkey" PRIMARY KEY ("id")
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_organization_ics_feeds_updated_at
BEFORE UPDATE ON "organization_ics_feeds"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE UNIQUE INDEX "organization_ics_feeds_organization_id_key" ON "organization_ics_feeds"("organization_id");

ALTER TABLE "events"
ADD COLUMN "source" "event_sources" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "external_id" TEXT,
ADD COLUMN "external_url" TEXT,
ADD COLUMN "external_updated_at" TIMESTAMP(3),
ADD COLUMN "archived_at" TIMESTAMP(3),
ADD COLUMN "read_only" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "organization_ics_feed_id" TEXT;

CREATE INDEX "events_archived_at_idx" ON "events"("archived_at");
CREATE UNIQUE INDEX "events_organization_ics_feed_id_external_id_key" ON "events"("organization_ics_feed_id", "external_id");

ALTER TABLE "organization_ics_feeds"
ADD CONSTRAINT "organization_ics_feeds_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "events"
ADD CONSTRAINT "events_organization_ics_feed_id_fkey"
FOREIGN KEY ("organization_ics_feed_id") REFERENCES "organization_ics_feeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "events"
ADD CONSTRAINT "events_ics_requires_external_id"
CHECK ("source" != 'ICS' OR "external_id" IS NOT NULL);
