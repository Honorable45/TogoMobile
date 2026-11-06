-- Trois rayons principaux affichés sur le site : Téléphones, Ordinateurs, Smart TV.
-- Les catégories existantes (smartphones, téléphones à touches, tablettes) deviennent des sous-catégories de « Téléphones ».
INSERT INTO "Category" (id, name, slug, "isActive", "sortOrder", "updatedAt") VALUES
  ('cat_telephones', 'Téléphones', 'telephones', true, 0, now()),
  ('cat_ordinateurs', 'Ordinateurs', 'ordinateurs', true, 10, now()),
  ('cat_smart_tv', 'Smart TV', 'smart-tv', true, 20, now())
ON CONFLICT (slug) DO NOTHING;

UPDATE "Category" c
SET "parentId" = (SELECT id FROM "Category" WHERE slug = 'telephones'),
    "sortOrder" = CASE c.slug WHEN 'smartphones' THEN 1 WHEN 'telephones-a-touches' THEN 2 ELSE 3 END,
    "updatedAt" = now()
WHERE c.slug IN ('smartphones', 'telephones-a-touches', 'tablettes') AND c."parentId" IS NULL;

-- Le site ne vendait jusqu'ici que des téléphones : les annonces sans catégorie sont rangées dans « Téléphones ».
UPDATE "Product" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'telephones')
WHERE "categoryId" IS NULL;
