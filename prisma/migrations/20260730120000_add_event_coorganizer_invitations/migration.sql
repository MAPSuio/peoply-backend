CREATE TABLE "event_coorganizer_invitations" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "from_user_id" TEXT,
  "responded_by_user_id" TEXT,
  "invitation_status" "invitation_statuses" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "event_coorganizer_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_coorganizer_invitations_event_id_organization_id_key"
ON "event_coorganizer_invitations"("event_id", "organization_id");

CREATE INDEX "event_coorganizer_invitations_organization_id_invitation_st_idx"
ON "event_coorganizer_invitations"("organization_id", "invitation_status");

CREATE INDEX "event_coorganizer_invitations_from_user_id_idx"
ON "event_coorganizer_invitations"("from_user_id");

CREATE INDEX "event_coorganizer_invitations_responded_by_user_id_idx"
ON "event_coorganizer_invitations"("responded_by_user_id");

ALTER TABLE "event_coorganizer_invitations"
ADD CONSTRAINT "event_coorganizer_invitations_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_coorganizer_invitations"
ADD CONSTRAINT "event_coorganizer_invitations_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_coorganizer_invitations"
ADD CONSTRAINT "event_coorganizer_invitations_from_user_id_fkey"
FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_coorganizer_invitations"
ADD CONSTRAINT "event_coorganizer_invitations_responded_by_user_id_fkey"
FOREIGN KEY ("responded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Co-organizers attached before this table existed had no say in the matter.
-- Record them as ACCEPTED so the relationship is representable and their
-- organization can withdraw from it, with from_user_id left null because
-- nobody is on record as having asked.
INSERT INTO "event_coorganizer_invitations" (
  "id", "event_id", "organization_id", "invitation_status", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::TEXT,
  ea."event_id",
  o."id",
  'ACCEPTED',
  ea."created_at",
  ea."updated_at"
FROM "event_arrangers" ea
JOIN "organizations" o ON o."arranger_id" = ea."arranger_id"
WHERE ea."role" = 'COLLABORATOR'
ON CONFLICT DO NOTHING;
