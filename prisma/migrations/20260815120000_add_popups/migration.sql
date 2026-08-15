CREATE TABLE "popups" (
    "id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "popups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "popups_valid_interval" CHECK ("starts_at" < "ends_at"),
    CONSTRAINT "popups_no_overlapping_intervals" EXCLUDE USING GIST (
        tsrange("starts_at", "ends_at", '[)') WITH &&
    )
);

CREATE INDEX "popups_starts_at_ends_at_idx" ON "popups"("starts_at", "ends_at");
