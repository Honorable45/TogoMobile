/**
 * Jeu de données de démonstration volumineux : 30 boutiques × 100 produits (paramétrable).
 *
 *   pnpm --filter backend seed:bulk                       → crée les boutiques et produits
 *   pnpm --filter backend seed:bulk -- --shops=10 --products=50
 *   pnpm --filter backend seed:bulk -- --no-images        → sans photos (beaucoup plus rapide)
 *   pnpm --filter backend seed:bulk -- --preview=planche.jpg → planche contact des photos, sans toucher à la base
 *   pnpm --filter backend seed:bulk -- --clear            → supprime uniquement ce jeu de données
 *
 * Toutes les lignes sont marquées isDemo = true (« pnpm seed:clear » les supprime aussi).
 * Les comptes vendeurs utilisent le domaine @bulk.togomobile.test.
 * En production : refusé sauf ALLOW_DEMO_SEED=true. Les visuels sont envoyés sur le stockage configuré
 * (STORAGE_DRIVER : cloudinary, s3 ou local).
 *
 * Photos : vraies photos des modèles, sous licence libre (Wikimedia Commons), trois par annonce (face, dos, autre).
 * Chaque annonce reçoit ses propres fichiers : un fichier partagé serait supprimé du stockage dès qu'un vendeur
 * retire l'une des annonces (déclencheur StorageGarbage). Auteurs et licences sont cités dans la description.
 */
import { PrismaClient, Prisma, ProductCondition, Availability } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword, publicReference } from '../src/common/crypto';
import { buildSearchText, slugify } from '../src/common/text';
import { env } from '../src/config/env';
import { CloudinaryStorageService, LocalStorageService, S3StorageService, StorageService } from '../src/storage/storage.service';
import { PhotoRef, PhotoVariants, photoInfos, photoVariants, previewSheet } from './seed-photos';

const prisma = new PrismaClient();
const EMAIL_DOMAIN = 'bulk.togomobile.test';
const DAY = 24 * 3600_000;

function arg(name: string, fallback: number) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  const n = a ? Number(a.split('=')[1]) : fallback;
  if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} doit être un entier positif`);
  return n;
}

function createStorage(): StorageService {
  switch (env().storage.driver) {
    case 'cloudinary':
      return new CloudinaryStorageService();
    case 's3':
      return new S3StorageService();
    default:
      return new LocalStorageService();
  }
}

// Générateur pseudo-aléatoire déterministe (mêmes données à chaque exécution).
let seed = 20261105;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = <T>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
const roundPrice = (n: number) => Math.max(5000, Math.round(n / 500) * 500);

// ─── Référentiel de modèles ─────────────────────────────────────────────────

interface Model {
  brand: string;
  model: string;
  category: 'smartphones' | 'basic' | 'tablets';
  storages: number[];
  ram?: number;
  basePrice: number; // prix neuf, plus petite capacité
  specs: Record<string, string>;
  colors: string[]; // couleur(s) visible(s) sur les photos
  photos: [PhotoRef, PhotoRef, PhotoRef]; // face, dos, autre vue
}

const L: [number, number, number, number] = [0, 0.12, 0.5, 0.9]; // moitié gauche d'une photo « dos + face »
const R: [number, number, number, number] = [0.5, 0.12, 1, 0.9]; // moitié droite

const MODELS: Model[] = [
  { brand: 'Apple', model: 'iPhone 13 Pro', category: 'smartphones', storages: [128, 256, 512], ram: 6, basePrice: 450000, specs: { screen: '6,1 pouces OLED 120 Hz', processor: 'Apple A15 Bionic', os: 'iOS', connectivity: '5G' }, colors: ['Graphite'],
    photos: [{ t: 'Apple iPhone 13 Pro.jpg' }, { t: 'Apple iPhone 13 Pro on MacBook Pro 07.jpg' }, { t: 'Apple iPhone 13 Pro on MacBook Pro 04.jpg' }] },
  { brand: 'Apple', model: 'iPhone 14 Pro', category: 'smartphones', storages: [128, 256, 512], ram: 6, basePrice: 620000, specs: { screen: '6,1 pouces OLED 120 Hz', processor: 'Apple A16 Bionic', os: 'iOS', connectivity: '5G' }, colors: ['Argent'],
    photos: [{ t: 'IPhone 14 Pro - 2.jpg' }, { t: 'IPhone 14 Pro - 3.jpg' }, { t: 'IPhone 14 Pro.jpg' }] },
  { brand: 'Apple', model: 'iPhone 15', category: 'smartphones', storages: [128, 256], ram: 6, basePrice: 580000, specs: { screen: '6,1 pouces OLED', processor: 'Apple A16 Bionic', os: 'iOS', port: 'USB-C' }, colors: ['Rose'],
    photos: [{ t: 'IPhone 15.png', crop: R }, { t: 'IPhone 15.png', crop: L }, { t: 'Apple iPhone 15.jpg' }] },
  { brand: 'Apple', model: 'iPhone 15 Pro', category: 'smartphones', storages: [128, 256, 512], ram: 8, basePrice: 750000, specs: { screen: '6,1 pouces OLED 120 Hz', processor: 'Apple A17 Pro', os: 'iOS', port: 'USB-C' }, colors: ['Titane noir'],
    photos: [{ t: 'IPhone 15 pro.png', crop: R }, { t: 'IPhone 15 pro.png', crop: L }, { t: 'Apple iPhone 15 Pro.jpg' }] },
  { brand: 'Apple', model: 'iPhone 15 Pro Max', category: 'smartphones', storages: [256, 512], ram: 8, basePrice: 860000, specs: { screen: '6,7 pouces OLED 120 Hz', processor: 'Apple A17 Pro', os: 'iOS', port: 'USB-C' }, colors: ['Titane naturel'],
    photos: [{ t: 'IPhone 15 Pro Max 2024.jpg' }, { t: 'IPhone 15 pro max.png', crop: L }, { t: 'IPhone 15 Pro and Pro Max in Apple Store - 1.jpg' }] },
  { brand: 'Samsung', model: 'Galaxy A05s', category: 'smartphones', storages: [64, 128], ram: 4, basePrice: 72000, specs: { screen: '6,7 pouces', battery: '5 000 mAh', sim: 'Double SIM' }, colors: ['Argent'],
    photos: [{ t: 'Samsung Galaxy A05s 2024 (1) (cropped).jpg' }, { t: 'Samsung Galaxy A05s 2024 (1).jpg' }, { t: 'Samsung Galaxy A05s 2024.jpg' }] },
  { brand: 'Samsung', model: 'Galaxy A15', category: 'smartphones', storages: [128, 256], ram: 4, basePrice: 98000, specs: { screen: '6,5 pouces Super AMOLED', battery: '5 000 mAh', sim: 'Double SIM' }, colors: ['Bleu nuit'],
    photos: [{ t: 'Samsung Galaxy A15 5G 2024 (1) (cropped).jpg' }, { t: 'Samsung Galaxy A40 und Samsung Galaxy A15 20240529 HOF7494 RAW-Export cens (cropped).png' }, { t: 'Samsung Galaxy A15 20240529 HOF7502 RAW-Export cens.png' }] },
  { brand: 'Samsung', model: 'Galaxy A25', category: 'smartphones', storages: [128, 256], ram: 6, basePrice: 135000, specs: { screen: '6,5 pouces Super AMOLED 120 Hz', battery: '5 000 mAh', connectivity: '5G' }, colors: ['Bleu nuit'],
    photos: [{ t: 'Samsung Galaxy A25 5G 2024 (cropped).jpg' }, { t: 'Samsung Galaxy A25 5G 2024 (1) (cropped).jpg' }, { t: 'Galaxy A25 5G at Softbank Aeon Town Higashi-Osaka.jpg' }] },
  { brand: 'Samsung', model: 'Galaxy A35', category: 'smartphones', storages: [128, 256], ram: 8, basePrice: 185000, specs: { screen: '6,6 pouces Super AMOLED', battery: '5 000 mAh', connectivity: '5G' }, colors: ['Bleu nuit'],
    photos: [{ t: 'Samsung Galaxy A35 5G Phone (Front).jpg' }, { t: 'Samsung Galaxy A35 5G Phone (Back).jpg' }, { t: 'Samsung Galaxy A35 5G 2024 (1).jpg' }] },
  { brand: 'Samsung', model: 'Galaxy A55', category: 'smartphones', storages: [128, 256], ram: 8, basePrice: 245000, specs: { screen: '6,6 pouces Super AMOLED', processor: 'Exynos 1480', connectivity: '5G' }, colors: ['Bleu nuit'],
    photos: [{ t: 'Samsung Galaxy A55 5G 2024 (cropped).jpg' }, { t: 'Galaxy A55.jpg' }, { t: 'Samsung Galaxy A55 5G 2024 (1).jpg' }] },
  { brand: 'Samsung', model: 'Galaxy S23 Ultra', category: 'smartphones', storages: [256, 512], ram: 12, basePrice: 690000, specs: { screen: '6,8 pouces Dynamic AMOLED 2X', processor: 'Snapdragon 8 Gen 2', rearCamera: '200 Mpx', extras: 'Stylet S Pen intégré' }, colors: ['Lavande', 'Noir'],
    photos: [{ t: 'Samsung Galaxy S23 Ultra, 512 GB, Lavender 20230416 HOF00318 RAW-Export cens.png' }, { t: 'Galaxy s23 ultra.jpg' }, { t: 'Samsung Galaxy S23 Ultra, 512 GB, Lavender mit S-Pen 20230416 HOF00335 RAW-Export cens.png' }] },
  { brand: 'Samsung', model: 'Galaxy S24 Ultra', category: 'smartphones', storages: [256, 512], ram: 12, basePrice: 820000, specs: { screen: '6,8 pouces Dynamic AMOLED 2X 120 Hz', processor: 'Snapdragon 8 Gen 3', rearCamera: '200 Mpx', extras: 'Stylet S Pen intégré' }, colors: ['Titane gris'],
    photos: [{ t: 'Samsung Galaxy S24 Ultra.jpg' }, { t: 'SAMSUNG Galaxy S24 Ultra (2).jpg' }, { t: 'Samsung Galaxy S24 Ultra Backside.jpg' }] },
  { brand: 'Samsung', model: 'Galaxy Tab A9', category: 'tablets', storages: [64, 128], ram: 4, basePrice: 120000, specs: { screen: '8,7 pouces', battery: '5 100 mAh' }, colors: ['Graphite'],
    photos: [{ t: '20251110 181425 Samsung Galaxy Tab A9 Front.jpg' }, { t: '20251110 181454 - Samsung Galaxy Tab A9 Back.jpg' }, { t: '20251110 181521 Samsung Galaxy Tab A9 Upper side.jpg' }] },
  { brand: 'Tecno', model: 'Camon 40 Pro 5G', category: 'smartphones', storages: [256], ram: 8, basePrice: 210000, specs: { screen: '6,78 pouces AMOLED 144 Hz', battery: '5 200 mAh', connectivity: '5G' }, colors: ['Blanc'],
    photos: [{ t: 'Tecno Camon 40 Pro 5G.jpg', crop: [0.22, 0.12, 0.78, 0.66] }, { t: 'Tecno Camon 40 Pro 5G.jpg' }, { t: 'Tecno Camon 40 Pro 5G.jpg', crop: [0.3, 0.16, 0.7, 0.5] }] },
  { brand: 'Tecno', model: 'Pova 7 Ultra 5G', category: 'smartphones', storages: [256], ram: 12, basePrice: 230000, specs: { screen: '6,67 pouces AMOLED 144 Hz', battery: '6 000 mAh', charging: '70 W', connectivity: '5G' }, colors: ['Gris'],
    photos: [{ t: 'Tecno Pova 7 Ultra 5G.jpg', crop: [0.22, 0.12, 0.78, 0.66] }, { t: 'Tecno Pova 7 Ultra 5G.jpg' }, { t: 'Tecno Pova 7 Ultra 5G.jpg', crop: [0.3, 0.16, 0.7, 0.5] }] },
  { brand: 'Infinix', model: 'Smart 8', category: 'smartphones', storages: [64, 128], ram: 4, basePrice: 52000, specs: { screen: '6,6 pouces 90 Hz', battery: '5 000 mAh' }, colors: ['Or brillant'],
    photos: [{ t: 'Infinix Smart 8 in Shiny Gold.jpg' }, { t: 'Reverse of Infinix Smart 8 in Shiny Gold colour.webp' }, { t: 'Reverse of Infinix Smart 8 in Shiny Gold colour.webp', crop: [0.2, 0, 0.8, 0.5] }] },
  { brand: 'Infinix', model: 'Hot 60 Pro', category: 'smartphones', storages: [256], ram: 8, basePrice: 140000, specs: { screen: '6,78 pouces AMOLED 144 Hz', battery: '5 160 mAh' }, colors: ['Blanc'],
    photos: [{ t: 'Bagian depan Infinix Hot 60 pro normal nyala.jpg' }, { t: 'Infinix Hot 60 pro Dengan casing garis-garis Normal.jpg' }, { t: 'Infinix Hot 60 Pro.jpg' }] },
  { brand: 'Infinix', model: 'Hot 60 Pro+', category: 'smartphones', storages: [256], ram: 8, basePrice: 165000, specs: { screen: '6,78 pouces AMOLED 144 Hz', extras: 'Épaisseur 5,95 mm' }, colors: ['Gris titane'],
    photos: [{ t: 'Infinix Hot 60 Pro Plus.jpg' }, { t: 'The Slim Design of Infinix Hot 60 Pro Plus.jpg' }, { t: 'Infinix Hot 60 Pro Plus.jpg', crop: [0.15, 0.05, 0.85, 0.62] }] },
  { brand: 'Xiaomi', model: 'Redmi 12C', category: 'smartphones', storages: [64, 128], ram: 4, basePrice: 62000, specs: { battery: '5 000 mAh', sim: 'Double SIM' }, colors: ['Gris graphite'],
    photos: [{ t: 'Redmi 12C front.jpg' }, { t: 'Redmi 12C back.jpg' }, { t: 'Xiaomi Redmi 12C 3gb 32gb in Zabrze, Silesian Voivodeship, Poland, March 2024.jpg' }] },
  { brand: 'Xiaomi', model: 'Redmi Note 12', category: 'smartphones', storages: [128, 256], ram: 6, basePrice: 115000, specs: { screen: '6,67 pouces AMOLED 120 Hz', processor: 'Snapdragon 685' }, colors: ['Vert menthe'],
    photos: [{ t: 'Redmi Note 12 front.jpg' }, { t: 'Redmi Note 12 back.jpg' }, { t: 'Redmi Note 12 back.jpg', crop: [0.15, 0, 0.85, 0.45] }] },
  { brand: 'itel', model: 'A50', category: 'smartphones', storages: [64], ram: 3, basePrice: 45000, specs: { screen: '6,6 pouces', battery: '5 000 mAh', sim: 'Double SIM' }, colors: ['Bleu'],
    photos: [{ t: 'Itel A50 front.jpg' }, { t: 'Itel A50 rear.jpg' }, { t: 'Itel A50 rear.jpg', crop: [0.1, 0.05, 0.9, 0.45] }] },
  { brand: 'Google', model: 'Pixel 7', category: 'smartphones', storages: [128], ram: 8, basePrice: 260000, specs: { processor: 'Google Tensor G2', os: 'Android 14' }, colors: ['Citronnelle'],
    photos: [{ t: 'Google Pixel 7 20230416 HOF00377 RAW-Export.png' }, { t: 'Google Pixel 7 20230416 HOF00361 RAW-Export.png' }, { t: 'Google Pixel 7 20230416 HOF00377 RAW-Export.png', crop: [0.5, 0.1, 1, 0.9] }] },
  { brand: 'Google', model: 'Pixel 8 Pro', category: 'smartphones', storages: [128, 256], ram: 12, basePrice: 520000, specs: { processor: 'Google Tensor G3', screen: '6,7 pouces LTPO OLED' }, colors: ['Bleu azur'],
    photos: [{ t: 'Google Pixel 8 Pro, shown in Shibuya Stream 2.jpg' }, { t: 'Google Pixel 8 Pro.jpg' }, { t: 'Google Pixel 8 Pro and Samsung Galaxy S24 Ultra.jpg' }] },
  { brand: 'Huawei', model: 'P30 Lite', category: 'smartphones', storages: [128], ram: 4, basePrice: 110000, specs: { os: 'Android 10 (sans services Google récents)' }, colors: ['Bleu paon'],
    photos: [{ t: 'Huawei P30 lite.jpg' }, { t: 'Huawei P30 lite atrás.jpg' }, { t: 'Huawei P30 lite girado.jpg' }] },
  { brand: 'Huawei', model: 'Nova 11 SE', category: 'smartphones', storages: [256], ram: 8, basePrice: 160000, specs: { screen: '6,67 pouces OLED', charging: '66 W', os: 'HarmonyOS' }, colors: ['Vert'],
    photos: [{ t: 'Nova 11 SE.jpg' }, { t: 'HUAWEI nova 11 SE Green Back.jpg' }, { t: 'HUAWEI nova 11 SE Green Back.jpg', crop: [0.1, 0, 0.9, 0.5] }] },
  { brand: 'Oppo', model: 'A18', category: 'smartphones', storages: [64, 128], ram: 4, basePrice: 70000, specs: { screen: '6,56 pouces 90 Hz', battery: '5 000 mAh' }, colors: ['Bleu glacier'],
    photos: [{ t: 'Oppo A18 bagian depan.jpg' }, { t: 'Oppo A18 bagian Belakang.jpg' }, { t: 'Oppo A18 bagian Belakang.jpg', crop: [0.1, 0, 0.9, 0.5] }] },
  { brand: 'Oppo', model: 'A78', category: 'smartphones', storages: [128], ram: 8, basePrice: 132000, specs: { screen: '6,43 pouces AMOLED', charging: '67 W' }, colors: ['Bleu'],
    photos: [{ t: 'Oppo A78 4G Bagian depan Nyala normal dengan Always on display.jpg' }, { t: 'Oppo A78 4G Bagian belakang dengan bekas sidik ragam.jpg' }, { t: 'Oppo A78.jpg' }] },
  { brand: 'Nokia', model: '105', category: 'basic', storages: [1], basePrice: 12000, specs: { battery: '800 mAh', sim: 'Simple SIM', extras: 'Radio FM, lampe torche' }, colors: ['Noir'],
    photos: [{ t: '2013 Nokia 105 - 04.jpg' }, { t: '2013 Nokia 105 - 03.jpg' }, { t: '2013 Nokia 105 - 02.jpg' }] },
];

const CONDITIONS: Array<{ c: ProductCondition; factor: number; weight: number }> = [
  { c: 'NEW', factor: 1, weight: 45 },
  { c: 'LIKE_NEW', factor: 0.85, weight: 20 },
  { c: 'REFURBISHED', factor: 0.78, weight: 12 },
  { c: 'USED_GOOD', factor: 0.68, weight: 15 },
  { c: 'USED_FAIR', factor: 0.55, weight: 8 },
];
function pickCondition() {
  let r = rnd() * 100;
  for (const c of CONDITIONS) if ((r -= c.weight) < 0) return c;
  return CONDITIONS[0];
}

const DEFECTS = ['Légères rayures sur le contour', 'Petite rayure au dos', 'Micro-rayures sur l’écran, invisibles écran allumé', 'Écran remplacé (pièce compatible)', 'Batterie remplacée', 'Coque arrière légèrement marquée'];
const WARRANTY: Record<ProductCondition, string[]> = {
  NEW: ['12 mois', '12 mois constructeur', '6 mois boutique'],
  LIKE_NEW: ['3 mois boutique', '6 mois boutique'],
  REFURBISHED: ['6 mois', '3 mois boutique'],
  USED_GOOD: ['1 mois boutique', '2 semaines'],
  USED_FAIR: ['1 semaine', ''],
};
const ACCESSORIES = ['Chargeur et câble', 'Câble USB-C', 'Boîte d’origine, chargeur, écouteurs', 'Coque et verre trempé offerts', 'Câble uniquement'];

// ─── Boutiques ──────────────────────────────────────────────────────────────

const PLACES: Array<[string, string]> = [
  ['Lomé', 'Déckon'], ['Lomé', 'Grand Marché'], ['Lomé', 'Bè'], ['Lomé', 'Tokoin'], ['Lomé', 'Adidogomé'],
  ['Lomé', 'Agoè'], ['Lomé', 'Nyékonakpoè'], ['Lomé', 'Hédzranawoé'], ['Lomé', 'Kodjoviakopé'], ['Lomé', 'Avédji'],
  ['Lomé', 'Baguida'], ['Lomé', 'Assivito'], ['Kara', 'Centre-ville'], ['Kara', 'Kpéwa'], ['Sokodé', 'Komah'],
  ['Sokodé', 'Centre-ville'], ['Atakpamé', 'Agbonou'], ['Atakpamé', 'Djama'], ['Kpalimé', 'Centre-ville'], ['Kpalimé', 'Zomayi'],
  ['Tsévié', 'Centre-ville'], ['Aného', 'Centre-ville'], ['Dapaong', 'Centre-ville'], ['Bassar', 'Centre-ville'], ['Mango', 'Centre-ville'],
  ['Notsé', 'Centre-ville'], ['Tabligbo', 'Centre-ville'], ['Vogan', 'Centre-ville'], ['Badou', 'Centre-ville'], ['Kandé', 'Centre-ville'],
];
const PREFIXES = ['Phone', 'Mobile', 'Tech', 'Smart', 'Digital', 'Télécom', 'Cell', 'Gadget', 'Connect', 'Store'];
const SUFFIXES = ['Center', 'Shop', 'Plus', 'Express', 'Pro', 'House', 'Point', 'Market', 'Zone', 'City'];

function shopName(i: number, city: string, district: string) {
  const base = i % 3 === 0 ? `${district === 'Centre-ville' ? city : district} ${PREFIXES[i % PREFIXES.length]}` : `${PREFIXES[(i * 3) % PREFIXES.length]} ${SUFFIXES[i % SUFFIXES.length]} ${city}`;
  return `${base} (démo)`;
}

// ─── Visuels ────────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}

async function pool<T>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
}

// ─── Création ───────────────────────────────────────────────────────────────

async function seedBulk() {
  if (env().isProd && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Données de démonstration refusées en production (définissez ALLOW_DEMO_SEED=true pour forcer).');
  }
  const shopCount = arg('shops', 30);
  const perShop = arg('products', 100);
  const withImages = !process.argv.includes('--no-images');
  const concurrency = arg('concurrency', 16);
  if (shopCount > PLACES.length) throw new Error(`--shops : ${PLACES.length} maximum`);

  const existing = await prisma.user.count({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  if (existing) {
    console.log(`Le jeu de données existe déjà (${existing} vendeurs). Lancez « seed:bulk -- --clear » avant de recommencer.`);
    return;
  }

  const brands = new Map((await prisma.brand.findMany()).map((b) => [b.name, b]));
  const missing = [...new Set(MODELS.map((m) => m.brand))].filter((b) => !brands.has(b));
  if (missing.length) throw new Error(`Marques absentes (lancez d'abord « pnpm --filter backend seed ») : ${missing.join(', ')}`);
  const cats = new Map((await prisma.category.findMany()).map((c) => [c.slug, c.id]));
  const categoryId = { smartphones: cats.get('smartphones'), basic: cats.get(slugify('Téléphones à touches')), tablets: cats.get('tablettes') };

  const usedRefs = new Set((await prisma.product.findMany({ select: { reference: true } })).map((p) => p.reference));
  const newRef = () => {
    let r: string;
    do r = publicReference();
    while (usedRefs.has(r));
    usedRefs.add(r);
    return r;
  };

  const storage = withImages ? createStorage() : null;

  // Photos préparées une seule fois par modèle (téléchargement depuis Commons, recadrage, trois tailles).
  const infos = await photoInfos(MODELS.flatMap((m) => m.photos.map((p) => p.t)));
  const prepared = new Map<Model, PhotoVariants[]>();
  const credits = new Map<Model, string>();
  for (const m of MODELS) {
    if (withImages) {
      const v: PhotoVariants[] = [];
      for (const p of m.photos) v.push(await photoVariants(p, infos.get(p.t)!));
      prepared.set(m, v);
    }
    const authors = [...new Map(m.photos.map((p) => infos.get(p.t)!).map((i) => [i.title, i])).values()].map((i) => `${i.artist} (${i.license})`);
    credits.set(m, `Photos : ${[...new Set(authors)].join(', ')}, via Wikimedia Commons.`);
  }
  if (withImages) console.log(`Photos prêtes : ${MODELS.length} modèles × 3 vues.`);
  console.log(`Création de ${shopCount} boutiques × ${perShop} produits (stockage : ${withImages ? env().storage.driver : 'sans photos'})…`);

  const password = process.env.SEED_DEMO_PASSWORD || `Demo-${randomBytes(6).toString('base64url')}1`;
  const passwordHash = await hashPassword(password);
  const now = Date.now();
  const started = Date.now();

  for (let si = 0; si < shopCount; si++) {
    const [city, district] = PLACES[si];
    const name = shopName(si, city, district);
    const owner = await prisma.user.create({
      data: { name: `Vendeur ${si + 1} ${city} (démo)`, email: `vendeur${si + 1}@${EMAIL_DOMAIN}`, passwordHash, role: 'SELLER', isDemo: true },
    });
    let slug = slugify(name);
    if (await prisma.shop.findUnique({ where: { slug } })) slug = `${slug}-${si + 1}`;
    const shop = await prisma.shop.create({
      data: {
        ownerId: owner.id,
        name,
        slug,
        description: 'Boutique fictive créée pour la démonstration de la plateforme. Aucun produit n’est réellement en vente.',
        city,
        district,
        address: `Rue ${100 + si * 7}, ${district}`,
        phone: `+2289${String(1000000 + si * 3517).padStart(7, '0')}`,
        whatsapp: `+2289${String(1000000 + si * 3517).padStart(7, '0')}`,
        socialLinks: { facebook: 'https://www.facebook.com/', instagram: 'https://www.instagram.com/' },
        openingHours: pick(['Lun–Sam 8 h–19 h', 'Lun–Sam 9 h–20 h', 'Tous les jours 8 h–21 h', 'Lun–Ven 8 h–18 h, Sam 9 h–14 h']),
        status: 'ACTIVE',
        validatedAt: new Date(now - (90 - si) * DAY),
        trustedSeller: si % 4 === 0,
        isDemo: true,
      },
    });

    const products: Prisma.ProductCreateManyInput[] = [];
    const prices: Prisma.PriceHistoryCreateManyInput[] = [];
    const promos: Prisma.PromotionCreateManyInput[] = [];
    const images: Array<{ productId: string; model: Model }> = [];

    for (let pi = 0; pi < perShop; pi++) {
      const m = pick(MODELS);
      const st = pick(m.storages);
      const cond = pickCondition();
      const storageFactor = 1 + m.storages.indexOf(st) * 0.15;
      const price = roundPrice(m.basePrice * storageFactor * cond.factor * (0.92 + rnd() * 0.16));
      const storageText = st >= 1024 ? `${st / 1024} To` : st > 1 ? `${st} Go` : '';
      const title = [m.brand, m.model, storageText].filter(Boolean).join(' ');
      const color = pick(m.colors);
      const reference = newRef();
      const id = randomUUID();
      const publishedAt = new Date(now - Math.floor(rnd() * 80) * DAY - Math.floor(rnd() * 86400_000));
      const a = rnd();
      const availability: Availability = a < 0.85 ? 'AVAILABLE' : a < 0.95 ? 'OUT_OF_STOCK' : 'TEMPORARILY_UNAVAILABLE';
      const used = cond.c === 'USED_GOOD' || cond.c === 'USED_FAIR';
      const specs = { ...m.specs, ...(m.brand === 'Apple' && cond.c !== 'NEW' && m.category === 'smartphones' ? { batteryHealth: `${78 + Math.floor(rnd() * 20)} %` } : {}) };

      products.push({
        id,
        shopId: shop.id,
        brandId: brands.get(m.brand)!.id,
        categoryId: categoryId[m.category] ?? null,
        model: m.model,
        title,
        reference,
        slug: `${slugify(title, 70)}-${reference.slice(3).toLowerCase()}`,
        description: `${title} ${color.toLowerCase()} proposé par ${name.replace(' (démo)', '')}. Annonce fictive de démonstration.\n\n${credits.get(m)}`,
        price,
        condition: cond.c,
        availability,
        stock: availability === 'AVAILABLE' ? 1 + Math.floor(rnd() * 8) : 0,
        storageGb: st > 1 ? st : null,
        ramGb: m.ram ?? null,
        color,
        warranty: pick(WARRANTY[cond.c]) || null,
        accessories: pick(ACCESSORIES),
        defects: used ? pick(DEFECTS) : cond.c === 'NEW' ? null : 'Aucun défaut visible',
        specs: specs as Prisma.InputJsonValue,
        searchText: buildSearchText([m.brand, m.model, title, reference, st > 1 ? `${st}go` : null, color]),
        status: 'PUBLISHED',
        moderation: 'APPROVED',
        moderatedAt: publishedAt,
        publishedAt,
        viewCount: Math.floor(rnd() * 400),
        whatsappClicks: Math.floor(rnd() * 40),
        isDemo: true,
        createdAt: publishedAt,
      });
      // Prix habituel en place depuis plus de 30 jours : le prix de référence des promotions est réel.
      prices.push({ productId: id, price, createdAt: new Date(now - 45 * DAY) });

      if (availability === 'AVAILABLE' && rnd() < 0.12) {
        // Promo du jour : 24 h, commencée il y a 1 à 12 h.
        const startsAt = new Date(now - Math.floor(1 + rnd() * 12) * 3600_000);
        promos.push({
          productId: id,
          shopId: shop.id,
          promoPrice: roundPrice(price * (0.82 + rnd() * 0.1)),
          referencePrice: price,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 24 * 3600_000),
          conditions: 'Offre de démonstration',
          isDemo: true,
        });
      }
      images.push({ productId: id, model: m });
    }

    await prisma.product.createMany({ data: products });
    await prisma.priceHistory.createMany({ data: prices });
    if (promos.length) await prisma.promotion.createMany({ data: promos });

    if (storage) {
      const media: Prisma.ProductMediaCreateManyInput[] = [];
      const jobs = images.flatMap((img) => prepared.get(img.model)!.map((pic, position) => ({ ...img, pic, position })));
      await pool(jobs, concurrency, async ({ productId, pic, position }) => {
        const base = `products/${productId}/${randomBytes(6).toString('hex')}`;
        await withRetry(() => storage.put(`${base}.webp`, pic.main, 'image/webp'));
        await withRetry(() => storage.put(`${base}-m.webp`, pic.medium, 'image/webp'));
        await withRetry(() => storage.put(`${base}-thumb.webp`, pic.thumb, 'image/webp'));
        media.push({
          productId,
          shopId: shop.id,
          type: 'IMAGE',
          status: 'READY',
          key: `${base}.webp`,
          mediumKey: `${base}-m.webp`,
          thumbKey: `${base}-thumb.webp`,
          mime: 'image/webp',
          size: pic.main.length,
          width: pic.width,
          height: pic.height,
          position,
          isPrimary: position === 0,
        });
      });
      await prisma.productMedia.createMany({ data: media });
    }
    const elapsed = Math.round((Date.now() - started) / 1000);
    console.log(`  [${si + 1}/${shopCount}] ${name} — ${products.length} produits, ${promos.length} promotions (${elapsed} s)`);
  }

  console.log(`\nTerminé : ${shopCount} boutiques, ${shopCount * perShop} produits (tous marqués isDemo).`);
  console.log(`Comptes vendeurs : vendeur1@${EMAIL_DOMAIN} … vendeur${shopCount}@${EMAIL_DOMAIN}`);
  console.log(`Mot de passe commun (affiché une seule fois) : ${password}\n`);
}

async function clearBulk() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const shopIds = (await prisma.shop.findMany({ where: { ownerId: { in: userIds } }, select: { id: true } })).map((s) => s.id);
  const media = await prisma.productMedia.findMany({ where: { shopId: { in: shopIds } } });
  await prisma.$transaction([
    prisma.review.deleteMany({ where: { shopId: { in: shopIds } } }),
    prisma.sale.deleteMany({ where: { shopId: { in: shopIds } } }),
    prisma.product.deleteMany({ where: { shopId: { in: shopIds } } }),
    prisma.shop.deleteMany({ where: { id: { in: shopIds } } }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ]);
  // Les fichiers sont aussi mis en file de suppression par le déclencheur SQL (StorageGarbage) ; on les supprime
  // directement ici pour ne pas dépendre du worker. « not found » est toléré.
  if (media.length && !process.argv.includes('--keep-files')) {
    const storage = createStorage();
    const keys = media.flatMap((m) => [m.key, m.mediumKey, m.thumbKey].filter((k): k is string => !!k));
    await pool(keys, 16, async (k) => {
      await storage.delete(k).catch((e) => console.warn(`  ${k} : ${(e as Error).message}`));
    });
  }
  console.log(`Supprimé : ${shopIds.length} boutiques, ${userIds.length} comptes, ${media.length} médias.`);
}

const preview = process.argv.find((a) => a.startsWith('--preview='))?.split('=')[1];
(preview ? previewSheet(MODELS, preview).then(() => console.log(`Planche écrite : ${preview}`)) : process.argv.includes('--clear') ? clearBulk() : seedBulk())
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
