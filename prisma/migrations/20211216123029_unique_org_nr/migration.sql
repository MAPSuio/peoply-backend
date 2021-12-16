/*
  Warnings:

  - A unique constraint covering the columns `[org_nr]` on the table `organizations` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "organizations_org_nr_key" ON "organizations"("org_nr");
