-- CreateEnum
CREATE TYPE "UserSeenUpdateType" AS ENUM ('HAS_SET_ALLERGENS');

-- CreateTable
CREATE TABLE "user_seen_updates" (
    "user_id" TEXT NOT NULL,
    "update" "UserSeenUpdateType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_seen_updates_pkey" PRIMARY KEY ("user_id","update")
);

-- AddForeignKey
ALTER TABLE "user_seen_updates" ADD CONSTRAINT "user_seen_updates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
