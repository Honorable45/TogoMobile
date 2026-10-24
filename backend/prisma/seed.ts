/**
 * Données initiales.
 *
 *   pnpm seed            → référentiels (marques, catégories) — sans risque en production, idempotent
 *   pnpm seed -- --demo  → référentiels + données fictives de démonstration (isDemo = true)
 *   pnpm seed:clear      → supprime toutes les données de démonstration
 *
 * Les données de démonstration sont refusées en production sauf ALLOW_DEMO_SEED=true.
 * Les mots de passe des comptes de démonstration sont aléatoires (ou SEED_DEMO_PASSWORD) et affichés une seule fois.
 */
import { PrismaClient, Prisma, ProductCondition, Availability } from '@prisma/client';
import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import { hashPassword, hmac, publicReference, randomToken } from '../src/common/crypto';
import { buildSearchText, slugify } from '../src/common/text';
import { env } from '../src/config/env';
import { LocalStorageService, S3StorageService, StorageService } from '../src/storage/storage.service';

const prisma = new PrismaClient();

const BRANDS: Array<{ name: string; featured: boolean }> = [
  { name: 'Apple', featured: true },
  { name: 'Samsung', featured: true },
  { name: 'Tecno', featured: true },
  { name: 'Infinix', featured: true },
  { name: 'Xiaomi', featured: true },
  { name: 'itel', featured: false },
  { name: 'Google', featured: false },
  { name: 'Huawei', featured: false },
  { name: 'Oppo', featured: false },
  { name: 'Nokia', featured: false },
];

const CATEGORIES = ['Smartphones', 'Téléphones à touches', 'Tablettes'];

async function seedReferentials() {
  for (const [i, b] of BRANDS.entries()) {
    await prisma.brand.upsert({
      where: { slug: slugify(b.name) },
      update: {},
      create: { name: b.name, slug: slugify(b.name), featured: b.featured, sortOrder: i },
    });
  }
  for (const [i, name] of CATEGORIES.entries()) {
    await prisma.category.upsert({ where: { slug: slugify(name) }, update: {}, create: { name, slug: slugify(name), sortOrder: i } });
  }
  console.log(`Référentiels : ${BRANDS.length} marques, ${CATEGORIES.length} catégories.`);
}

// ─── Démonstration ──────────────────────────────────────────────────────────

const storage: StorageService = env().storage.driver === 's3' ? new S3StorageService() : new LocalStorageService();

/** Visuel de démonstration généré (aucune photo réelle n'est copiée). */
async function demoImage(label: string, hue: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
    <rect width="1200" height="1200" fill="hsl(${hue},18%,94%)"/>
    <rect x="390" y="170" width="420" height="860" rx="64" fill="hsl(${hue},22%,22%)"/>
    <rect x="414" y="200" width="372" height="800" rx="44" fill="hsl(${hue},45%,58%)"/>
    <rect x="560" y="214" width="80" height="18" rx="9" fill="hsl(${hue},22%,22%)"/>
    <text x="600" y="1110" font-family="Arial, sans-serif" font-size="44" font-weight="700" text-anchor="middle" fill="hsl(${hue},25%,25%)">${label}</text>
    <text x="600" y="1160" font-family="Arial, sans-serif" font-size="30" text-anchor="middle" fill="hsl(${hue},12%,45%)">Visuel de démonstration</text>
  </svg>`;
  const base = sharp(Buffer.from(svg));
  return {
    main: await base.clone().resize(1200).webp({ quality: 80 }).toBuffer(),
    thumb: await base.clone().resize(480).webp({ quality: 72 }).toBuffer(),
  };
}

interface DemoProduct {
  brand: string;
  model: string;
  storageGb: number;
  ramGb?: number;
  price: number;
  condition: ProductCondition;
  availability?: Availability;
  stock?: number;
  color?: string;
  specs?: Record<string, string>;
  defects?: string;
  warranty?: string;
  accessories?: string;
  promo?: { price: number; startsInDays?: number; days: number };
  reviews?: number[];
}

const SHOPS: Array<{ name: string; city: string; district: string; whatsapp: string; hue: number; products: DemoProduct[] }> = [
  {
    name: 'Lomé Phones (démo)',
    city: 'Lomé',
    district: 'Déckon',
    whatsapp: '+22890000001',
    hue: 160,
    products: [
      { brand: 'Apple', model: 'iPhone 13', storageGb: 128, ramGb: 4, price: 365000, condition: 'LIKE_NEW', color: 'Minuit', warranty: '3 mois boutique', accessories: 'Câble USB-C vers Lightning', specs: { screen: '6,1 pouces OLED', processor: 'Apple A15 Bionic', os: 'iOS', batteryHealth: '89 %', connectivity: '5G, Wi-Fi 6' }, promo: { price: 339000, days: 10 }, reviews: [5, 4, 5] },
      { brand: 'Apple', model: 'iPhone 12', storageGb: 64, ramGb: 4, price: 255000, condition: 'USED_GOOD', color: 'Bleu', defects: 'Légères rayures sur le contour', specs: { screen: '6,1 pouces OLED', processor: 'Apple A14 Bionic', batteryHealth: '84 %' }, reviews: [4] },
      { brand: 'Samsung', model: 'Galaxy S23', storageGb: 256, ramGb: 8, price: 520000, condition: 'NEW', color: 'Noir', warranty: '12 mois', specs: { screen: '6,1 pouces Dynamic AMOLED 2X', processor: 'Snapdragon 8 Gen 2', battery: '3 900 mAh', connectivity: '5G' } },
      { brand: 'Samsung', model: 'Galaxy A15', storageGb: 128, ramGb: 4, price: 98000, condition: 'NEW', color: 'Bleu nuit', warranty: '12 mois', specs: { screen: '6,5 pouces Super AMOLED', battery: '5 000 mAh', sim: 'Double SIM' }, promo: { price: 89000, days: 7 } },
      { brand: 'Apple', model: 'iPhone 11', storageGb: 64, price: 175000, condition: 'USED_FAIR', availability: 'OUT_OF_STOCK', stock: 0, defects: 'Écran remplacé (pièce compatible)' },
      { brand: 'Google', model: 'Pixel 7', storageGb: 128, ramGb: 8, price: 210000, condition: 'REFURBISHED', color: 'Neige', warranty: '6 mois', specs: { processor: 'Google Tensor G2', os: 'Android 14' } },
    ],
  },
  {
    name: 'Kara Mobile (démo)',
    city: 'Kara',
    district: 'Centre-ville',
    whatsapp: '+22891000002',
    hue: 25,
    products: [
      { brand: 'Tecno', model: 'Camon 20', storageGb: 256, ramGb: 8, price: 125000, condition: 'NEW', color: 'Gris', warranty: '12 mois', specs: { screen: '6,67 pouces AMOLED', battery: '5 000 mAh', rearCamera: '64 Mpx' }, promo: { price: 112000, days: 14 }, reviews: [5, 5] },
      { brand: 'Tecno', model: 'Spark 10', storageGb: 128, ramGb: 4, price: 69000, condition: 'NEW', color: 'Bleu', warranty: '12 mois', specs: { battery: '5 000 mAh', sim: 'Double SIM' } },
      { brand: 'Infinix', model: 'Hot 30', storageGb: 128, ramGb: 8, price: 85000, condition: 'NEW', color: 'Vert', warranty: '12 mois', specs: { screen: '6,78 pouces', battery: '5 000 mAh' }, reviews: [4, 3] },
      { brand: 'Infinix', model: 'Note 30', storageGb: 256, ramGb: 8, price: 118000, condition: 'NEW', availability: 'TEMPORARILY_UNAVAILABLE', color: 'Noir' },
      { brand: 'itel', model: 'A70', storageGb: 64, ramGb: 3, price: 48000, condition: 'NEW', warranty: '6 mois', promo: { price: 44000, startsInDays: 2, days: 7 } },
      { brand: 'Nokia', model: '105', storageGb: 1, price: 12000, condition: 'NEW', specs: { battery: '1 000 mAh', sim: 'Double SIM' } },
    ],
  },
  {
    name: 'Atakpamé Tech (démo)',
    city: 'Atakpamé',
    district: 'Agbonou',
    whatsapp: '+22892000003',
    hue: 220,
    products: [
      { brand: 'Xiaomi', model: 'Redmi Note 12', storageGb: 128, ramGb: 6, price: 115000, condition: 'NEW', color: 'Gris onyx', warranty: '12 mois', specs: { screen: '6,67 pouces AMOLED 120 Hz', processor: 'Snapdragon 685', battery: '5 000 mAh' }, promo: { price: 99000, days: 5 }, reviews: [5, 4, 4] },
      { brand: 'Xiaomi', model: 'Redmi 12C', storageGb: 64, ramGb: 4, price: 62000, condition: 'NEW', color: 'Bleu' },
      { brand: 'Samsung', model: 'Galaxy A54', storageGb: 128, ramGb: 8, price: 195000, condition: 'LIKE_NEW', color: 'Lime', defects: 'Aucun défaut visible', specs: { connectivity: '5G' } },
      { brand: 'Huawei', model: 'P30 Lite', storageGb: 128, ramGb: 4, price: 78000, condition: 'USED_GOOD', defects: 'Petite rayure au dos', specs: { os: 'Android 10 (sans services Google récents)' } },
      { brand: 'Oppo', model: 'A78', storageGb: 128, ramGb: 8, price: 132000, condition: 'NEW', warranty: '12 mois' },
      { brand: 'Apple', model: 'iPhone 14 Pro', storageGb: 256, ramGb: 6, price: 640000, condition: 'REFURBISHED', color: 'Violet intense', warranty: '6 mois', specs: { screen: '6,1 pouces OLED 120 Hz', processor: 'Apple A16 Bionic', batteryHealth: '92 %' } },
    ],
  },
];

const DEMO_COMMENTS = [
  'Téléphone conforme à l’annonce, vendeur sérieux et réactif sur WhatsApp.',
  'Bon rapport qualité-prix. Livraison rapide à Lomé.',
  'Appareil en très bon état, batterie correcte. Je recommande.',
  'Le vendeur a pris le temps de tout configurer avec moi.',
  null,
];

async function seedDemo() {
  if (env().isProd && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Données de démonstration refusées en production (définissez ALLOW_DEMO_SEED=true pour forcer).');
  }
  const existing = await prisma.shop.count({ where: { isDemo: true } });
  if (existing) {
    console.log('Des données de démonstration existent déjà. Lancez « pnpm seed:clear » pour les supprimer avant de recommencer.');
    return;
  }
  const password = process.env.SEED_DEMO_PASSWORD || `Demo-${randomBytes(6).toString('base64url')}1`;
  const passwordHash = await hashPassword(password);
  const brands = new Map((await prisma.brand.findMany()).map((b) => [b.name, b]));
  const smartphones = await prisma.category.findUnique({ where: { slug: 'smartphones' } });
  const basic = await prisma.category.findUnique({ where: { slug: slugify('Téléphones à touches') } });

  const customers = await Promise.all(
    ['Afi Démo', 'Komla Démo', 'Esi Démo'].map((name, i) =>
      prisma.user.create({ data: { name, email: `client${i + 1}@demo.togomobile.test`, passwordHash, isDemo: true } }),
    ),
  );

  const now = Date.now();
  const DAY = 24 * 3600_000;
  let reviewIdx = 0;

  for (const [si, s] of SHOPS.entries()) {
    const owner = await prisma.user.create({
      data: { name: `Vendeur ${s.city} Démo`, email: `vendeur${si + 1}@demo.togomobile.test`, passwordHash, role: 'SELLER', isDemo: true },
    });
    const shop = await prisma.shop.create({
      data: {
        ownerId: owner.id,
        name: s.name,
        slug: slugify(s.name),
        description: 'Boutique fictive créée pour la démonstration de la plateforme. Aucun produit n’est réellement en vente.',
        city: s.city,
        district: s.district,
        whatsapp: s.whatsapp,
        socialLinks: { facebook: 'https://www.facebook.com/', instagram: 'https://www.instagram.com/' },
        openingHours: 'Lun–Sam 8 h–19 h',
        status: 'ACTIVE',
        validatedAt: new Date(now - (60 - si * 10) * DAY),
        isDemo: true,
      },
    });

    for (const [pi, d] of s.products.entries()) {
      const brand = brands.get(d.brand)!;
      const storageText = d.storageGb >= 1024 ? `${d.storageGb / 1024} To` : d.storageGb > 1 ? `${d.storageGb} Go` : '';
      const title = [d.brand, d.model, storageText].filter(Boolean).join(' ');
      const reference = publicReference();
      const publishedAt = new Date(now - (pi * 2 + si) * DAY - 3600_000);
      const product = await prisma.product.create({
        data: {
          shopId: shop.id,
          brandId: brand.id,
          categoryId: d.storageGb <= 1 ? basic?.id : smartphones?.id,
          model: d.model,
          title,
          reference,
          slug: `${slugify(title, 70)}-${reference.slice(3).toLowerCase()}`,
          description: `${title} proposé par une boutique de démonstration. Annonce fictive.`,
          price: d.price,
          condition: d.condition,
          availability: d.availability ?? 'AVAILABLE',
          stock: d.stock ?? 3,
          storageGb: d.storageGb > 1 ? d.storageGb : null,
          ramGb: d.ramGb ?? null,
          color: d.color,
          warranty: d.warranty,
          accessories: d.accessories,
          defects: d.defects,
          specs: (d.specs ?? {}) as Prisma.InputJsonValue,
          searchText: buildSearchText([d.brand, d.model, title, reference, `${d.storageGb}go`, d.color]),
          status: 'PUBLISHED',
          publishedAt,
          viewCount: 20 + ((pi * 37 + si * 11) % 140),
          whatsappClicks: (pi * 7 + si * 3) % 25,
          isDemo: true,
          createdAt: publishedAt,
        },
      });
      // Le prix habituel est en place depuis plus de 30 jours : le prix de référence est donc réel.
      await prisma.priceHistory.create({ data: { productId: product.id, price: d.price, createdAt: new Date(now - 45 * DAY) } });

      const img = await demoImage(`${d.brand} ${d.model}`, (s.hue + pi * 23) % 360);
      const base = `products/${product.id}/${randomToken(8).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      await storage.put(`${base}.webp`, img.main, 'image/webp');
      await storage.put(`${base}-thumb.webp`, img.thumb, 'image/webp');
      await prisma.productMedia.create({
        data: { productId: product.id, shopId: shop.id, type: 'IMAGE', key: `${base}.webp`, thumbKey: `${base}-thumb.webp`, mime: 'image/webp', size: img.main.length, width: 1200, height: 1200, isPrimary: true },
      });

      if (d.promo) {
        const startsAt = new Date(now + (d.promo.startsInDays ?? 0) * DAY - (d.promo.startsInDays ? 0 : DAY));
        const promo = await prisma.promotion.create({
          data: {
            productId: product.id,
            shopId: shop.id,
            promoPrice: d.promo.price,
            referencePrice: d.price,
            startsAt,
            endsAt: new Date(startsAt.getTime() + d.promo.days * DAY),
            conditions: 'Offre de démonstration',
            isDemo: true,
          },
        });
        await prisma.promotionEvent.create({ data: { promotionId: promo.id, actorId: owner.id, type: 'CREATED', data: { demo: true } } });
      }

      for (const rating of d.reviews ?? []) {
        const buyer = customers[reviewIdx % customers.length];
        const sale = await prisma.sale.create({
          data: {
            shopId: shop.id,
            productId: product.id,
            declaredById: owner.id,
            internalRef: `DEMO-${reviewIdx + 1}`,
            soldAt: new Date(now - (5 + reviewIdx) * DAY),
            buyerPhoneHash: hmac(`+2289900${String(reviewIdx).padStart(4, '0')}`),
            buyerPhoneHint: String(reviewIdx).padStart(2, '0').slice(-2),
            buyerId: buyer.id,
            status: 'VERIFIED',
            confirmedAt: new Date(now - (4 + reviewIdx) * DAY),
            verifiedAt: new Date(now - (4 + reviewIdx) * DAY),
            isDemo: true,
          },
        });
        await prisma.review.create({
          data: {
            authorId: buyer.id,
            productId: product.id,
            shopId: shop.id,
            saleId: sale.id,
            rating,
            comment: DEMO_COMMENTS[reviewIdx % DEMO_COMMENTS.length],
            status: 'PUBLISHED',
            verification: 'VERIFIED_PURCHASE',
            isDemo: true,
            createdAt: new Date(now - (4 + reviewIdx) * DAY),
          },
        });
        reviewIdx++;
      }
    }

    // Notes calculées à partir des avis publiés, comme en fonctionnement normal.
    for (const p of await prisma.product.findMany({ where: { shopId: shop.id } })) {
      const agg = await prisma.review.aggregate({ where: { productId: p.id, status: 'PUBLISHED', verification: 'VERIFIED_PURCHASE' }, _avg: { rating: true }, _count: true });
      await prisma.product.update({ where: { id: p.id }, data: { ratingAvg: Math.round((agg._avg.rating ?? 0) * 100) / 100, ratingCount: agg._count } });
    }
    const agg = await prisma.review.aggregate({ where: { shopId: shop.id, status: 'PUBLISHED', verification: 'VERIFIED_PURCHASE' }, _avg: { rating: true }, _count: true });
    await prisma.shop.update({ where: { id: shop.id }, data: { ratingAvg: Math.round((agg._avg.rating ?? 0) * 100) / 100, ratingCount: agg._count } });
  }

  console.log('\nDonnées de démonstration créées (toutes marquées isDemo).');
  console.log('Comptes (mot de passe commun, affiché une seule fois) :');
  console.log('  vendeur1@demo.togomobile.test, vendeur2@…, vendeur3@… (vendeurs)');
  console.log('  client1@demo.togomobile.test, client2@…, client3@… (clients)');
  console.log(`  Mot de passe : ${password}\n`);
}

async function clearDemo() {
  const shops = await prisma.shop.findMany({ where: { isDemo: true }, select: { id: true } });
  const shopIds = shops.map((s) => s.id);
  const media = await prisma.productMedia.findMany({ where: { shopId: { in: shopIds } } });
  const users = await prisma.user.findMany({ where: { isDemo: true }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  await prisma.$transaction([
    prisma.review.deleteMany({ where: { OR: [{ shopId: { in: shopIds } }, { authorId: { in: userIds } }] } }),
    prisma.sale.deleteMany({ where: { OR: [{ shopId: { in: shopIds } }, { declaredById: { in: userIds } }] } }),
    prisma.product.deleteMany({ where: { shopId: { in: shopIds } } }),
    prisma.shop.deleteMany({ where: { id: { in: shopIds } } }),
    prisma.report.deleteMany({ where: { authorId: { in: userIds } } }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ]);
  await Promise.all(media.flatMap((m) => [storage.delete(m.key), m.thumbKey ? storage.delete(m.thumbKey) : null]));
  console.log(`Données de démonstration supprimées : ${shopIds.length} boutiques, ${userIds.length} comptes, ${media.length} médias.`);
}

/**
 * Supprime les données créées par les tests de bout en bout (comptes en @test.togomobile).
 * Ne touche ni aux données réelles ni aux données de démonstration.
 */
async function clearE2e() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: '@test.togomobile' } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const shops = await prisma.shop.findMany({ where: { ownerId: { in: userIds } }, select: { id: true } });
  const shopIds = shops.map((s) => s.id);
  const media = await prisma.productMedia.findMany({ where: { shopId: { in: shopIds } } });
  const ads = await prisma.heroAd.findMany({ where: { createdById: { in: userIds } }, select: { id: true, imageKey: true, mobileImageKey: true } });
  await prisma.$transaction([
    prisma.heroAd.deleteMany({ where: { id: { in: ads.map((a) => a.id) } } }),
    prisma.review.deleteMany({ where: { OR: [{ shopId: { in: shopIds } }, { authorId: { in: userIds } }] } }),
    prisma.sale.deleteMany({ where: { OR: [{ shopId: { in: shopIds } }, { declaredById: { in: userIds } }, { buyerId: { in: userIds } }] } }),
    prisma.product.deleteMany({ where: { shopId: { in: shopIds } } }),
    prisma.shop.deleteMany({ where: { id: { in: shopIds } } }),
    prisma.report.deleteMany({ where: { authorId: { in: userIds } } }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ]);
  await Promise.all([
    ...media.flatMap((m) => [storage.delete(m.key), m.thumbKey ? storage.delete(m.thumbKey) : null]),
    ...ads.flatMap((a) => [storage.delete(a.imageKey), storage.delete(a.mobileImageKey)]),
  ]);
  // Les notes des boutiques de démonstration sont recalculées (des avis de test ont pu y être déposés).
  for (const s of await prisma.shop.findMany({ select: { id: true } })) {
    const agg = await prisma.review.aggregate({ where: { shopId: s.id, status: 'PUBLISHED', verification: 'VERIFIED_PURCHASE' }, _avg: { rating: true }, _count: true });
    await prisma.shop.update({ where: { id: s.id }, data: { ratingAvg: Math.round((agg._avg.rating ?? 0) * 100) / 100, ratingCount: agg._count } });
  }
  console.log(`Données de test supprimées : ${userIds.length} comptes, ${shopIds.length} boutiques, ${media.length} médias, ${ads.length} publicités.`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--clear')) return clearDemo();
  if (args.includes('--clear-e2e')) return clearE2e();
  await seedReferentials();
  if (args.includes('--demo') || process.env.SEED_DEMO === 'true') await seedDemo();
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
