import { createServer, type IncomingMessage, type Server } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { resetEnvCache } from '../../src/config/env';
import { MediaService } from '../../src/media/media.service';
import { resolveFfmpeg } from '../../src/media/media-processing';
import { CloudinaryStorageService, cloudinarySignature, StorageService } from '../../src/storage/storage.service';
import { brand, client, Ctx, productBody, seller, setupApp } from '../helpers';

const PORT = 4998;
const BASE = `http://127.0.0.1:${PORT}`;
const API_KEY = 'cle-test-123';
const API_SECRET = 'secret-test-456-ne-doit-jamais-sortir';
const CLOUD = 'demo-togomobile';
const FOLDER = 'togomobile-test';

describe('Signature Cloudinary', () => {
  it('reproduit l’exemple de la documentation officielle', () => {
    // https://cloudinary.com/documentation/authentication_signatures (exemple « Manual signature generation »)
    const sig = cloudinarySignature({ eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop', public_id: 'sample_image', timestamp: 1315060510 }, 'abcd');
    expect(sig).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('ignore file, api_key, resource_type et cloud_name', () => {
    const base = cloudinarySignature({ public_id: 'a', timestamp: 1 }, 's');
    expect(cloudinarySignature({ public_id: 'a', timestamp: 1, api_key: 'k', file: 'f', resource_type: 'image', cloud_name: 'c' }, 's')).toBe(base);
  });
});

/**
 * Serveur Cloudinary simulé : API d'envoi et de suppression signées (signature vérifiée comme le fait Cloudinary,
 * fenêtre d'une heure), et CDN de diffusion (GET, HEAD, Range). Aucun appel au vrai service.
 */
function fakeCloudinary() {
  const store = new Map<string, Buffer>();
  const calls: Array<{ action: string; type: string; publicId: string }> = [];

  const readBody = (req: IncomingMessage) =>
    new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, BASE);
    const api = url.pathname.match(/^\/v1_1\/([^/]+)\/(image|video)\/(upload|destroy)$/);
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(body));
    };
    if (api && req.method === 'POST') {
      const [, cloud, type, action] = api;
      const form = await new Request(url, { method: 'POST', headers: req.headers as Record<string, string>, body: await readBody(req) }).formData();
      const params: Record<string, string> = {};
      let file: Buffer | null = null;
      for (const [k, v] of form.entries()) {
        if (k === 'file' && typeof v !== 'string') file = Buffer.from(await v.arrayBuffer());
        else params[k] = String(v);
      }
      const { signature, api_key, ...signed } = params;
      if (cloud !== CLOUD || api_key !== API_KEY) return json(401, { error: { message: 'Invalid api_key' } });
      if (signature !== cloudinarySignature(signed, API_SECRET)) return json(401, { error: { message: 'Invalid Signature' } });
      if (Math.abs(Date.now() / 1000 - Number(signed.timestamp)) > 3600) return json(400, { error: { message: 'Stale request' } });
      const id = `${type}/${signed.public_id}`;
      calls.push({ action, type, publicId: signed.public_id });
      if (action === 'destroy') return json(200, { result: store.delete(id) ? 'ok' : 'not found' });
      if (!file) return json(400, { error: { message: 'Missing required parameter - file' } });
      store.set(id, file);
      return json(200, { public_id: signed.public_id, bytes: file.length, resource_type: type });
    }
    const cdn = url.pathname.match(/^\/([^/]+)\/(image|video)\/upload\/(.+)\.[a-z0-9]+$/);
    const body = cdn && cdn[1] === CLOUD ? store.get(`${cdn[2]}/${cdn[3]}`) : undefined;
    if (!body) {
      res.writeHead(404);
      return res.end();
    }
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d+)$/);
    const part = range ? body.subarray(Number(range[1]), Number(range[2]) + 1) : body;
    res.writeHead(range ? 206 : 200, { 'Content-Length': String(req.method === 'HEAD' ? body.length : part.length) });
    res.end(req.method === 'HEAD' ? undefined : part);
  });
  return { server, store, calls };
}

describe('Stockage Cloudinary (serveur simulé)', () => {
  const cloud = fakeCloudinary();
  const saved: Record<string, string | undefined> = {};
  const vars = {
    STORAGE_DRIVER: 'cloudinary',
    CLOUDINARY_URL: `cloudinary://${API_KEY}:${API_SECRET}@${CLOUD}`,
    CLOUDINARY_FOLDER: FOLDER,
    CLOUDINARY_API_BASE: BASE,
    CLOUDINARY_DELIVERY_BASE: BASE,
  };
  let ctx: Ctx;
  let brandId: string;

  beforeAll(async () => {
    await new Promise<void>((r) => cloud.server.listen(PORT, '127.0.0.1', r));
    for (const [k, v] of Object.entries(vars)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    resetEnvCache();
    ctx = await setupApp();
    brandId = (await brand(ctx.prisma)).id;
  });
  afterAll(async () => {
    await ctx.app.close();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetEnvCache();
    cloud.server.closeAllConnections();
    await new Promise((r) => cloud.server.close(r));
  });

  const media = () => ctx.app.get(MediaService);
  const draft = async (agent: ReturnType<typeof client>) => (await agent.post('/api/v1/seller/products').send(productBody(brandId)).expect(201)).body.id as string;

  /** Ce que fait le navigateur : formulaire signé envoyé directement à Cloudinary. */
  async function browserUpload(auth: { url: string; method: string; fields: Record<string, string> }, buf: Buffer, name: string, tamper?: Record<string, string>) {
    const form = new FormData();
    for (const [k, v] of Object.entries({ ...auth.fields, ...tamper })) form.append(k, v);
    form.append('file', new Blob([new Uint8Array(buf)]), name);
    return fetch(auth.url, { method: auth.method, body: form });
  }

  async function authorize(agent: ReturnType<typeof client>, productId: string, buf: Buffer, contentType: string, type = 'IMAGE') {
    return (await agent.post(`/api/v1/seller/products/${productId}/media/uploads`).send({ type, contentType, size: buf.length }).expect(201)).body;
  }

  it('utilise le pilote Cloudinary', () => {
    expect(ctx.app.get(StorageService)).toBeInstanceOf(CloudinaryStorageService);
  });

  it('envoi direct signé, variantes WebP servies par le CDN, original supprimé ; le secret ne sort jamais', async () => {
    const { agent } = await seller(ctx);
    const id = await draft(agent);
    const photo = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: '#357' } }).jpeg().toBuffer();
    const auth = await authorize(agent, id, photo, 'image/jpeg');

    expect(auth.method).toBe('POST');
    expect(auth.url).toBe(`${BASE}/v1_1/${CLOUD}/image/upload`);
    expect(Object.keys(auth.fields).sort()).toEqual(['api_key', 'public_id', 'signature', 'timestamp']);
    expect(auth.fields.public_id).toMatch(new RegExp(`^${FOLDER}/uploads/${id}/[a-z0-9-]+$`));
    expect(JSON.stringify(auth)).not.toContain(API_SECRET);

    expect((await browserUpload(auth, photo, 'photo.jpg')).status).toBe(200);
    const res = await agent.post(`/api/v1/seller/products/${id}/media/uploads/${auth.uploadId}/complete`).expect(200);
    const m = res.body.media[0];
    expect(m).toMatchObject({ type: 'IMAGE', status: 'READY', width: 1600, height: 1200 });
    const cdn = new RegExp(`^${BASE}/${CLOUD}/image/upload/${FOLDER}/products/${id}/[a-z0-9-]+-t\\.webp$`);
    expect(m.thumbUrl).toMatch(cdn);
    const thumb = Buffer.from(await (await fetch(m.thumbUrl)).arrayBuffer());
    expect((await sharp(thumb).metadata()).width).toBe(480);

    await media().cleanup();
    expect(cloud.store.has(`image/${auth.fields.public_id}`)).toBe(false);
    expect(cloud.calls).toContainEqual({ action: 'destroy', type: 'image', publicId: auth.fields.public_id });

    // Suppression du média : les trois variantes sont supprimées de Cloudinary au nettoyage.
    const before = [...cloud.store.keys()].filter((k) => k.includes(`/products/${id}/`));
    expect(before).toHaveLength(3);
    await agent.delete(`/api/v1/seller/products/${id}/media/${m.id}`).expect(200);
    await media().cleanup();
    expect([...cloud.store.keys()].filter((k) => k.includes(`/products/${id}/`))).toHaveLength(0);
  });

  it('la signature ne vaut que pour l’identifiant autorisé', async () => {
    const { agent } = await seller(ctx);
    const id = await draft(agent);
    const photo = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).png().toBuffer();
    const auth = await authorize(agent, id, photo, 'image/png');
    const res = await browserUpload(auth, photo, 'x.png', { public_id: `${FOLDER}/products/autre-produit/pirate` });
    expect(res.status).toBe(401);
    expect(cloud.store.has(`image/${FOLDER}/products/autre-produit/pirate`)).toBe(false);
  });

  it('refuse à la finalisation un fichier plus gros que déclaré, puis le supprime de Cloudinary', async () => {
    const { agent } = await seller(ctx);
    const id = await draft(agent);
    const small = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).png().toBuffer();
    const big = await sharp({ create: { width: 900, height: 900, channels: 3, background: '#000', noise: { type: 'gaussian', mean: 128, sigma: 60 } } }).png().toBuffer();
    const auth = await authorize(agent, id, small, 'image/png');
    expect((await browserUpload(auth, big, 'x.png')).status).toBe(200);
    await agent.post(`/api/v1/seller/products/${id}/media/uploads/${auth.uploadId}/complete`).expect(413);
    await media().cleanup();
    expect(cloud.store.has(`image/${auth.fields.public_id}`)).toBe(false);
  });

  const ffmpeg = resolveFfmpeg();
  (ffmpeg ? it : it.skip)('vidéo : envoi en ressource vidéo, miniature image et vidéo transcodée sur Cloudinary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tm-cld-'));
    const file = join(dir, 'v.mp4');
    execFileSync(ffmpeg!, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10:duration=2', '-pix_fmt', 'yuv420p', file]);
    const video = readFileSync(file);
    const { agent } = await seller(ctx);
    const id = await draft(agent);
    const auth = await authorize(agent, id, video, 'video/mp4', 'VIDEO');
    expect(auth.url).toBe(`${BASE}/v1_1/${CLOUD}/video/upload`);
    expect((await browserUpload(auth, video, 'v.mp4')).status).toBe(200);
    const res = await agent.post(`/api/v1/seller/products/${id}/media/uploads/${auth.uploadId}/complete`).expect(200);
    const v = res.body.media.find((x: { type: string }) => x.type === 'VIDEO');
    expect(v).toMatchObject({ status: 'READY', transcoded: true });
    expect(v.url).toMatch(new RegExp(`^${BASE}/${CLOUD}/video/upload/${FOLDER}/products/${id}/.+\\.mp4$`));
    expect(v.posterUrl).toMatch(new RegExp(`^${BASE}/${CLOUD}/image/upload/${FOLDER}/products/${id}/.+-poster\\.webp$`));
    expect((await fetch(v.url, { method: 'HEAD' })).status).toBe(200);
  });
});
