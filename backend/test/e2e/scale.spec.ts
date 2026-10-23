import { createServer, type Server } from 'node:http';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import sharp from 'sharp';
import { JobsService, PermanentJobError } from '../../src/jobs/jobs.service';
import { MediaService } from '../../src/media/media.service';
import { resolveFfmpeg } from '../../src/media/media-processing';
import { RedisThrottlerStorage } from '../../src/common/redis-throttler.storage';
import { LocalStorageService, StorageService } from '../../src/storage/storage.service';
import { brand, client, Ctx, loggedIn, PASSWORD, png, productBody, publishedProduct, seller, setupApp } from '../helpers';

/** Mise à l'échelle : envoi direct, traitement asynchrone, modération, cache, verrouillage, observabilité. */
describe('Mise à l’échelle et sécurité renforcée', () => {
  let ctx: Ctx;
  let brandId: string;
  let revalidateServer: Server;
  const revalidations: Array<{ tags: string[]; secret?: string }> = [];
  let revalidateStatus = 200;

  beforeAll(async () => {
    revalidateServer = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        revalidations.push({ tags: JSON.parse(body).tags, secret: req.headers['x-revalidate-secret'] as string });
        res.statusCode = revalidateStatus;
        res.end('{}');
      });
    });
    await new Promise<void>((r) => revalidateServer.listen(4999, '127.0.0.1', r));
    ctx = await setupApp();
    brandId = (await brand(ctx.prisma)).id;
  });
  afterAll(async () => {
    await ctx.app.close();
    revalidateServer.closeAllConnections();
    await new Promise((r) => revalidateServer.close(r));
  });

  const jobs = () => ctx.app.get(JobsService);
  const media = () => ctx.app.get(MediaService);
  const draft = async (agent: ReturnType<typeof client>) => (await agent.post('/api/v1/seller/products').send(productBody(brandId)).expect(201)).body.id as string;

  async function directUpload(agent: ReturnType<typeof client>, productId: string, buf: Buffer, contentType = 'image/png', type = 'IMAGE') {
    const auth = await agent.post(`/api/v1/seller/products/${productId}/media/uploads`).send({ type, contentType, size: buf.length }).expect(201);
    await agent.put(auth.body.url).set('Content-Type', contentType).send(buf).expect(200);
    return { auth: auth.body, complete: () => agent.post(`/api/v1/seller/products/${productId}/media/uploads/${auth.body.uploadId}/complete`) };
  }

  describe('Envoi direct des médias', () => {
    it('autorise, reçoit, vérifie puis produit trois variantes WebP ; l’original est supprimé', async () => {
      const { agent } = await seller(ctx);
      const id = await draft(agent);
      const big = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: '#468' } }).jpeg().toBuffer();
      const up = await directUpload(agent, id, big, 'image/jpeg');
      expect(up.auth.url).toMatch(/^\/api\/v1\/uploads\/[A-Za-z0-9_-]{43}$/);
      expect(up.auth.headers).toEqual({ 'Content-Type': 'image/jpeg' });
      const res = await up.complete().expect(200);
      const m = res.body.media[0];
      expect(m).toMatchObject({ type: 'IMAGE', status: 'READY', isPrimary: true, width: 1600, height: 1200 });
      expect(m.thumbUrl).toMatch(/-t\.webp$/);
      expect(m.mediumUrl).toMatch(/-m\.webp$/);
      const row = await ctx.prisma.productMedia.findFirstOrThrow({ where: { productId: id } });
      expect(row.originalKey).toBeNull();
      const garbage = await ctx.prisma.storageGarbage.findMany();
      expect(garbage.some((g) => g.key.startsWith(`uploads/${id}/`))).toBe(true);
      await media().cleanup();
      const root = (ctx.app.get(StorageService) as LocalStorageService).root;
      expect(existsSync(join(root, garbage[0].key))).toBe(false);
      expect(existsSync(join(root, row.thumbKey!))).toBe(true);
    });

    it('refuse un type non autorisé, un fichier trop gros et le produit d’un autre vendeur', async () => {
      const { agent } = await seller(ctx);
      const other = await seller(ctx);
      const id = await draft(agent);
      await agent.post(`/api/v1/seller/products/${id}/media/uploads`).send({ type: 'IMAGE', contentType: 'image/gif', size: 100 }).expect(400);
      await agent.post(`/api/v1/seller/products/${id}/media/uploads`).send({ type: 'IMAGE', contentType: 'image/png', size: 50 * 1024 * 1024 }).expect(413);
      await other.agent.post(`/api/v1/seller/products/${id}/media/uploads`).send({ type: 'IMAGE', contentType: 'image/png', size: 100 }).expect(404);
    });

    it('réserve les places : une 4ᵉ autorisation photo est refusée même avant les envois', async () => {
      const { agent } = await seller(ctx);
      const id = await draft(agent);
      const ask = () => agent.post(`/api/v1/seller/products/${id}/media/uploads`).send({ type: 'IMAGE', contentType: 'image/png', size: 1000 });
      const results = await Promise.all([ask(), ask(), ask(), ask(), ask()]);
      expect(results.filter((r) => r.status === 201)).toHaveLength(3);
      expect(results.filter((r) => r.status === 400)).toHaveLength(2);
    });

    it('rejette à la finalisation un contenu qui ne correspond pas au type déclaré', async () => {
      const { agent } = await seller(ctx);
      const id = await draft(agent);
      const fake = Buffer.from('<?php system($_GET["c"]); ?>'.padEnd(300, ' '));
      const up = await directUpload(agent, id, fake, 'image/png');
      const res = await up.complete().expect(400);
      expect(res.body.message).toContain('ne correspond pas');
      expect(await ctx.prisma.productMedia.count({ where: { productId: id } })).toBe(0);
      expect((await ctx.prisma.mediaUpload.findUniqueOrThrow({ where: { id: up.auth.uploadId } })).status).toBe('EXPIRED');
    });

    it('refuse un envoi plus gros que déclaré, une finalisation sans fichier et un jeton réutilisé', async () => {
      const { agent } = await seller(ctx);
      const id = await draft(agent);
      const auth = await agent.post(`/api/v1/seller/products/${id}/media/uploads`).send({ type: 'IMAGE', contentType: 'image/png', size: 100 }).expect(201);
      await agent.post(`/api/v1/seller/products/${id}/media/uploads/${auth.body.uploadId}/complete`).expect(400);
      await agent.put(auth.body.url).set('Content-Type', 'image/png').send(await png(200, 200)).expect(413);
      const img = await png();
      const up = await directUpload(agent, id, img);
      await up.complete().expect(200);
      await agent.put(up.auth.url).set('Content-Type', 'image/png').send(img).expect(410);
    });

    it('refuse la finalisation d’une autorisation expirée', async () => {
      const { agent } = await seller(ctx);
      const id = await draft(agent);
      const up = await directUpload(agent, id, await png());
      await ctx.prisma.mediaUpload.update({ where: { id: up.auth.uploadId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await up.complete().expect(410);
    });

    it('marque en échec une image corrompue, sans l’afficher ni permettre la publication', async () => {
      const { agent } = await seller(ctx);
      const id = await draft(agent);
      const corrupt = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 7)]);
      const res = await agent.post(`/api/v1/seller/products/${id}/media`).attach('file', corrupt, 'x.jpg').expect(201);
      expect(res.body.media[0]).toMatchObject({ status: 'FAILED', url: null });
      expect(res.body.media[0].error).toBeTruthy();
      await agent.post(`/api/v1/seller/products/${id}/publish`).expect(400);
    });
  });

  describe('Traitement vidéo (ffmpeg)', () => {
    const ffmpeg = resolveFfmpeg();
    const makeVideo = (seconds: number) => {
      const dir = mkdtempSync(join(tmpdir(), 'tm-video-'));
      const file = join(dir, 'v.mp4');
      execFileSync(ffmpeg!, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc=size=320x240:rate=10:duration=${seconds}`, '-pix_fmt', 'yuv420p', file]);
      return readFileSync(file);
    };

    (ffmpeg ? it : it.skip)('mesure la durée, crée une miniature et transcode la vidéo en H.264', async () => {
      const { agent } = await seller(ctx);
      const id = await draft(agent);
      const up = await directUpload(agent, id, makeVideo(2), 'video/mp4', 'VIDEO');
      const res = await up.complete().expect(200);
      const v = res.body.media.find((m: { type: string }) => m.type === 'VIDEO');
      expect(v).toMatchObject({ status: 'READY', transcoded: true });
      expect(v.durationSec).toBeCloseTo(2, 0);
      expect(v.posterUrl).toMatch(/-poster\.webp$/);
    });

    (ffmpeg ? it : it.skip)('refuse une vidéo trop longue avec un message clair', async () => {
      const { agent } = await seller(ctx);
      const id = await draft(agent);
      const res = await agent.post(`/api/v1/seller/products/${id}/media`).attach('file', makeVideo(95), 'long.mp4').expect(201);
      const v = res.body.media.find((m: { type: string }) => m.type === 'VIDEO');
      expect(v.status).toBe('FAILED');
      expect(v.error).toContain('trop longue');
    });
  });

  describe('File de tâches', () => {
    it('retente une tâche en échec puis la marque FAILED ; une erreur définitive n’est pas retentée', async () => {
      let calls = 0;
      jobs().register('test.flaky', async () => {
        calls++;
        throw new Error('panne');
      });
      jobs().register('test.permanent', async () => {
        throw new PermanentJobError('définitif');
      });
      const flaky = await jobs().enqueue('test.flaky', {}, { maxAttempts: 2 });
      const perm = await jobs().enqueue('test.permanent', {});
      await jobs().drain();
      expect((await ctx.prisma.job.findUniqueOrThrow({ where: { id: perm.id } })).status).toBe('FAILED');
      let j = await ctx.prisma.job.findUniqueOrThrow({ where: { id: flaky.id } });
      expect(j).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'panne' });
      await ctx.prisma.job.update({ where: { id: flaky.id }, data: { runAt: new Date() } });
      await jobs().drain();
      j = await ctx.prisma.job.findUniqueOrThrow({ where: { id: flaky.id } });
      expect(j).toMatchObject({ status: 'FAILED', attempts: 2 });
      expect(calls).toBe(2);
    });

    it('n’exécute chaque tâche qu’une fois avec plusieurs workers simultanés', async () => {
      const seen: string[] = [];
      jobs().register('test.once', async (p) => {
        seen.push(String(p.n));
      });
      for (let n = 0; n < 20; n++) await jobs().enqueue('test.once', { n });
      await Promise.all([jobs().drain(), jobs().drain(), jobs().drain()]);
      expect(seen.sort()).toEqual(Array.from({ length: 20 }, (_, n) => String(n)).sort());
    });
  });

  describe('Modération des annonces et des boutiques', () => {
    it('la validation de la boutique n’approuve pas ses annonces : validation produit requise', async () => {
      const s = await seller(ctx, 'ACTIVE', { trusted: false });
      const p = await publishedProduct(s.agent, brandId);
      expect(p).toMatchObject({ status: 'PUBLISHED', moderation: 'PENDING' });
      await client(ctx.app).get(`/api/v1/products/${p.slug}`).expect(404);
      const { agent: admin } = await loggedIn(ctx, { role: 'ADMIN' });
      const queue = await admin.get('/api/v1/admin/products?moderation=PENDING').expect(200);
      expect(queue.body.items.map((i: { id: string }) => i.id)).toContain(p.id);
      await admin.post(`/api/v1/admin/products/${p.id}/moderate`).send({ approve: false }).expect(400);
      await admin.post(`/api/v1/admin/products/${p.id}/moderate`).send({ approve: false, note: 'Photo floue' }).expect(200);
      await client(ctx.app).get(`/api/v1/products/${p.slug}`).expect(404);
      // Correction puis nouvelle publication : retour en attente.
      await s.agent.post(`/api/v1/seller/products/${p.id}/unpublish`).expect(200);
      const again = await s.agent.post(`/api/v1/seller/products/${p.id}/publish`).expect(200);
      expect(again.body.moderation).toBe('PENDING');
      await admin.post(`/api/v1/admin/products/${p.id}/moderate`).send({ approve: true }).expect(200);
      await client(ctx.app).get(`/api/v1/products/${p.slug}`).expect(200);
    });

    it('un vendeur de confiance publie directement', async () => {
      const s = await seller(ctx, 'ACTIVE', { trusted: false });
      const { agent: admin } = await loggedIn(ctx, { role: 'ADMIN' });
      await admin.post(`/api/v1/admin/shops/${s.shop.id}/trusted`).send({ trusted: true }).expect(200);
      const p = await publishedProduct(s.agent, brandId);
      expect(p).toMatchObject({ moderation: 'APPROVED' });
    });

    it('corrections demandées : la boutique repasse en attente une fois modifiée', async () => {
      const s = await seller(ctx, 'PENDING');
      const { agent: admin } = await loggedIn(ctx, { role: 'ADMIN' });
      await admin.post(`/api/v1/admin/shops/${s.shop.id}/status`).send({ status: 'CHANGES_REQUESTED' }).expect(400);
      await admin.post(`/api/v1/admin/shops/${s.shop.id}/status`).send({ status: 'CHANGES_REQUESTED', reason: 'Ajoutez un logo et une adresse' }).expect(200);
      const shop = await s.agent.get('/api/v1/seller/shop').expect(200);
      expect(shop.body).toMatchObject({ status: 'CHANGES_REQUESTED', statusReason: 'Ajoutez un logo et une adresse' });
      const updated = await s.agent.patch('/api/v1/seller/shop').send({ address: 'Rue du Commerce, Lomé' }).expect(200);
      expect(updated.body.status).toBe('PENDING');
    });
  });

  describe('Verrouillage des comptes', () => {
    it('verrouille un compte après des échecs répétés, même avec des adresses IP différentes', async () => {
      const { user } = await loggedIn(ctx);
      for (let i = 0; i < 8; i++) {
        await client(ctx.app).post('/api/v1/auth/login').send({ identifier: user.email, password: 'mauvais1234' }).expect(401);
      }
      const locked = await client(ctx.app).post('/api/v1/auth/login').send({ identifier: user.email, password: PASSWORD }).expect(429);
      expect(locked.body.code).toBe('ACCOUNT_LOCKED');
      await ctx.prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
      await client(ctx.app).post('/api/v1/auth/login').send({ identifier: user.email, password: PASSWORD }).expect(200);
      expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).failedLoginCount).toBe(0);
    });
  });

  describe('Cache HTTP et invalidation ciblée', () => {
    it('cache CDN court pour les lectures publiques anonymes, jamais pour le reste', async () => {
      const pub = await client(ctx.app).get('/api/v1/catalog/products').expect(200);
      expect(pub.headers['cache-control']).toBe('public, max-age=0, s-maxage=30, stale-while-revalidate=60');
      const { agent } = await loggedIn(ctx);
      expect((await agent.get('/api/v1/catalog/products').expect(200)).headers['cache-control']).toBe('private, no-store');
      expect((await agent.get('/api/v1/auth/me').expect(200)).headers['cache-control']).toBe('private, no-store');
      const login = await client(ctx.app).post('/api/v1/auth/login').send({ identifier: 'x@y.tg', password: 'x' });
      expect(login.headers['cache-control']).toBe('private, no-store');
    });

    it('invalide immédiatement après un changement de prix', async () => {
      const s = await seller(ctx);
      const p = await publishedProduct(s.agent, brandId);
      revalidations.length = 0;
      revalidateStatus = 200;
      await s.agent.patch(`/api/v1/seller/products/${p.id}/stock`).send({ stock: 0 }).expect(200);
      // Sans attendre le worker : l'appel est fait pendant la requête.
      expect(revalidations.flatMap((r) => r.tags)).toContain(`product:${p.slug}`);
    });

    it('un changement de prix invalide la fiche, la boutique et les listes ; échec du site = nouvelle tentative', async () => {
      const s = await seller(ctx);
      const p = await publishedProduct(s.agent, brandId);
      await jobs().drain();
      revalidations.length = 0;
      revalidateStatus = 500;
      await s.agent.patch(`/api/v1/seller/products/${p.id}`).send({ price: 95000 }).expect(200);
      // L'appel direct a échoué : l'invalidation a été mise en file, puis retentée par le worker.
      await jobs().drain();
      const job = await ctx.prisma.job.findFirstOrThrow({ where: { type: 'web.revalidate' }, orderBy: { createdAt: 'desc' } });
      expect(job).toMatchObject({ status: 'PENDING', attempts: 1 });
      revalidateStatus = 200;
      await ctx.prisma.job.update({ where: { id: job.id }, data: { runAt: new Date() } });
      await jobs().drain();
      const last = revalidations[revalidations.length - 1];
      expect(last.secret).toBe('test-revalidate-secret-0123456789');
      expect(last.tags).toEqual(expect.arrayContaining([`product:${p.slug}`, `shop:${s.shop.slug}`, 'catalog', 'home', 'promotions']));
    });

    it('la suspension d’une boutique invalide toutes ses fiches produit', async () => {
      const s = await seller(ctx);
      const a = await publishedProduct(s.agent, brandId);
      const b = await publishedProduct(s.agent, brandId);
      await jobs().drain();
      revalidations.length = 0;
      const { agent: admin } = await loggedIn(ctx, { role: 'ADMIN' });
      await admin.post(`/api/v1/admin/shops/${s.shop.id}/status`).send({ status: 'SUSPENDED', reason: 'Fraude' }).expect(200);
      await jobs().drain();
      const all = revalidations.flatMap((r) => r.tags);
      expect(all).toEqual(expect.arrayContaining([`product:${a.slug}`, `product:${b.slug}`, `shop:${s.shop.slug}`]));
    });
  });

  describe('Requêtes bornées, observabilité, suppression en cascade', () => {
    it('refuse une page trop profonde', async () => {
      const res = await client(ctx.app).get('/api/v1/catalog/products?page=200&pageSize=60').expect(400);
      expect(res.body.message).toContain('affinez');
    });

    it('expose les métriques uniquement avec le jeton', async () => {
      await client(ctx.app).get('/api/v1/metrics').expect(404);
      await client(ctx.app).get('/api/v1/metrics').set('Authorization', 'Bearer mauvais-jeton-de-test!').expect(404);
      const ok = await client(ctx.app).get('/api/v1/metrics').set('Authorization', 'Bearer test-metrics-token').expect(200);
      expect(ok.text).toContain('togomobile_http_request_duration_seconds');
      expect(ok.text).toContain('prisma_pool_connections');
    });

    it('distingue vivacité et disponibilité', async () => {
      await client(ctx.app).get('/api/v1/health/live').expect(200, { status: 'ok' });
      const ready = await client(ctx.app).get('/api/v1/health').expect(200);
      expect(ready.body).toMatchObject({ status: 'ok', database: 'ok', jobs: expect.any(Object) });
    });

    it('collecte les fichiers des médias supprimés en cascade (brouillon supprimé)', async () => {
      const { agent } = await seller(ctx);
      const id = await draft(agent);
      await agent.post(`/api/v1/seller/products/${id}/media`).attach('file', await png(), 'a.png').expect(201);
      const m = await ctx.prisma.productMedia.findFirstOrThrow({ where: { productId: id } });
      await agent.delete(`/api/v1/seller/products/${id}`).expect(204);
      const keys = (await ctx.prisma.storageGarbage.findMany()).map((g) => g.key);
      expect(keys).toEqual(expect.arrayContaining([m.key, m.mediumKey, m.thumbKey]));
    });

    it('reçoit les erreurs du site', async () => {
      await client(ctx.app).post('/api/v1/client-errors').send({ message: 'TypeError: x is undefined', url: '/catalogue?q=a' }).expect(204);
      await client(ctx.app).post('/api/v1/client-errors').send({ message: 'x'.repeat(600) }).expect(400);
    });
  });

  describe('Limitation de débit partagée (Redis)', () => {
    let redis: ChildProcess | null = null;
    const hasRedis = (() => {
      try {
        execFileSync('redis-server', ['--version'], { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    })();

    beforeAll(async () => {
      if (!hasRedis) return;
      redis = spawn('redis-server', ['--port', '6391', '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
      await new Promise((r) => setTimeout(r, 400));
    });
    afterAll(() => redis?.kill());

    (hasRedis ? it : it.skip)('compte et bloque de façon atomique, partagé entre deux instances', async () => {
      const a = new RedisThrottlerStorage('redis://127.0.0.1:6391');
      const b = new RedisThrottlerStorage('redis://127.0.0.1:6391');
      try {
        await Promise.all([a.redis.ping(), b.redis.ping()]);
        const key = `k-${Date.now()}`;
        const results = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? a : b).increment(key, 60_000, 5, 0, 'default')));
        expect(results.filter((r) => r.isBlocked)).toHaveLength(5);
        expect(Math.max(...results.map((r) => r.totalHits))).toBe(10);
      } finally {
        await a.onApplicationShutdown();
        await b.onApplicationShutdown();
      }
    });

    it('bascule sur des compteurs en mémoire si Redis est injoignable (le trafic n’est pas refusé)', async () => {
      const down = new RedisThrottlerStorage('redis://127.0.0.1:6399');
      try {
        await new Promise((r) => setTimeout(r, 300));
        const r = await down.increment(`k-${Date.now()}`, 60_000, 5, 0, 'default');
        expect(r).toMatchObject({ totalHits: 1, isBlocked: false });
      } finally {
        down.redis.disconnect();
        await down.onApplicationShutdown();
      }
    });
  });
});
