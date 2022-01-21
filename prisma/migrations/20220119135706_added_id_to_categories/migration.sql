/*
  Warnings:

  - The primary key for the `categories` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `category_id` column on the `categories` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `event_categories` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `category` to the `categories` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `category_id` on the `event_categories` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "event_categories" DROP CONSTRAINT "event_categories_category_id_fkey";

-- AlterTable
ALTER TABLE "categories" DROP CONSTRAINT "categories_pkey",
ADD COLUMN     "category" TEXT NOT NULL,
DROP COLUMN "category_id",
ADD COLUMN     "category_id" SERIAL NOT NULL,
ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("category_id");

-- AlterTable
ALTER TABLE "event_categories" DROP CONSTRAINT "event_categories_pkey",
DROP COLUMN "category_id",
ADD COLUMN     "category_id" INTEGER NOT NULL,
ADD CONSTRAINT "event_categories_pkey" PRIMARY KEY ("category_id", "event_id");

-- AddForeignKey
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("category_id") ON DELETE CASCADE ON UPDATE CASCADE;
