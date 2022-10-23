-- AlterTable
ALTER TABLE "users" ADD COLUMN     "allow_email_from_arranger" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allow_email_on_waitlist" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allow_email_promotions" BOOLEAN NOT NULL DEFAULT false;
