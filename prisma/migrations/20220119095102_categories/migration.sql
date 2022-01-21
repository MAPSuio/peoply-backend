-- CreateTable
CREATE TABLE "categories" (
    "category_id" TEXT NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "event_categories" (
    "category_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,

    CONSTRAINT "event_categories_pkey" PRIMARY KEY ("category_id","event_id")
);
