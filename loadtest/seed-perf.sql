-- Jeu de données synthétique pour mesures de performance (base dédiée, jamais la production).
-- Toutes les lignes sont marquées isDemo = true. Usage : psql "$PERF_DATABASE_URL" -f loadtest/seed-perf.sql
\set shops 200
\set products 100000
BEGIN;
INSERT INTO "Brand" (id, name, slug, "isActive", featured, "sortOrder", "updatedAt")
SELECT 'perf-brand-' || n, b, lower(b), true, n <= 5, n, now()
FROM unnest(ARRAY['Apple','Samsung','Tecno','Infinix','Xiaomi','itel','Google','Huawei','Oppo','Nokia']) WITH ORDINALITY AS t(b, n)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO "User" (id, name, email, "passwordHash", role, "isDemo", "updatedAt")
SELECT 'perf-user-' || g, 'Vendeur perf ' || g, 'perf' || g || '@perf.togomobile', 'x', 'SELLER', true, now()
FROM generate_series(1, :shops) g;

INSERT INTO "Shop" (id, "ownerId", name, slug, city, whatsapp, status, "validatedAt", "trustedSeller", "isDemo", "updatedAt", "ratingAvg", "ratingCount")
SELECT 'perf-shop-' || g, 'perf-user-' || g, 'Boutique perf ' || g, 'boutique-perf-' || g,
       (ARRAY['Lomé','Kara','Sokodé','Atakpamé','Kpalimé'])[1 + g % 5], '+2289' || lpad(g::text, 7, '0'),
       'ACTIVE', now() - (g || ' days')::interval, true, true, now(), 3 + (g % 20) / 10.0, g % 40
FROM generate_series(1, :shops) g;

INSERT INTO "Product" (id, reference, slug, "shopId", "brandId", model, title, price, condition, availability, stock,
                       "storageGb", "ramGb", status, moderation, "publishedAt", "searchText", "ratingAvg", "ratingCount",
                       "viewCount", "whatsappClicks", "isDemo", "createdAt", "updatedAt")
SELECT 'perf-p-' || g, 'TP-' || lpad(g::text, 6, '0'), 'perf-produit-' || g,
       'perf-shop-' || (1 + g % :shops), b.id, m.model, b.name || ' ' || m.model || ' ' || s.st || ' Go',
       20000 + (g * 7919) % 800000,
       (ARRAY['NEW','LIKE_NEW','REFURBISHED','USED_GOOD','USED_FAIR'])[1 + g % 5]::"ProductCondition",
       (ARRAY['AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','OUT_OF_STOCK','TEMPORARILY_UNAVAILABLE','WITHDRAWN'])[1 + g % 7]::"Availability",
       1 + g % 5, s.st, (ARRAY[2,3,4,6,8,12])[1 + g % 6], 'PUBLISHED', 'APPROVED', now() - ((g % 365) || ' days')::interval,
       lower(b.name || ' ' || m.model || ' ' || s.st || 'go tp-' || lpad(g::text, 6, '0')) || ' | ' || replace(lower(b.name || m.model), ' ', ''),
       CASE WHEN g % 4 = 0 THEN 3 + (g % 20) / 10.0 ELSE 0 END, CASE WHEN g % 4 = 0 THEN g % 30 ELSE 0 END,
       g % 500, g % 50, true, now() - ((g % 365) || ' days')::interval, now()
FROM generate_series(1, :products) g
JOIN LATERAL (SELECT id, name FROM "Brand" WHERE slug = (ARRAY['apple','samsung','tecno','infinix','xiaomi','itel','google','huawei','oppo','nokia'])[1 + g % 10]) b ON true
JOIN LATERAL (SELECT (ARRAY['Galaxy A15','iPhone 13','Camon 20','Hot 30','Redmi Note 12','A70','Pixel 7','P30 Lite','A78','105','Spark 10','Note 30'])[1 + (g / 10) % 12] AS model) m ON true
JOIN LATERAL (SELECT (ARRAY[32,64,128,256,512])[1 + g % 5] AS st) s ON true;

INSERT INTO "ProductMedia" (id, "productId", "shopId", type, status, key, "mediumKey", "thumbKey", mime, size, width, height, position, "isPrimary")
SELECT 'perf-m-' || p.id, p.id, p."shopId", 'IMAGE', 'READY', 'perf/' || p.id || '.webp', 'perf/' || p.id || '-m.webp', 'perf/' || p.id || '-t.webp',
       'image/webp', 120000, 1600, 1600, 0, true
FROM "Product" p WHERE p.id LIKE 'perf-p-%';

INSERT INTO "Promotion" (id, "productId", "shopId", "promoPrice", "referencePrice", "startsAt", "endsAt", status, "isDemo", "updatedAt")
SELECT 'perf-promo-' || p.id, p.id, p."shopId", (p.price * 0.85)::int, p.price, now() - interval '1 day', now() + interval '10 days', 'ACTIVE', true, now()
FROM "Product" p WHERE p.id LIKE 'perf-p-%' AND (substr(p.id, 8))::int % 20 = 0;
COMMIT;
ANALYZE;
