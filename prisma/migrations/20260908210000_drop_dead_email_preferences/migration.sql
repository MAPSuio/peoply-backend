SET lock_timeout = '5s';

ALTER TABLE "users" DROP COLUMN IF EXISTS "allow_email_promotions";
ALTER TABLE "users" DROP COLUMN IF EXISTS "allow_email_on_waitlist";
