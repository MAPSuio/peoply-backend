-- CreateIndex
CREATE INDEX "user_organization_roles_user_id_idx" ON "user_organization_roles"("user_id");

-- CreateIndex
CREATE INDEX "event_updates_event_id_idx" ON "event_updates"("event_id");

-- CreateIndex
CREATE INDEX "event_updates_created_by_user_id_idx" ON "event_updates"("created_by_user_id");

-- CreateIndex
CREATE INDEX "arranger_follower_user_id_idx" ON "arranger_follower"("user_id");

-- CreateIndex
CREATE INDEX "event_arrangers_arranger_id_idx" ON "event_arrangers"("arranger_id");

-- CreateIndex
CREATE INDEX "registrations_user_id_idx" ON "registrations"("user_id");

-- CreateIndex
CREATE INDEX "event_categories_event_id_idx" ON "event_categories"("event_id");

-- CreateIndex
CREATE INDEX "favorites_user_id_idx" ON "favorites"("user_id");

-- CreateIndex
CREATE INDEX "event_invitations_to_user_id_idx" ON "event_invitations"("to_user_id");

-- CreateIndex
CREATE INDEX "organization_invitations_to_user_id_idx" ON "organization_invitations"("to_user_id");

