-- CreateEnum
CREATE TYPE "follow_actions" AS ENUM ('FOLLOW', 'UNFOLLOW');

-- CreateTable
CREATE TABLE "arranger_follower_events" (
    "id" TEXT NOT NULL,
    "arranger_id" TEXT NOT NULL,
    "action" "follow_actions" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arranger_follower_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "arranger_follower_events_arranger_id_created_at_idx" ON "arranger_follower_events"("arranger_id", "created_at");

-- AddForeignKey
ALTER TABLE "arranger_follower_events" ADD CONSTRAINT "arranger_follower_events_arranger_id_fkey" FOREIGN KEY ("arranger_id") REFERENCES "arrangers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

