/*
  Warnings:

  - The values [PENDING,COMPLETE] on the enum `reg_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "reg_status_new" AS ENUM ('INVITED', 'GOING', 'NOT_GOING', 'WAITLISTED', 'INTERESTED');
ALTER TABLE "registrations" ALTER COLUMN "reg_status" TYPE "reg_status_new" USING ("reg_status"::text::"reg_status_new");
ALTER TYPE "reg_status" RENAME TO "reg_status_old";
ALTER TYPE "reg_status_new" RENAME TO "reg_status";
DROP TYPE "reg_status_old";
COMMIT;
