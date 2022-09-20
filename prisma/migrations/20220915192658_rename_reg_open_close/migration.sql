/*
  Warnings:

  - You are about to drop the column `reg_close_date` on the `events` table. All the data in the column will be lost.
  - You are about to drop the column `reg_open_date` on the `events` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "events" DROP COLUMN "reg_close_date",
DROP COLUMN "reg_open_date",
ADD COLUMN     "reg_end" TIMESTAMP(3),
ADD COLUMN     "reg_start" TIMESTAMP(3);
