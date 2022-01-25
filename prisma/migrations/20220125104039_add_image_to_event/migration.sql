/*
  Warnings:

  - A unique constraint covering the columns `[image]` on the table `events` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "events" ADD COLUMN     "image" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "events_image_key" ON "events"("image");
