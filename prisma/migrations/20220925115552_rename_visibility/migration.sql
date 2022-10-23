/*
  Warnings:

  - Changed the type of `visibility` on the `events` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "event_update_visibility" AS ENUM ('ALL', 'GOING');

-- CreateEnum
ALTER TYPE "visibility" RENAME TO "event_visibility"; 

-- ALTER TABLE "event"
-- ALTER COLUMN "visibility" TYPE "event_visibility" NOT NULL;


-- CreateTable
CREATE TABLE "event_updates" (
    "id" TEXT NOT NULL,
    "visibility" "event_update_visibility" NOT NULL,
    "event_id" TEXT NOT NULL,
    "send_email" BOOLEAN NOT NULL,
    "azure_message_id" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "reply_to" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_updates_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "event_updates" ADD CONSTRAINT "event_updates_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
