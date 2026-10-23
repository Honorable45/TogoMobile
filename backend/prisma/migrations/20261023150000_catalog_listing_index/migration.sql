-- Index partiel du tri par défaut du catalogue (disponibles d'abord, puis plus récents).
-- Ne couvre que les annonces publiques : petit, et utilisable avec LIMIT sans trier tout le catalogue.
-- Non représentable dans schema.prisma (expression + condition) : Prisma l'ignore dans ses comparaisons.
CREATE INDEX IF NOT EXISTS "Product_listing_recent_idx"
  ON "Product" ((availability = 'AVAILABLE') DESC, "publishedAt" DESC NULLS LAST, id)
  WHERE status = 'PUBLISHED' AND moderation = 'APPROVED' AND "removedAt" IS NULL AND availability <> 'WITHDRAWN';
