import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { isSafeAdLink } from '../../src/ads/ads.controller';
import { MediaService } from '../../src/media/media.service';
import { LocalStorageService, StorageService } from '../../src/storage/storage.service';
import { client, Ctx, loggedIn, png, seller, setupApp } from '../helpers';

const hero = (width = 2400, height = 1350) => sharp({ create: { width, height, channels: 3, background: '#1b3a6b' } }).jpeg().toBuffer();

describe('Liens des publicités', () => {
  it.each([
    ['https://www.samsung.com/tg/', true],
    ['/catalogue?brand=samsung', true],
    ['/promotions', true],
    ['javascript:alert(1)', false],
    ['data:text/html,<b>x</b>', false],
    ['http://exemple.tg', false],
    ['//site-malveillant.example', false],
    ['/\\site-malveillant.example', false],
    ['https://user:pass@exemple.tg', false],
    ['https://exemple.tg/a b', false],
  ])('%s → %s', (link, ok) => expect(isSafeAdLink(link)).toBe(ok));
});

describe('Publicités de l’accueil', () => {
  let ctx: Ctx;
  let admin: ReturnType<typeof client>;
  let revalidateServer: Server;
  const revalidated: string[][] = [];

  beforeAll(async () => {
    // Site simulé : reçoit les invalidations de cache envoyées par l'API.
    revalidateServer = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        revalidated.push(JSON.parse(body).tags);
        res.end('{}');
      });
    });
    await new Promise<void>((r) => revalidateServer.listen(4999, '127.0.0.1', r));
    ctx = await setupApp();
    admin = (await loggedIn(ctx, { role: 'ADMIN' })).agent;
  });
  afterAll(async () => {
    await ctx.app.close();
    revalidateServer.closeAllConnections();
    await new Promise((r) => revalidateServer.close(r));
  });

  const create = (fields: Record<string, string>, image?: Buffer) => {
    const req = admin.post('/api/v1/admin/ads');
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    if (image) req.attach('file', image, 'pub.jpg');
    return req;
  };
  const home = async () => (await client(ctx.app).get('/api/v1/home').expect(200)).body.heroAds as Array<Record<string, unknown>>;

  it('l’administration crée une publicité : deux versions WebP, affichée sur l’accueil, cache invalidé', async () => {
    revalidated.length = 0;
    const res = await create({ title: 'Galaxy S25 disponible', subtitle: 'Chez les boutiques partenaires', advertiser: 'Samsung Togo', linkUrl: '/catalogue?brand=samsung' }, await hero()).expect(201);
    expect(res.body).toMatchObject({ title: 'Galaxy S25 disponible', width: 1920, height: 1080, isActive: true });

    const root = (ctx.app.get(StorageService) as LocalStorageService).root;
    const desktop = await sharp(join(root, res.body.imageKey)).metadata();
    const mobile = await sharp(join(root, res.body.mobileImageKey)).metadata();
    expect([desktop.format, desktop.width]).toEqual(['webp', 1920]);
    expect([mobile.format, mobile.width]).toEqual(['webp', 960]);

    const ads = await home();
    const ad = ads.find((a) => a.id === res.body.id)!;
    expect(ad).toMatchObject({ title: 'Galaxy S25 disponible', advertiser: 'Samsung Togo', linkUrl: '/catalogue?brand=samsung' });
    expect(ad.imageUrl).toMatch(/\/media\/ads\/[a-z0-9]+\.webp$/);
    expect(ad.mobileImageUrl).toMatch(/-m\.webp$/);
    // Aucune donnée interne exposée publiquement.
    expect(Object.keys(ad).sort()).toEqual(['advertiser', 'height', 'id', 'imageUrl', 'linkUrl', 'mobileImageUrl', 'subtitle', 'title', 'width']);
    expect(revalidated.flat()).toContain('home');

    const audit = await ctx.prisma.auditLog.findFirst({ where: { action: 'ad.create', targetId: res.body.id } });
    expect(audit).not.toBeNull();
  });

  it('n’affiche que les publicités actives, commencées et non terminées, dans l’ordre choisi', async () => {
    const now = Date.now();
    const img = await hero();
    const second = (await create({ title: 'Deuxième', sortOrder: '2' }, img).expect(201)).body;
    const first = (await create({ title: 'Première', sortOrder: '1' }, img).expect(201)).body;
    const future = (await create({ title: 'Programmée', startsAt: new Date(now + 86_400_000).toISOString() }, img).expect(201)).body;
    const ended = (await create({ title: 'Terminée', endsAt: new Date(now - 60_000).toISOString() }, img).expect(201)).body;
    const off = (await create({ title: 'Désactivée', isActive: 'false' }, img).expect(201)).body;

    const ids = (await home()).map((a) => a.id);
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));
    for (const hidden of [future, ended, off]) expect(ids).not.toContain(hidden.id);

    const list = (await admin.get('/api/v1/admin/ads').expect(200)).body as Array<{ id: string; status: string }>;
    const status = (id: string) => list.find((a) => a.id === id)?.status;
    expect([status(first.id), status(future.id), status(ended.id), status(off.id)]).toEqual(['ACTIVE', 'SCHEDULED', 'ENDED', 'DISABLED']);

    // Activation, puis programmation dans le passé : la publicité apparaît.
    await admin.patch(`/api/v1/admin/ads/${off.id}`).send({ isActive: true }).expect(200);
    await admin.patch(`/api/v1/admin/ads/${future.id}`).send({ startsAt: new Date(now - 1000).toISOString() }).expect(200);
    const after = (await home()).map((a) => a.id);
    expect(after).toEqual(expect.arrayContaining([off.id, future.id]));
  });

  it('refuse les données invalides : image absente ou trop petite, lien dangereux, dates incohérentes, titre manquant', async () => {
    await create({ title: 'Sans image' }).expect(400);
    const small = await create({ title: 'Petite' }, await hero(800, 450)).expect(400);
    expect(small.body.message).toMatch(/1200 px/);
    await create({ title: 'Faux fichier' }, Buffer.from('<html>pas une image</html>')).expect(400);
    await create({ title: 'Lien', linkUrl: 'javascript:alert(1)' }, await hero()).expect(400);
    await create({ title: 'Dates', startsAt: '2026-12-10T00:00:00Z', endsAt: '2026-12-01T00:00:00Z' }, await hero()).expect(400);
    await create({ subtitle: 'Pas de titre' }, await hero()).expect(400);
    const ad = (await create({ title: 'Valide' }, await hero()).expect(201)).body;
    await admin.patch(`/api/v1/admin/ads/${ad.id}`).send({ linkUrl: 'http://non-securise.tg' }).expect(400);
    await admin.patch(`/api/v1/admin/ads/${ad.id}`).send({ endsAt: '2000-01-01T00:00:00Z', startsAt: '2001-01-01T00:00:00Z' }).expect(400);
    // Un lien peut être retiré.
    expect((await admin.patch(`/api/v1/admin/ads/${ad.id}`).send({ linkUrl: '' }).expect(200)).body.linkUrl).toBeNull();
  });

  it('réservé aux administrateurs', async () => {
    const { agent } = await seller(ctx);
    await agent.get('/api/v1/admin/ads').expect(403);
    // Refusé avant toute lecture du fichier (pas de pièce jointe : le serveur couperait l'envoi en cours).
    await agent.post('/api/v1/admin/ads').field('title', 'Pirate').expect(403);
    await client(ctx.app).get('/api/v1/admin/ads').expect(401);
    expect(await ctx.prisma.heroAd.count({ where: { title: 'Pirate' } })).toBe(0);
  });

  it('remplacer l’image ou supprimer la publicité envoie les anciens fichiers au nettoyage', async () => {
    const root = (ctx.app.get(StorageService) as LocalStorageService).root;
    const ad = (await create({ title: 'À remplacer' }, await hero()).expect(201)).body;
    const replaced = (await admin.post(`/api/v1/admin/ads/${ad.id}/image`).attach('file', await hero(1600, 900), 'n.jpg').expect(200)).body;
    expect(replaced.imageKey).not.toBe(ad.imageKey);
    expect(replaced.width).toBe(1600);

    await admin.delete(`/api/v1/admin/ads/${ad.id}`).expect(200);
    expect(await ctx.prisma.heroAd.findUnique({ where: { id: ad.id } })).toBeNull();
    await ctx.app.get(MediaService).cleanup();
    for (const key of [ad.imageKey, ad.mobileImageKey, replaced.imageKey, replaced.mobileImageKey]) expect(existsSync(join(root, key))).toBe(false);
    await admin.delete(`/api/v1/admin/ads/${ad.id}`).expect(404);
  });

  it('une image PNG de taille suffisante est acceptée', async () => {
    await create({ title: 'PNG' }, await png(1400, 800)).expect(201);
  });
});
