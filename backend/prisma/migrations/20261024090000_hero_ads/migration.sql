-- CreateTable
CREATE TABLE "HeroAd" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "advertiser" TEXT,
    "linkUrl" TEXT,
    "imageKey" TEXT NOT NULL,
    "mobileImageKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeroAd_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HeroAd_isActive_sortOrder_idx" ON "HeroAd"("isActive", "sortOrder");

