-- CreateTable
CREATE TABLE "arranger_follower" (
    "arranger_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arranger_follower_pkey" PRIMARY KEY ("arranger_id","user_id")
);

-- AddForeignKey
ALTER TABLE "arranger_follower" ADD CONSTRAINT "arranger_follower_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arranger_follower" ADD CONSTRAINT "arranger_follower_arranger_id_fkey" FOREIGN KEY ("arranger_id") REFERENCES "arrangers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
