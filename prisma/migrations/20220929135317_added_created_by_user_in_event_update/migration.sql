/*
  Warnings:

  - Added the required column `created_by_user_id` to the `event_updates` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "event_updates" ADD COLUMN     "created_by_user_id" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "event_updates" ADD CONSTRAINT "event_updates_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
