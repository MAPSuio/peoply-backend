-- CreateEnum
CREATE TYPE "organization_roles" AS ENUM ('ADMIN');

-- CreateEnum
CREATE TYPE "event_arranger_roles" AS ENUM ('ADMIN', 'COLLABORATOR');

-- CreateEnum
CREATE TYPE "reg_status" AS ENUM ('PENDING', 'COMPLETE');

-- CreateTable
CREATE TABLE "organizations" (
    "organization_id" TEXT NOT NULL,
    "arranger_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "org_nr" VARCHAR(9) NOT NULL,
    "image" VARCHAR(100),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" TEXT NOT NULL,
    "arranger_id" TEXT NOT NULL,
    "phone" BIGINT NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" TEXT,
    "email" TEXT NOT NULL,
    "image" TEXT,
    "birth_date" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
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
    "arranger_id" TEXT NOT NULL,
    "is_business" BOOLEAN NOT NULL,

    CONSTRAINT "arrangers_pkey" PRIMARY KEY ("arranger_id")
);

-- CreateTable
CREATE TABLE "events" (
    "event_id" SERIAL NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" TEXT NOT NULL,
    "capacity" INTEGER,
    "private" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "event_arrangers" (
    "event_id" INTEGER NOT NULL,
    "arranger_id" TEXT NOT NULL,
    "role" "event_arranger_roles" NOT NULL,

    CONSTRAINT "event_arrangers_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "event_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "reg_date" TIMESTAMP(3) NOT NULL,
    "reg_status" "reg_status" NOT NULL,
    "attendance" BOOLEAN NOT NULL,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("event_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_arranger_id_key" ON "organizations"("arranger_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_arranger_id_key" ON "users"("arranger_id");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_arranger_id_fkey" FOREIGN KEY ("arranger_id") REFERENCES "arrangers"("arranger_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_arranger_id_fkey" FOREIGN KEY ("arranger_id") REFERENCES "arrangers"("arranger_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_organization_roles" ADD CONSTRAINT "user_organization_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_organization_roles" ADD CONSTRAINT "user_organization_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_arrangers" ADD CONSTRAINT "event_arrangers_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_arrangers" ADD CONSTRAINT "event_arrangers_arranger_id_fkey" FOREIGN KEY ("arranger_id") REFERENCES "arrangers"("arranger_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
