/*
  Warnings:

  - You are about to drop the column `numeric_id` on the `events` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[url_id]` on the table `events` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `url_id` to the `events` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "events_numeric_id_key";

-- AlterTable
ALTER TABLE "events" DROP COLUMN "numeric_id",
ADD COLUMN     "url_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "events_url_id_key" ON "events"("url_id");
