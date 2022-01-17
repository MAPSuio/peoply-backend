/*
  Warnings:

  - The primary key for the `event_arrangers` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `events` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `registrations` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[event_numeric_id]` on the table `events` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "event_arrangers" DROP CONSTRAINT "event_arrangers_event_id_fkey";

-- DropForeignKey
ALTER TABLE "registrations" DROP CONSTRAINT "registrations_event_id_fkey";

-- AlterTable
ALTER TABLE "event_arrangers" DROP CONSTRAINT "event_arrangers_pkey",
ALTER COLUMN "event_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "event_arrangers_pkey" PRIMARY KEY ("event_id", "arranger_id");

-- AlterTable
ALTER TABLE "events" DROP CONSTRAINT "events_pkey",
ADD COLUMN     "event_numeric_id" SERIAL NOT NULL,
ALTER COLUMN "event_id" DROP DEFAULT,
ALTER COLUMN "event_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "events_pkey" PRIMARY KEY ("event_id");
DROP SEQUENCE "events_event_id_seq";

-- AlterTable
ALTER TABLE "registrations" DROP CONSTRAINT "registrations_pkey",
ALTER COLUMN "event_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "registrations_pkey" PRIMARY KEY ("event_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "events_event_numeric_id_key" ON "events"("event_numeric_id");

-- AddForeignKey
ALTER TABLE "event_arrangers" ADD CONSTRAINT "event_arrangers_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
