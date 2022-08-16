/*
  Warnings:

  - A unique constraint covering the columns `[organization_id,organization_role,to_user_id,invitation_status]` on the table `organization_invitations` will be added. If there are existing duplicate values, this will fail.

*/

-- Drop table organization_invitations to make sure migration doesn't fail.
-- This is not critical data at the time of the migration
TRUNCATE TABLE "organization_invitations";

-- CreateIndex
CREATE UNIQUE INDEX "organization_invitations_organization_id_organization_role__key" ON "organization_invitations"("organization_id", "organization_role", "to_user_id", "invitation_status");
