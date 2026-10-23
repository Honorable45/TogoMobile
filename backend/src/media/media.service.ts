import { BadRequestException, GoneException, Injectable, Logger, NotFoundException, OnModuleInit, PayloadTooLargeException } from '@nestjs/common';
import { MediaType, Prisma, ProductMedia } from '@prisma/client';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { RevalidationService } from '../cache/revalidation.service';
import { AuditService } from '../common/audit.service';
import { randomToken, sha256 } from '../common/crypto';
import { env } from '../config/env';
import { JobsService, PermanentJobError } from '../jobs/jobs.service';
import { storageBytesUploaded, uploadFailures } from '../observability/metrics';
import { PrismaService } from '../prisma/prisma.service';
import { SellerProductsService } from '../products/seller-products.service';
import { ShopsService } from '../shops/shops.service';
import { LocalStorageService, StorageService } from '../storage/storage.service';
import type { Readable } from 'node:stream';
import { extractPoster, probeDuration, processImageVariants, resolveFfmpeg, sniff, transcodeVideo } from './media-processing';

/** Limites par produit : trois photos au total et une vidéo. */
export const MAX_IMAGES = 3;
export const MAX_VIDEOS = 1;

/** Types déclarables par le navigateur ; le type réel est revérifié à la finalisation. */
const ALLOWED: Record<MediaType, Record<string, string>> = {
  IMAGE: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' },
  VIDEO: { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' },
};

const fileId = () => randomToken(12).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);

export interface UploadRequest {
  type: MediaType;
  contentType: string;
  size: number;
}

/**
 * Parcours d'un média :
 *  1. autorisation (createUpload) : place réservée dans la limite, URL présignée ;
 *  2. envoi direct navigateur → stockage objet (l'API ne transporte pas le fichier) ;
 *  3. finalisation (completeUpload) : taille et type réel vérifiés, média créé en PROCESSING ;
 *  4. traitement asynchrone (worker) : variantes d'images, durée/miniature/transcodage vidéo → READY.
 * Seuls les médias READY sont affichés publiquement.
 */
@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger('Media');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly products: SellerProductsService,
    private readonly shops: ShopsService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
    private readonly revalidation: RevalidationService,
  ) {}

  onModuleInit() {
    this.jobs.register('media.process', (p) => this.process(String(p.mediaId)));
    this.jobs.onFailure('media.process', (p, message) => this.markFailed(String(p.mediaId), message));
    this.jobs.registerPeriodic({ name: 'media.cleanup', everyMs: 60_000, run: async () => void (await this.cleanup()) });
  }

  private maxBytes(type: MediaType) {
    return type === 'IMAGE' ? env().media.maxImageBytes : env().media.maxVideoBytes;
  }

  private checkLimits(type: MediaType, count: number) {
    if (type === 'IMAGE' && count >= MAX_IMAGES) {
      throw new BadRequestException(`Un produit peut avoir ${MAX_IMAGES} photos au maximum. Supprimez-en une avant d’en ajouter.`);
    }
    if (type === 'VIDEO' && count >= MAX_VIDEOS) {
      throw new BadRequestException('Un produit peut avoir une seule vidéo. Supprimez la vidéo existante pour la remplacer.');
    }
  }

  /** Médias comptés dans la limite : en traitement ou prêts, plus les envois autorisés non expirés. */
  private async usedSlots(tx: Prisma.TransactionClient, productId: string, type: MediaType, exceptUploadId?: string) {
    const [media, uploads] = await Promise.all([
      tx.productMedia.count({ where: { productId, type, status: { not: 'FAILED' } } }),
      tx.mediaUpload.count({
        where: { productId, type, status: 'PENDING', expiresAt: { gt: new Date() }, ...(exceptUploadId ? { id: { not: exceptUploadId } } : {}) },
      }),
    ]);
    return media + uploads;
  }

  // ─── 1. Autorisation d'envoi direct ───────────────────────────────────────

  async createUpload(userId: string, productId: string, req: UploadRequest) {
    const { shop, product } = await this.products.owned(userId, productId);
    this.shops.assertWritable(shop);
    const ext = ALLOWED[req.type][req.contentType];
    if (!ext) {
      uploadFailures.inc({ type: req.type, reason: 'format' });
      throw new BadRequestException(req.type === 'IMAGE' ? 'Formats acceptés : JPEG, PNG, WebP, AVIF.' : 'Formats acceptés : MP4, MOV, WebM.');
    }
    if (req.size > this.maxBytes(req.type)) {
      uploadFailures.inc({ type: req.type, reason: 'size' });
      throw new PayloadTooLargeException(`Fichier trop volumineux (maximum ${this.maxBytes(req.type) / 1024 / 1024} Mo).`);
    }
    const key = `uploads/${product.id}/${fileId()}.${ext}`;
    const token = env().storage.driver === 'local' ? randomToken(32) : undefined;
    const expiresAt = new Date(Date.now() + env().media.uploadTtlSeconds * 1000);

    const upload = await this.prisma.$transaction(async (tx) => {
      // Verrou : deux demandes simultanées ne peuvent pas dépasser la limite.
      await tx.$executeRaw`SELECT id FROM "Product" WHERE id = ${product.id} FOR UPDATE`;
      this.checkLimits(req.type, await this.usedSlots(tx, product.id, req.type));
      return tx.mediaUpload.create({
        data: {
          productId: product.id,
          shopId: shop.id,
          userId,
          type: req.type,
          key,
          mime: req.contentType,
          size: req.size,
          tokenHash: token ? sha256(token) : null,
          expiresAt,
        },
      });
    });
    const signed = await this.storage.presignPut(key, req.contentType, req.size, env().media.uploadTtlSeconds, token);
    return { uploadId: upload.id, ...signed, expiresAt, maxBytes: req.size };
  }

  /** Pilote local uniquement : réception du fichier à la place du stockage objet. */
  async receiveLocal(token: string, stream: Readable, contentType?: string, length?: number) {
    const upload = await this.prisma.mediaUpload.findUnique({ where: { tokenHash: sha256(token) } });
    if (!upload || upload.status !== 'PENDING' || upload.expiresAt <= new Date()) throw new GoneException('Autorisation d’envoi invalide ou expirée.');
    if (contentType && contentType.split(';')[0] !== upload.mime) throw new BadRequestException('Type de fichier différent de celui déclaré.');
    if (length !== undefined && length > upload.size) throw new PayloadTooLargeException('Fichier plus volumineux que déclaré.');
    if (!(this.storage instanceof LocalStorageService)) throw new NotFoundException();
    await this.storage.putStream(upload.key, stream, upload.size);
  }

  // ─── 3. Finalisation ──────────────────────────────────────────────────────

  async completeUpload(userId: string, productId: string, uploadId: string) {
    const { shop, product } = await this.products.owned(userId, productId);
    this.shops.assertWritable(shop);
    const upload = await this.prisma.mediaUpload.findFirst({ where: { id: uploadId, productId: product.id, shopId: shop.id } });
    if (!upload) throw new NotFoundException('Envoi introuvable.');
    if (upload.status === 'COMPLETED') throw new BadRequestException('Cet envoi a déjà été finalisé.');
    if (upload.status !== 'PENDING' || upload.expiresAt <= new Date()) throw new GoneException('Autorisation d’envoi expirée : recommencez l’envoi.');

    const reject = async (status: number, message: string, reason: string) => {
      uploadFailures.inc({ type: upload.type, reason });
      await this.prisma.$transaction([
        this.prisma.mediaUpload.update({ where: { id: upload.id }, data: { status: 'EXPIRED' } }),
        this.prisma.storageGarbage.create({ data: { key: upload.key } }),
      ]);
      throw status === 413 ? new PayloadTooLargeException(message) : new BadRequestException(message);
    };

    const size = await this.storage.size(upload.key);
    if (size === null) throw new BadRequestException('Le fichier n’a pas été reçu par le stockage. Réessayez l’envoi.');
    if (size > upload.size || size > this.maxBytes(upload.type)) return reject(413, 'Fichier plus volumineux que déclaré.', 'size');
    const real = sniff(await this.storage.head(upload.key, 64));
    if (!real || (real.kind === 'image' ? 'IMAGE' : 'VIDEO') !== upload.type) {
      return reject(400, 'Le contenu du fichier ne correspond pas à un format accepté.', 'format');
    }
    return this.register(userId, product.id, shop.id, upload.type, upload.key, real.mime, size, upload.id);
  }

  /** Envoi par l'API (compatibilité, petits fichiers, environnements sans stockage objet). */
  async addDirect(userId: string, productId: string, buf: Buffer) {
    const { shop, product } = await this.products.owned(userId, productId);
    this.shops.assertWritable(shop);
    const real = sniff(buf);
    if (!real) {
      uploadFailures.inc({ type: 'unknown', reason: 'format' });
      throw new BadRequestException('Fichier non pris en charge. Photos : JPEG, PNG, WebP, AVIF. Vidéo : MP4, MOV, WebM.');
    }
    const type: MediaType = real.kind === 'image' ? 'IMAGE' : 'VIDEO';
    if (buf.length > this.maxBytes(type)) {
      uploadFailures.inc({ type, reason: 'size' });
      throw new PayloadTooLargeException(`Fichier trop volumineux (maximum ${this.maxBytes(type) / 1024 / 1024} Mo).`);
    }
    // Contrôle préalable pour éviter d'écrire un fichier inutile ; le contrôle définitif est fait sous verrou.
    this.checkLimits(type, await this.prisma.$transaction((tx) => this.usedSlots(tx, product.id, type)));
    const key = `uploads/${product.id}/${fileId()}.${ALLOWED[type][real.mime]}`;
    await this.storage.put(key, buf, real.mime);
    try {
      return await this.register(userId, product.id, shop.id, type, key, real.mime, buf.length);
    } catch (e) {
      await this.prisma.storageGarbage.create({ data: { key } });
      throw e;
    }
  }

  private async register(userId: string, productId: string, shopId: string, type: MediaType, key: string, mime: string, size: number, uploadId?: string) {
    const media = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
      this.checkLimits(type, await this.usedSlots(tx, productId, type, uploadId));
      const [count, primary] = await Promise.all([
        tx.productMedia.count({ where: { productId } }),
        tx.productMedia.count({ where: { productId, isPrimary: true } }),
      ]);
      const created = await tx.productMedia.create({
        data: { productId, shopId, type, status: 'PROCESSING', key, originalKey: key, mime, size, position: count, isPrimary: type === 'IMAGE' && primary === 0 },
      });
      if (uploadId) await tx.mediaUpload.update({ where: { id: uploadId }, data: { status: 'COMPLETED' } });
      if (env().media.processing === 'queue') await this.jobs.enqueue('media.process', { mediaId: created.id }, { tx, maxAttempts: 4 });
      return created;
    });
    storageBytesUploaded.inc({ type }, size);
    await this.audit.log(userId, 'media.add', 'Product', productId, { mediaId: media.id, type, size });
    if (env().media.processing === 'inline') {
      try {
        await this.process(media.id);
      } catch (e) {
        await this.markFailed(media.id, (e as Error).message);
      }
    }
    return this.products.get(userId, productId);
  }

  // ─── 4. Traitement (worker) ───────────────────────────────────────────────

  async process(mediaId: string) {
    const media = await this.prisma.productMedia.findUnique({ where: { id: mediaId } });
    if (!media || media.status !== 'PROCESSING' || !media.originalKey) return;
    if (media.type === 'IMAGE') await this.processImage(media);
    else await this.processVideo(media);
    await this.revalidation.product(media.productId);
  }

  private async processImage(media: ProductMedia) {
    const original = await this.storage.get(media.originalKey!);
    let v;
    try {
      v = await processImageVariants(original);
    } catch (e) {
      throw new PermanentJobError((e as Error).message);
    }
    const base = `products/${media.productId}/${fileId()}`;
    const keys = { key: `${base}.webp`, mediumKey: `${base}-m.webp`, thumbKey: `${base}-t.webp` };
    await Promise.all([
      this.storage.put(keys.key, v.large, 'image/webp'),
      this.storage.put(keys.mediumKey, v.medium, 'image/webp'),
      this.storage.put(keys.thumbKey, v.thumb, 'image/webp'),
    ]);
    await this.prisma.$transaction([
      this.prisma.productMedia.update({
        where: { id: media.id },
        data: { ...keys, status: 'READY', originalKey: null, mime: 'image/webp', size: v.large.length, width: v.width, height: v.height, error: null },
      }),
      // L'original (parfois plusieurs mégaoctets) n'est jamais servi : il est supprimé.
      this.prisma.storageGarbage.create({ data: { key: media.originalKey! } }),
    ]);
  }

  private async processVideo(media: ProductMedia) {
    const ffmpeg = resolveFfmpeg();
    if (!ffmpeg) {
      // Sans ffmpeg : le fichier a été validé (signature, taille) mais ni mesuré ni transcodé ; il est diffusé tel quel.
      await this.prisma.productMedia.update({ where: { id: media.id }, data: { status: 'READY', originalKey: null, transcoded: false } });
      this.logger.warn('ffmpeg indisponible : vidéo diffusée sans transcodage ni miniature (configurez FFMPEG_PATH).');
      return;
    }
    const dir = await mkdtemp(join(tmpdir(), 'togomobile-video-'));
    try {
      const input = join(dir, 'in');
      await this.storage.download(media.originalKey!, input);
      const duration = await probeDuration(ffmpeg, input);
      if (duration === null) throw new PermanentJobError('Vidéo illisible.');
      if (duration > env().media.maxVideoSeconds) {
        throw new PermanentJobError(`Vidéo trop longue (${Math.round(duration)} s ; maximum ${env().media.maxVideoSeconds} s).`);
      }
      const posterJpg = join(dir, 'poster.jpg');
      await extractPoster(ffmpeg, input, posterJpg, duration);
      const poster = await sharp(await readFile(posterJpg)).webp({ quality: 75 }).toBuffer();
      const base = `products/${media.productId}/${fileId()}`;
      const posterKey = `${base}-poster.webp`;
      await this.storage.put(posterKey, poster, 'image/webp');

      let key = media.originalKey!;
      let size = media.size;
      let transcoded = false;
      if (env().media.transcodeVideo) {
        const out = join(dir, 'out.mp4');
        await transcodeVideo(ffmpeg, input, out);
        key = `${base}.mp4`;
        size = (await stat(out)).size;
        await this.storage.put(key, await readFile(out), 'video/mp4');
        transcoded = true;
      }
      await this.prisma.$transaction([
        this.prisma.productMedia.update({
          where: { id: media.id },
          data: { key, posterKey, status: 'READY', originalKey: null, durationSec: duration, transcoded, size, mime: transcoded ? 'video/mp4' : media.mime, error: null },
        }),
        ...(transcoded ? [this.prisma.storageGarbage.create({ data: { key: media.originalKey! } })] : []),
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** Échec définitif : le vendeur voit la raison ; le fichier envoyé est supprimé. */
  async markFailed(mediaId: string, message: string) {
    const media = await this.prisma.productMedia.findUnique({ where: { id: mediaId } });
    if (!media || media.status === 'READY') return;
    uploadFailures.inc({ type: media.type, reason: 'processing' });
    await this.prisma.$transaction([
      this.prisma.productMedia.update({ where: { id: mediaId }, data: { status: 'FAILED', isPrimary: false, error: message.slice(0, 300) } }),
      ...(media.originalKey ? [this.prisma.storageGarbage.create({ data: { key: media.originalKey } })] : []),
    ]);
    // Une autre photo prête devient principale si nécessaire.
    if (media.isPrimary) await this.ensurePrimary(media.productId);
  }

  private async ensurePrimary(productId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    const hasPrimary = await tx.productMedia.count({ where: { productId, isPrimary: true } });
    if (hasPrimary) return;
    const next = await tx.productMedia.findFirst({ where: { productId, type: 'IMAGE', status: { not: 'FAILED' } }, orderBy: { position: 'asc' } });
    if (next) await tx.productMedia.update({ where: { id: next.id }, data: { isPrimary: true } });
  }

  // ─── Gestion ──────────────────────────────────────────────────────────────

  async reorder(userId: string, productId: string, order: string[], primaryId?: string) {
    const { shop, product } = await this.products.owned(userId, productId);
    this.shops.assertWritable(shop);
    const media = await this.prisma.productMedia.findMany({ where: { productId: product.id } });
    const ids = new Set(media.map((m) => m.id));
    // Seuls les médias de ce produit peuvent être référencés.
    if (order.length !== media.length || !order.every((id) => ids.has(id)) || new Set(order).size !== order.length) {
      throw new BadRequestException('L’ordre transmis ne correspond pas aux médias de ce produit.');
    }
    if (primaryId) {
      const target = media.find((m) => m.id === primaryId);
      if (!target) throw new BadRequestException('Média principal inconnu.');
      if (target.type !== 'IMAGE' || target.status === 'FAILED') throw new BadRequestException('La photo principale doit être une image valide.');
    }
    await this.prisma.$transaction(async (tx) => {
      if (primaryId) await tx.productMedia.updateMany({ where: { productId: product.id }, data: { isPrimary: false } });
      for (const [position, id] of order.entries()) {
        await tx.productMedia.update({ where: { id }, data: { position, ...(primaryId ? { isPrimary: id === primaryId } : {}) } });
      }
    });
    await this.revalidation.product(product.id);
    return this.products.get(userId, product.id);
  }

  async remove(userId: string, productId: string, mediaId: string) {
    const { shop, product } = await this.products.owned(userId, productId);
    this.shops.assertWritable(shop);
    const media = await this.prisma.productMedia.findFirst({ where: { id: mediaId, productId: product.id } });
    if (!media) throw new NotFoundException('Média introuvable.');

    if (product.status === 'PUBLISHED' && media.type === 'IMAGE' && media.status === 'READY') {
      const images = await this.prisma.productMedia.count({ where: { productId: product.id, type: 'IMAGE', status: 'READY' } });
      if (images <= 1) {
        throw new BadRequestException('Une annonce publiée doit conserver au moins une photo. Ajoutez-en une autre avant de supprimer celle-ci.');
      }
    }
    // La suppression de la ligne place ses fichiers dans StorageGarbage (déclencheur SQL).
    await this.prisma.$transaction(async (tx) => {
      await tx.productMedia.delete({ where: { id: media.id } });
      if (media.isPrimary) await this.ensurePrimary(product.id, tx);
    });
    await this.audit.log(userId, 'media.remove', 'Product', product.id, { mediaId: media.id });
    await this.revalidation.product(product.id);
    return this.products.get(userId, product.id);
  }

  /** Supprime un brouillon ; ses fichiers sont collectés par le déclencheur SQL. */
  async deleteDraft(userId: string, productId: string) {
    const product = await this.products.remove(userId, productId);
    await this.prisma.product.delete({ where: { id: product.id } });
    await this.audit.log(userId, 'product.delete_draft', 'Product', product.id);
  }

  // ─── Nettoyage ────────────────────────────────────────────────────────────

  /**
   * - envois autorisés mais jamais finalisés : expirés, fichier éventuel supprimé ;
   * - fichiers collectés (médias supprimés, originaux traités) : supprimés du stockage par lots ;
   * Un fichier n'est supprimé que s'il n'est plus référencé par aucun média.
   */
  async cleanup() {
    const expired = await this.prisma.mediaUpload.findMany({
      where: { status: 'PENDING', expiresAt: { lt: new Date(Date.now() - 60_000) } },
      take: 200,
    });
    for (const u of expired) {
      await this.prisma.$transaction([
        this.prisma.mediaUpload.update({ where: { id: u.id }, data: { status: 'EXPIRED' } }),
        this.prisma.storageGarbage.create({ data: { key: u.key } }),
      ]);
    }

    const garbage = await this.prisma.storageGarbage.findMany({ where: { attempts: { lt: 10 } }, orderBy: { createdAt: 'asc' }, take: 200 });
    if (!garbage.length) return { expired: expired.length, deleted: 0 };
    const keys = garbage.map((g) => g.key);
    const stillUsed = await this.prisma.productMedia.findMany({
      where: { OR: [{ key: { in: keys } }, { mediumKey: { in: keys } }, { thumbKey: { in: keys } }, { posterKey: { in: keys } }, { originalKey: { in: keys } }] },
      select: { key: true, mediumKey: true, thumbKey: true, posterKey: true, originalKey: true },
    });
    const used = new Set(stillUsed.flatMap((m) => [m.key, m.mediumKey, m.thumbKey, m.posterKey, m.originalKey]).filter(Boolean));
    let deleted = 0;
    for (const g of garbage) {
      try {
        if (!used.has(g.key)) {
          await this.storage.delete(g.key);
          deleted++;
        }
        await this.prisma.storageGarbage.delete({ where: { id: g.id } });
      } catch (e) {
        await this.prisma.storageGarbage.update({ where: { id: g.id }, data: { attempts: { increment: 1 } } });
        this.logger.warn(`Suppression de ${g.key} impossible : ${(e as Error).message}`);
      }
    }
    return { expired: expired.length, deleted };
  }
}
