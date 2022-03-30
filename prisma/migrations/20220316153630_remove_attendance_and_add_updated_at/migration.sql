/*
  Warnings:

  - You are about to drop the column `attendance` on the `registrations` table. All the data in the column will be lost.
  - You are about to drop the column `reg_date` on the `registrations` table. All the data in the column will be lost.
  - Added the required column `updated_at` to the `registrations` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "registrations" DROP COLUMN "attendance",
DROP COLUMN "reg_date",
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "reg_status" DROP DEFAULT;
