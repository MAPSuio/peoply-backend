/*
  Warnings:

  - A unique constraint covering the columns `[url_id]` on the table `organizations` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "url_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_url_id_key" ON "organizations"("url_id");
