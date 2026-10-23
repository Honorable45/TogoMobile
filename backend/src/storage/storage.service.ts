import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Global, Logger, Module } from '@nestjs/common';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { env } from '../config/env';

export interface PresignedUpload {
  /** URL vers laquelle le navigateur envoie le fichier (méthode PUT). */
  url: string;
  method: 'PUT';
  /** En-têtes que le navigateur doit transmettre tels quels (ils font partie de la signature). */
  headers: Record<string, string>;
}

/**
 * Abstraction du stockage objet. Les règles métier ne connaissent que des clés ;
 * le pilote (local ou S3/R2) peut être remplacé sans toucher au reste du code.
 */
export abstract class StorageService {
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  abstract delete(key: string): Promise<void>;
  abstract publicUrl(key: string): string;
  /** Autorisation temporaire d'envoi direct depuis le navigateur. */
  abstract presignPut(key: string, contentType: string, size: number, expiresSeconds: number, localToken?: string): Promise<PresignedUpload>;
  /** Taille de l'objet, ou null s'il n'existe pas. */
  abstract size(key: string): Promise<number | null>;
  /** Premiers octets de l'objet (détection du type réel sans tout télécharger). */
  abstract head(key: string, bytes: number): Promise<Buffer>;
  abstract get(key: string): Promise<Buffer>;
  abstract download(key: string, file: string): Promise<void>;
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9/_-]*\.[a-z0-9]{2,5}$/;

export function assertSafeKey(key: string) {
  if (!KEY_PATTERN.test(key) || key.includes('..')) throw new Error(`Clé de stockage invalide : ${key}`);
}

/** Stockage sur disque — développement et tests uniquement (interdit en production). */
export class LocalStorageService extends StorageService {
  readonly root = resolve(env().storage.localDir);

  path(key: string) {
    assertSafeKey(key);
    const p = resolve(this.root, key);
    if (!p.startsWith(this.root + sep)) throw new Error('Chemin de stockage invalide');
    return p;
  }

  async put(key: string, body: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  }

  /** Écriture en flux (envoi direct en développement), avec plafond de taille. */
  async putStream(key: string, stream: Readable, maxBytes: number) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    let received = 0;
    stream.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxBytes) stream.destroy(new Error('Fichier plus volumineux que déclaré.'));
    });
    try {
      await pipeline(stream, createWriteStream(p));
    } catch (e) {
      await unlink(p).catch(() => undefined);
      throw e;
    }
    return received;
  }

  async delete(key: string) {
    await unlink(this.path(key)).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'ENOENT') throw e;
    });
  }

  publicUrl(key: string) {
    return `${env().apiUrl}/media/${key}`;
  }

  async presignPut(_key: string, contentType: string, _size: number, _expires: number, localToken?: string): Promise<PresignedUpload> {
    if (!localToken) throw new Error('Jeton requis pour le pilote local');
    // En local, l'API joue le rôle du stockage objet : l'envoi est authentifié par un jeton à usage unique.
    // URL relative : le navigateur passe par le relais /api/v1 du site (même origine, aucun réglage CORS).
    return { url: `/api/v1/uploads/${localToken}`, method: 'PUT', headers: { 'Content-Type': contentType } };
  }

  async size(key: string) {
    try {
      return (await stat(this.path(key))).size;
    } catch {
      return null;
    }
  }

  async head(key: string, bytes: number) {
    const fh = await open(this.path(key), 'r');
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await fh.read(buf, 0, bytes, 0);
      return buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  }

  get(key: string) {
    return readFile(this.path(key));
  }

  async download(key: string, file: string) {
    await pipeline(createReadStream(this.path(key)), createWriteStream(file));
  }
}

/** Stockage compatible S3 (AWS S3, Cloudflare R2, MinIO…). Les identifiants ne quittent jamais le serveur. */
export class S3StorageService extends StorageService {
  private readonly logger = new Logger('S3Storage');
  private readonly cfg = env().storage;
  private readonly client = new S3Client({
    region: this.cfg.region,
    endpoint: this.cfg.endpoint,
    forcePathStyle: !!this.cfg.endpoint,
    credentials: { accessKeyId: this.cfg.accessKeyId, secretAccessKey: this.cfg.secretAccessKey },
  });

  async put(key: string, body: Buffer, contentType: string) {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentDisposition: 'inline',
        // Les clés sont uniques et jamais réécrites : mise en cache longue durée possible.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }

  async delete(key: string) {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }

  publicUrl(key: string) {
    return `${this.cfg.publicUrl}/${key}`;
  }

  async presignPut(key: string, contentType: string, size: number, expiresSeconds: number): Promise<PresignedUpload> {
    assertSafeKey(key);
    // Type et taille font partie de la signature : le navigateur ne peut pas envoyer autre chose
    // (R2 ne prend pas en charge les formulaires POST signés, d'où un PUT à taille fixée).
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, ContentType: contentType, ContentLength: size }),
      { expiresIn: expiresSeconds, signableHeaders: new Set(['content-type', 'content-length']) },
    );
    return { url, method: 'PUT', headers: { 'Content-Type': contentType } };
  }

  async size(key: string) {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
      return r.ContentLength ?? null;
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      this.logger.warn(`HEAD ${key} : ${(e as Error).message}`);
      throw e;
    }
  }

  async head(key: string, bytes: number) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }

  async get(key: string) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }

  async download(key: string, file: string) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
    await pipeline(r.Body as Readable, createWriteStream(file));
  }
}

@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      useFactory: () => (env().storage.driver === 's3' ? new S3StorageService() : new LocalStorageService()),
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}

