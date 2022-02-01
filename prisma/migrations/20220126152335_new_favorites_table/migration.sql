/*
  Warnings:

  - The values [INTERESTED] on the enum `reg_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "reg_status_new" AS ENUM ('INVITED', 'GOING', 'NOT_GOING', 'WAITLISTED');
ALTER TABLE "registrations" ALTER COLUMN "reg_status" DROP DEFAULT;
ALTER TABLE "registrations" ALTER COLUMN "reg_status" TYPE "reg_status_new" USING ("reg_status"::text::"reg_status_new");
ALTER TYPE "reg_status" RENAME TO "reg_status_old";
ALTER TYPE "reg_status_new" RENAME TO "reg_status";
DROP TYPE "reg_status_old";
ALTER TABLE "registrations" ALTER COLUMN "reg_status" SET DEFAULT 'INVITED';
COMMIT;

-- CreateTable
CREATE TABLE "favorites" (
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "favorite_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("event_id","user_id")
);

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;
