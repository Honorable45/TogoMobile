-- Index partiel de la liste « les plus consultés » (accueil) : évite un parcours complet du catalogue
-- à chaque affichage (mesuré : 51 ms en parcours séquentiel sur 100 000 annonces → voir le rapport).
CREATE INDEX IF NOT EXISTS "Product_popular_idx"
  ON "Product" ("whatsappClicks" DESC, "viewCount" DESC)
  WHERE status = 'PUBLISHED' AND moderation = 'APPROVED' AND "removedAt" IS NULL AND availability = 'AVAILABLE';
