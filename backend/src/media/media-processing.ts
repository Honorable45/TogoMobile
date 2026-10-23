import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import sharp from 'sharp';
import { env } from '../config/env';

export type SniffedType =
  | { kind: 'image'; mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif' }
  | { kind: 'video'; mime: 'video/mp4' | 'video/quicktime' | 'video/webm'; ext: 'mp4' | 'mov' | 'webm' };

/**
 * Détermine le type réel d'un fichier à partir de ses premiers octets.
 * L'extension et le type MIME déclarés par le navigateur ne sont jamais pris en compte.
 */
export function sniff(buf: Buffer): SniffedType | null {
  if (buf.length < 16) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: 'image', mime: 'image/jpeg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { kind: 'image', mime: 'image/png' };
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { kind: 'image', mime: 'image/webp' };
  }
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (brand === 'avif' || brand === 'avis') return { kind: 'image', mime: 'image/avif' };
    if (brand === 'qt  ') return { kind: 'video', mime: 'video/quicktime', ext: 'mov' };
    if (/^(isom|iso2|iso4|iso5|iso6|mp41|mp42|avc1|M4V |dash|3gp4|3gp5|3gp6)$/.test(brand)) {
      return { kind: 'video', mime: 'video/mp4', ext: 'mp4' };
    }
    return null; // HEIC et autres conteneurs non pris en charge
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { kind: 'video', mime: 'video/webm', ext: 'webm' };
  }
  return null;
}

export interface ProcessedImage {
  main: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

/**
 * Décode l'image (ce qui garantit qu'il s'agit bien d'une image), corrige l'orientation,
 * supprime les métadonnées (EXIF, GPS) et produit des versions WebP optimisées pour mobile.
 */
export async function processImage(buf: Buffer, maxSide = 1600, thumbSide = 480): Promise<ProcessedImage> {
  if (buf.length > env().media.maxImageBytes) {
    throw new PayloadTooLargeException(`Image trop volumineuse (maximum ${env().media.maxImageBytes / 1024 / 1024} Mo).`);
  }
  const type = sniff(buf);
  if (!type || type.kind !== 'image') {
    throw new BadRequestException('Format d’image non pris en charge. Formats acceptés : JPEG, PNG, WebP, AVIF.');
  }
  try {
    const base = sharp(buf, { limitInputPixels: 50_000_000, failOn: 'error' }).rotate();
    const mainOut = await base
      .clone()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await base
      .clone()
      .resize({ width: thumbSide, height: thumbSide, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    return { main: mainOut.data, thumb, width: mainOut.info.width, height: mainOut.info.height };
  } catch {
    throw new BadRequestException('Image illisible ou corrompue.');
  }
}

export function checkVideo(buf: Buffer) {
  if (buf.length > env().media.maxVideoBytes) {
    throw new PayloadTooLargeException(`Vidéo trop volumineuse (maximum ${env().media.maxVideoBytes / 1024 / 1024} Mo).`);
  }
  const type = sniff(buf);
  if (!type || type.kind !== 'video') {
    throw new BadRequestException('Format vidéo non pris en charge. Formats acceptés : MP4, MOV, WebM.');
  }
  return type;
}

// ─── Variantes d'images ─────────────────────────────────────────────────────

export interface ImageVariants {
  large: Buffer; // galerie produit (1600 px)
  medium: Buffer; // pages boutique, mobile (960 px)
  thumb: Buffer; // cartes du catalogue (480 px)
  width: number;
  height: number;
}

/**
 * Trois tailles WebP adaptées aux usages : les cartes du catalogue ne téléchargent jamais l'original.
 * Le décodage complet garantit qu'il s'agit d'une image ; EXIF et coordonnées GPS sont supprimés.
 */
export async function processImageVariants(buf: Buffer): Promise<ImageVariants> {
  const type = sniff(buf);
  if (!type || type.kind !== 'image') throw new BadRequestException('Format d’image non pris en charge.');
  try {
    const base = sharp(buf, { limitInputPixels: 50_000_000, failOn: 'error' }).rotate();
    const variant = (side: number, quality: number) =>
      base.clone().resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer({ resolveWithObject: true });
    const [large, medium, thumb] = await Promise.all([variant(1600, 80), variant(960, 78), variant(480, 72)]);
    return { large: large.data, medium: medium.data, thumb: thumb.data, width: large.info.width, height: large.info.height };
  } catch {
    throw new BadRequestException('Image illisible ou corrompue.');
  }
}

// ─── Vidéo (ffmpeg facultatif) ───────────────────────────────────────────────

/** Chemin de ffmpeg : FFMPEG_PATH, sinon le binaire du paquet facultatif ffmpeg-static s'il est installé. */
export function resolveFfmpeg(): string | null {
  const configured = env().media.ffmpegPath;
  if (configured) return existsSync(configured) ? configured : null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require('ffmpeg-static') as string | null;
    return p && existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

function run(bin: string, args: string[], timeoutMs: number): Promise<{ code: number; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      if (stderr.length < 64_000) stderr += d.toString();
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? 1, stderr });
    });
  });
}

/** Durée en secondes lue dans la sortie de ffmpeg (« Duration: 00:01:02.50 »). */
export async function probeDuration(ffmpeg: string, file: string): Promise<number | null> {
  const { stderr } = await run(ffmpeg, ['-hide_banner', '-i', file], 30_000);
  const m = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

/**
 * Image d'aperçu, prise à 1 s (ou au milieu d'une vidéo plus courte).
 * ffmpeg peut réussir sans produire d'image : on vérifie donc la présence du fichier.
 */
export async function extractPoster(ffmpeg: string, file: string, out: string, duration: number) {
  const at = Math.min(1, Math.max(0, duration / 2));
  for (const seek of [at, 0]) {
    await run(ffmpeg, ['-hide_banner', '-y', '-ss', seek.toFixed(2), '-i', file, '-frames:v', '1', '-vf', 'scale=960:-2', out], 60_000);
    if (existsSync(out) && statSync(out).size > 0) return;
  }
  throw new Error('Impossible d’extraire une image de la vidéo.');
}

/** Transcodage H.264/AAC, 1280 px de large au plus, démarrage rapide (lecture progressive sur mobile). */
export async function transcodeVideo(ffmpeg: string, file: string, out: string) {
  const { code, stderr } = await run(
    ffmpeg,
    [
      '-hide_banner', '-y', '-i', file,
      '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out,
    ],
    10 * 60_000,
  );
  if (code !== 0) throw new Error(`Transcodage impossible : ${stderr.split('\n').filter(Boolean).slice(-1)[0] ?? 'erreur ffmpeg'}`);
}
