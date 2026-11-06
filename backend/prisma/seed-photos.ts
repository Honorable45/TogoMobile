/**
 * Photos réelles des téléphones de démonstration, sous licence libre (Wikimedia Commons).
 * Chaque modèle a trois vues (face, dos, autre). Quand Commons n'a pas de vue dédiée, une vue est obtenue
 * par recadrage d'une photo du même modèle (`crop` : fractions [x0, y0, x1, y1] de l'image).
 * Les auteurs et licences sont récupérés depuis Commons et cités dans la description de chaque annonce.
 */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface PhotoRef {
  t: string; // titre du fichier sur Commons, sans le préfixe « File: »
  crop?: [number, number, number, number];
}

const UA = 'TogoMobileSeed/1.0 (demo data script)';
const CACHE = process.env.SEED_PHOTO_CACHE || join(tmpdir(), 'togomobile-seed-photos');

export interface PhotoInfo {
  title: string;
  url: string; // version 1600 px servie par Commons
  page: string;
  license: string;
  artist: string;
}

async function fetchRetry(url: string, tries = 10): Promise<Response> {
  for (let i = 1; ; i++) {
    let wait = 5000 * i;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90_000) });
      if (r.ok) return r;
      if (i >= tries) throw new Error(`${r.status} ${url}`);
      // Limitation de débit de Wikimedia : on attend le délai demandé (au moins 20 s).
      if (r.status === 429) wait = Math.max(20_000, Number(r.headers.get('retry-after') ?? 0) * 1000) * Math.min(i, 3);
    } catch (e) {
      if (i >= tries) throw e;
    }
    await new Promise((r) => setTimeout(r, wait));
  }
}

/** Métadonnées (URL, auteur, licence) de tous les fichiers, par lots de 40. */
export async function photoInfos(titles: string[]): Promise<Map<string, PhotoInfo>> {
  mkdirSync(CACHE, { recursive: true });
  const cacheFile = join(CACHE, 'infos.json');
  const cached: Record<string, PhotoInfo> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const missing = [...new Set(titles)].filter((t) => !cached[t]);
  for (let i = 0; i < missing.length; i += 40) {
    const batch = missing.slice(i, i + 40).map((t) => `File:${t}`);
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1600&titles=${encodeURIComponent(batch.join('|'))}`;
    const j = (await (await fetchRetry(url)).json()) as {
      query: { normalized?: Array<{ from: string; to: string }>; pages: Record<string, { title: string; missing?: string; imageinfo?: Array<{ thumburl: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }> }> };
    };
    const norm = new Map((j.query.normalized ?? []).map((n) => [n.to, n.from]));
    for (const p of Object.values(j.query.pages)) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const title = (norm.get(p.title) ?? p.title).replace(/^File:/, '');
      const md = ii.extmetadata ?? {};
      const artist = (md.Artist?.value ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || 'Auteur inconnu';
      cached[title] = { title, url: ii.thumburl, page: ii.descriptionurl, license: md.LicenseShortName?.value ?? 'Licence libre', artist: artist.slice(0, 80) };
    }
  }
  writeFileSync(cacheFile, JSON.stringify(cached, null, 1));
  const out = new Map<string, PhotoInfo>();
  for (const t of titles) {
    if (!cached[t]) throw new Error(`Photo introuvable sur Wikimedia Commons : ${t}`);
    out.set(t, cached[t]);
  }
  return out;
}

async function original(info: PhotoInfo): Promise<Buffer> {
  const file = join(CACHE, createHash('sha1').update(info.title).digest('hex') + '.img');
  if (existsSync(file)) return readFileSync(file);
  const buf = Buffer.from(await (await fetchRetry(info.url)).arrayBuffer());
  writeFileSync(file, buf);
  await new Promise((r) => setTimeout(r, 1500)); // politesse envers Commons
  return buf;
}

export interface PhotoVariants {
  main: Buffer;
  medium: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

/** Photo recadrée si besoin, puis mise au format carré (fond blanc) en trois tailles. */
export async function photoVariants(ref: PhotoRef, info: PhotoInfo): Promise<PhotoVariants> {
  let img = sharp(await original(info)).rotate();
  if (ref.crop) {
    const meta = await sharp(await img.toBuffer()).metadata();
    const [x0, y0, x1, y1] = ref.crop;
    const W = meta.width!, H = meta.height!;
    img = sharp(await img.toBuffer()).extract({ left: Math.round(x0 * W), top: Math.round(y0 * H), width: Math.round((x1 - x0) * W), height: Math.round((y1 - y0) * H) });
  }
  const square = await img
    .resize(1200, 1200, { fit: 'contain', background: '#ffffff' })
    .flatten({ background: '#ffffff' })
    .toBuffer();
  const base = sharp(square);
  return {
    main: await base.clone().webp({ quality: 80 }).toBuffer(),
    medium: await base.clone().resize(960).webp({ quality: 78 }).toBuffer(),
    thumb: await base.clone().resize(480).webp({ quality: 74 }).toBuffer(),
    width: 1200,
    height: 1200,
  };
}

/** Planche contact des photos retenues (contrôle visuel avant envoi). */
export async function previewSheet(models: Array<{ brand: string; model: string; photos: PhotoRef[] }>, out: string) {
  const infos = await photoInfos(models.flatMap((m) => m.photos.map((p) => p.t)));
  const tile = 220, labelH = 30;
  const rows: Buffer[] = [];
  for (const m of models) {
    const tiles: Buffer[] = [];
    for (const p of m.photos) tiles.push(await sharp((await photoVariants(p, infos.get(p.t)!)).thumb).resize(tile).toBuffer());
    const label = Buffer.from(`<svg width="${tile * 3 + 20}" height="${labelH}"><text x="4" y="22" font-size="20" font-family="Arial" font-weight="700">${m.brand} ${m.model}</text></svg>`);
    rows.push(
      await sharp({ create: { width: tile * 3 + 20, height: tile + labelH + 6, channels: 3, background: '#e5e5e5' } })
        .composite([{ input: label, left: 0, top: 0 }, ...tiles.map((t, k) => ({ input: t, left: k * (tile + 10), top: labelH }))])
        .png()
        .toBuffer(),
    );
  }
  const perCol = Math.ceil(rows.length / 3), rowH = tile + labelH + 6, colW = tile * 3 + 40;
  await sharp({ create: { width: colW * 3, height: perCol * rowH, channels: 3, background: '#ffffff' } })
    .composite(rows.map((r, i) => ({ input: r, left: Math.floor(i / perCol) * colW, top: (i % perCol) * rowH })))
    .jpeg({ quality: 75 })
    .toFile(out);
}
