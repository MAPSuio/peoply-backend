-- CreateEnum
CREATE TYPE "food_preferences" AS ENUM ('PESCETARIAN', 'VEGETARIAN', 'VEGAN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "food_preference" "food_preferences";
