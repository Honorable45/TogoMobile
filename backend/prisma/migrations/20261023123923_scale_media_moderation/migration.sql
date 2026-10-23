-- CreateEnum
CREATE TYPE "ProductModeration" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- AlterEnum
ALTER TYPE "ShopStatus" ADD VALUE 'CHANGES_REQUESTED';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "moderatedAt" TIMESTAMP(3),
ADD COLUMN     "moderation" "ProductModeration" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "moderationNote" TEXT;

-- AlterTable
ALTER TABLE "ProductMedia" ADD COLUMN     "durationSec" DOUBLE PRECISION,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "mediumKey" TEXT,
ADD COLUMN     "originalKey" TEXT,
ADD COLUMN     "posterKey" TEXT,
ADD COLUMN     "status" "MediaStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN     "transcoded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "trustedSeller" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MediaUpload" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "tokenHash" TEXT,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageGarbage" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageGarbage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaUpload_key_key" ON "MediaUpload"("key");

-- CreateIndex
CREATE UNIQUE INDEX "MediaUpload_tokenHash_key" ON "MediaUpload"("tokenHash");

-- CreateIndex
CREATE INDEX "MediaUpload_productId_status_idx" ON "MediaUpload"("productId", "status");

-- CreateIndex
CREATE INDEX "MediaUpload_status_expiresAt_idx" ON "MediaUpload"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "Job_type_status_idx" ON "Job"("type", "status");

-- CreateIndex
CREATE INDEX "StorageGarbage_createdAt_idx" ON "StorageGarbage"("createdAt");

-- CreateIndex
CREATE INDEX "Product_moderation_status_idx" ON "Product"("moderation", "status");

-- CreateIndex
CREATE INDEX "ProductMedia_status_updatedAt_idx" ON "ProductMedia"("status", "updatedAt");

-- ─── Transition des données existantes ──────────────────────────────────────
-- Les annonces déjà en ligne restent visibles : elles sont considérées comme approuvées.
-- Seules les nouvelles publications passeront par la validation (sauf vendeurs de confiance).
UPDATE "Product" SET "moderation" = 'APPROVED', "moderatedAt" = now() WHERE "status" <> 'DRAFT';

-- ─── Collecte des fichiers à supprimer ─────────────────────────────────────
-- Toute suppression d'un média (directe ou en cascade : produit, boutique) enregistre ses fichiers
-- dans "StorageGarbage" ; le worker les supprime ensuite du stockage objet, avec nouvelles tentatives.
CREATE OR REPLACE FUNCTION togomobile_collect_media_garbage() RETURNS trigger AS $$
BEGIN
  INSERT INTO "StorageGarbage" ("id", "key")
  SELECT 'g' || md5(random()::text || clock_timestamp()::text || k), k
  FROM unnest(ARRAY[OLD."key", OLD."mediumKey", OLD."thumbKey", OLD."posterKey", OLD."originalKey"]) AS k
  WHERE k IS NOT NULL;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProductMedia_collect_garbage"
AFTER DELETE ON "ProductMedia"
FOR EACH ROW EXECUTE FUNCTION togomobile_collect_media_garbage();

-- Aucune valeur nulle de clé dupliquée : les médias d'un produit ne peuvent pas pointer vers le même fichier.
CREATE UNIQUE INDEX "ProductMedia_key_unique" ON "ProductMedia" ("key");
