-- CreateEnum
CREATE TYPE "providers" AS ENUM ('VIPPS');

-- CreateEnum
CREATE TYPE "organization_roles" AS ENUM ('ADMIN');

-- CreateEnum
CREATE TYPE "visibility" AS ENUM ('PUBLIC', 'PRIVATE', 'UNLISTED');

-- CreateEnum
CREATE TYPE "event_arranger_roles" AS ENUM ('ADMIN', 'COLLABORATOR');

-- CreateEnum
CREATE TYPE "reg_statuses" AS ENUM ('INVITED', 'GOING', 'NOT_GOING', 'WAITLISTED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "arranger_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "org_nr" VARCHAR(9) NOT NULL,
    "image" VARCHAR(100),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "arranger_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "email" TEXT NOT NULL,
    "image" TEXT,
    "birth_date" DATE,
    "description" VARCHAR(120),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_users" (
    "sub" TEXT NOT NULL,
    "provider" "providers" NOT NULL,
    "id" TEXT NOT NULL,

    CONSTRAINT "provider_users_pkey" PRIMARY KEY ("sub","provider")
);

-- CreateTable
CREATE TABLE "user_organization_roles" (
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "organization_roles" NOT NULL,

    CONSTRAINT "user_organization_roles_pkey" PRIMARY KEY ("organization_id","user_id")
);

-- CreateTable
CREATE TABLE "arrangers" (
    "id" TEXT NOT NULL,
    "is_business" BOOLEAN NOT NULL,

    CONSTRAINT "arrangers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "numeric_id" SERIAL NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" TEXT NOT NULL,
    "capacity" INTEGER,
    "visibility" "visibility" NOT NULL,
    "image" TEXT,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_arrangers" (
    "event_id" TEXT NOT NULL,
    "arranger_id" TEXT NOT NULL,
    "role" "event_arranger_roles" NOT NULL,

    CONSTRAINT "event_arrangers_pkey" PRIMARY KEY ("event_id","arranger_id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reg_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reg_status" "reg_statuses" NOT NULL DEFAULT E'INVITED',
    "attendance" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("event_id","user_id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_categories" (
    "category_id" INTEGER NOT NULL,
    "event_id" TEXT NOT NULL,

    CONSTRAINT "event_categories_pkey" PRIMARY KEY ("category_id","event_id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "favorited_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("event_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_arranger_id_key" ON "organizations"("arranger_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_org_nr_key" ON "organizations"("org_nr");

-- CreateIndex
CREATE UNIQUE INDEX "users_arranger_id_key" ON "users"("arranger_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "events_numeric_id_key" ON "events"("numeric_id");

-- CreateIndex
CREATE UNIQUE INDEX "events_image_key" ON "events"("image");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_arranger_id_fkey" FOREIGN KEY ("arranger_id") REFERENCES "arrangers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_arranger_id_fkey" FOREIGN KEY ("arranger_id") REFERENCES "arrangers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_users" ADD CONSTRAINT "provider_users_id_fkey" FOREIGN KEY ("id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_organization_roles" ADD CONSTRAINT "user_organization_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_organization_roles" ADD CONSTRAINT "user_organization_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_arrangers" ADD CONSTRAINT "event_arrangers_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_arrangers" ADD CONSTRAINT "event_arrangers_arranger_id_fkey" FOREIGN KEY ("arranger_id") REFERENCES "arrangers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
