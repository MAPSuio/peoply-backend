-- CreateEnum
CREATE TYPE "providers" AS ENUM ('VIPPS');

-- CreateTable
CREATE TABLE "provider_users" (
    "provider_sub" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "providers" NOT NULL,

    CONSTRAINT "provider_users_pkey" PRIMARY KEY ("provider_sub","provider")
);

-- AddForeignKey
ALTER TABLE "provider_users" ADD CONSTRAINT "provider_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
