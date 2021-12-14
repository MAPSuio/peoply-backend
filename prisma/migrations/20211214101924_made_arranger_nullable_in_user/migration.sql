-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_arranger_id_fkey";

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "arranger_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_arranger_id_fkey" FOREIGN KEY ("arranger_id") REFERENCES "arrangers"("arranger_id") ON DELETE SET NULL ON UPDATE CASCADE;
