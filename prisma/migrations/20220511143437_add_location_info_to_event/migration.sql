/*
  Warnings:

  - Added the required column `location_name` to the `events` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "events" ADD COLUMN     "country" VARCHAR(100),
ADD COLUMN     "country_code" VARCHAR(2),
ADD COLUMN     "country_code_iso3" VARCHAR(3),
ADD COLUMN     "country_subdivision" VARCHAR(100),
ADD COLUMN     "free_form_address" VARCHAR(100),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "local_name" VARCHAR(100),
ADD COLUMN     "location_name" VARCHAR(100) NOT NULL DEFAULT 'Intet sted angitt',
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "municipality" VARCHAR(100),
ADD COLUMN     "poi_name" VARCHAR(100),
ADD COLUMN     "postal_code" VARCHAR(20),
ADD COLUMN     "street_name" VARCHAR(100),
ADD COLUMN     "street_number" VARCHAR(20);
