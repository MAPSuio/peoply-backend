CREATE TYPE "event_registration_mode" AS ENUM ('PEOPLY', 'EXTERNAL', 'NONE');

ALTER TABLE "events"
ADD COLUMN "registration_mode" "event_registration_mode" NOT NULL DEFAULT 'PEOPLY';

ALTER TABLE "organization_ics_feeds"
ADD COLUMN "registration_mode" "event_registration_mode" NOT NULL DEFAULT 'EXTERNAL';
