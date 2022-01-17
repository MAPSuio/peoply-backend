/*
  Warnings:

  - Made the column `arranger_id` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "event_arrangers" DROP CONSTRAINT "event_arrangers_arranger_id_fkey";

-- DropForeignKey
ALTER TABLE "event_arrangers" DROP CONSTRAINT "event_arrangers_event_id_fkey";

-- DropForeignKey
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_arranger_id_fkey";

-- DropForeignKey
ALTER TABLE "registrations" DROP CONSTRAINT "registrations_event_id_fkey";

-- DropForeignKey
ALTER TABLE "registrations" DROP CONSTRAINT "registrations_user_id_fkey";

-- DropForeignKey
ALTER TABLE "user_organization_roles" DROP CONSTRAINT "user_organization_roles_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "user_organization_roles" DROP CONSTRAINT "user_organization_roles_user_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_arranger_id_fkey";

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "arranger_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_arranger_id_fkey" FOREIGN KEY ("arranger_id") REFERENCES "arrangers"("arranger_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_arranger_id_fkey" FOREIGN KEY ("arranger_id") REFERENCES "arrangers"("arranger_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_organization_roles" ADD CONSTRAINT "user_organization_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_organization_roles" ADD CONSTRAINT "user_organization_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_arrangers" ADD CONSTRAINT "event_arrangers_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_arrangers" ADD CONSTRAINT "event_arrangers_arranger_id_fkey" FOREIGN KEY ("arranger_id") REFERENCES "arrangers"("arranger_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
