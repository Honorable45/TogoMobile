import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveFfmpeg } from '../../src/media/media-processing';
import { brand, client, Ctx, png, productBody, publishedProduct, seller, setupApp } from '../helpers';

describe('Produits et médias', () => {
  let ctx: Ctx;
  let brandId: string;

  beforeAll(async () => {
    ctx = await setupApp();
    brandId = (await brand(ctx.prisma)).id;
  });
  afterAll(() => ctx.app.close());

  it('crée un produit valide en brouillon, avec référence publique et historique de prix', async () => {
    const { agent } = await seller(ctx);
    const res = await agent.post('/api/v1/seller/products').send(productBody(brandId, { model: 'Pixel 9' })).expect(201);
    expect(res.body).toMatchObject({ status: 'DRAFT', price: 100000, availability: 'AVAILABLE', title: expect.stringContaining('Pixel 9 128 Go') });
    expect(res.body.reference).toMatch(/^TM-[2-9A-Z]{6}$/);
    expect(await ctx.prisma.priceHistory.count({ where: { productId: res.body.id } })).toBe(1);
  });

  it.each([
    [{ price: 0 }, 'price'],
    [{ price: -100 }, 'price'],
    [{ price: 12.5 }, 'price'],
    [{ price: 'abc' }, 'price'],
  ])('rejette un prix invalide %o', async (patch, field) => {
    const { agent } = await seller(ctx);
    const res = await agent.post('/api/v1/seller/products').send(productBody(brandId, patch)).expect(400);
    expect(res.body.errors[field]).toBeDefined();
  });

  it('rejette un état non autorisé', async () => {
    const { agent } = await seller(ctx);
    const res = await agent.post('/api/v1/seller/products').send(productBody(brandId, { condition: 'BROKEN' })).expect(400);
    expect(res.body.errors.condition).toBe('État du téléphone non autorisé.');
  });

  it('accepte trois photos et rejette la quatrième', async () => {
    const { agent } = await seller(ctx);
    const { body } = await agent.post('/api/v1/seller/products').send(productBody(brandId)).expect(201);
    for (let i = 0; i < 3; i++) {
      await agent.post(`/api/v1/seller/products/${body.id}/media`).attach('file', await png(), `p${i}.png`).expect(201);
    }
    const res = await agent.post(`/api/v1/seller/products/${body.id}/media`).attach('file', await png(), 'p4.png').expect(400);
    expect(res.body.message).toContain('3 photos au maximum');
    const media = await ctx.prisma.productMedia.findMany({ where: { productId: body.id } });
    expect(media).toHaveLength(3);
    expect(media.filter((m) => m.isPrimary)).toHaveLength(1);
  });

  it('applique la limite de photos même en cas d’envois simultanés', async () => {
    const { agent } = await seller(ctx);
    const { body } = await agent.post('/api/v1/seller/products').send(productBody(brandId)).expect(201);
    const img = await png();
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => agent.post(`/api/v1/seller/products/${body.id}/media`).attach('file', img, `c${i}.png`)),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(await ctx.prisma.productMedia.count({ where: { productId: body.id } })).toBe(3);
  });

  it('accepte une vidéo et rejette la deuxième', async () => {
    const { agent } = await seller(ctx);
    const { body } = await agent.post('/api/v1/seller/products').send(productBody(brandId)).expect(201);
    // Vraie vidéo si ffmpeg est disponible (elle sera alors réellement traitée), sinon signature MP4 seule.
    const ffmpeg = resolveFfmpeg();
    let mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(2048)]);
    if (ffmpeg) {
      const file = join(mkdtempSync(join(tmpdir(), 'tm-v-')), 'v.mp4');
      execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=5:duration=1', '-pix_fmt', 'yuv420p', file]);
      mp4 = readFileSync(file);
    }
    const ok = await agent.post(`/api/v1/seller/products/${body.id}/media`).attach('file', mp4, 'v.mp4').expect(201);
    expect(ok.body.media.find((m: { type: string }) => m.type === 'VIDEO')).toMatchObject({ status: 'READY' });
    const res = await agent.post(`/api/v1/seller/products/${body.id}/media`).attach('file', mp4, 'v2.mp4').expect(400);
    expect(res.body.message).toContain('une seule vidéo');
  });

  it('rejette un fichier dont le contenu réel n’est pas une image, quelle que soit son extension', async () => {
    const { agent } = await seller(ctx);
    const { body } = await agent.post('/api/v1/seller/products').send(productBody(brandId)).expect(201);
    const fake = Buffer.from('<?php system($_GET["c"]); ?>'.padEnd(200, ' '));
    await agent.post(`/api/v1/seller/products/${body.id}/media`).attach('file', fake, { filename: 'photo.jpg', contentType: 'image/jpeg' }).expect(400);
    expect(await ctx.prisma.productMedia.count({ where: { productId: body.id } })).toBe(0);
  });

  it('refuse la publication sans photo, puis publie avec une photo', async () => {
    const { agent } = await seller(ctx);
    const { body } = await agent.post('/api/v1/seller/products').send(productBody(brandId)).expect(201);
    const res = await agent.post(`/api/v1/seller/products/${body.id}/publish`).expect(400);
    expect(res.body.message).toContain('au moins une photo');
    await agent.post(`/api/v1/seller/products/${body.id}/media`).attach('file', await png(), 'p.png').expect(201);
    await agent.post(`/api/v1/seller/products/${body.id}/publish`).expect(200);
    await client(ctx.app).get(`/api/v1/products/${body.slug}`).expect(200);
  });

  it('refuse l’accès et la modification des produits d’un autre vendeur', async () => {
    const owner = await seller(ctx);
    const other = await seller(ctx);
    const product = await publishedProduct(owner.agent, brandId);
    await other.agent.get(`/api/v1/seller/products/${product.id}`).expect(404);
    await other.agent.patch(`/api/v1/seller/products/${product.id}`).send({ price: 1000 }).expect(404);
    await other.agent.post(`/api/v1/seller/products/${product.id}/unpublish`).expect(404);
    await other.agent.post(`/api/v1/seller/products/${product.id}/media`).attach('file', await png(), 'x.png').expect(404);
    const list = await other.agent.get('/api/v1/seller/products').expect(200);
    expect(list.body.items).toHaveLength(0);
    expect((await ctx.prisma.product.findUniqueOrThrow({ where: { id: product.id } })).price).toBe(100000);
  });

  it('ne permet pas de réordonner avec un média appartenant à un autre produit', async () => {
    const { agent } = await seller(ctx);
    const a = await publishedProduct(agent, brandId);
    const b = await publishedProduct(agent, brandId);
    const mediaB = await ctx.prisma.productMedia.findFirstOrThrow({ where: { productId: b.id } });
    await agent.put(`/api/v1/seller/products/${a.id}/media/order`).send({ order: [mediaB.id], primaryId: mediaB.id }).expect(400);
  });

  it('met à jour le stock et synchronise la disponibilité', async () => {
    const { agent } = await seller(ctx);
    const p = await publishedProduct(agent, brandId);
    const out = await agent.patch(`/api/v1/seller/products/${p.id}/stock`).send({ stock: 0 }).expect(200);
    expect(out.body).toMatchObject({ stock: 0, availability: 'OUT_OF_STOCK' });
    const back = await agent.patch(`/api/v1/seller/products/${p.id}/stock`).send({ stock: 4 }).expect(200);
    expect(back.body).toMatchObject({ stock: 4, availability: 'AVAILABLE' });
    await agent.patch(`/api/v1/seller/products/${p.id}/stock`).send({ stock: 0, availability: 'AVAILABLE' }).expect(400);
  });

  it('retire une annonce : elle disparaît du catalogue public', async () => {
    const { agent, shop } = await seller(ctx);
    const p = await publishedProduct(agent, brandId);
    const pub = client(ctx.app);
    let list = await pub.get(`/api/v1/catalog/products?shop=${shop.slug}`).expect(200);
    expect(list.body.items.map((i: { id: string }) => i.id)).toContain(p.id);
    await agent.post(`/api/v1/seller/products/${p.id}/unpublish`).expect(200);
    list = await pub.get(`/api/v1/catalog/products?shop=${shop.slug}`).expect(200);
    expect(list.body.items).toHaveLength(0);
    await pub.get(`/api/v1/products/${p.slug}`).expect(404);
  });

  it('distingue visibilité et disponibilité : un produit « retiré de la vente » reste consultable mais non commandable', async () => {
    const { agent, shop } = await seller(ctx);
    const p = await publishedProduct(agent, brandId);
    await agent.patch(`/api/v1/seller/products/${p.id}`).send({ availability: 'WITHDRAWN' }).expect(200);
    const pub = client(ctx.app);
    const detail = await pub.get(`/api/v1/products/${p.slug}`).expect(200);
    expect(detail.body).toMatchObject({ availability: 'WITHDRAWN', orderable: false });
    const list = await pub.get(`/api/v1/catalog/products?shop=${shop.slug}`).expect(200);
    expect(list.body.items).toHaveLength(0);
    await pub.post(`/api/v1/products/${p.id}/whatsapp`).expect(410);
  });

  it('une boutique en attente peut préparer des brouillons mais pas publier', async () => {
    const { agent } = await seller(ctx, 'PENDING');
    const { body } = await agent.post('/api/v1/seller/products').send(productBody(brandId)).expect(201);
    await agent.post(`/api/v1/seller/products/${body.id}/media`).attach('file', await png(), 'p.png').expect(201);
    const res = await agent.post(`/api/v1/seller/products/${body.id}/publish`).expect(403);
    expect(res.body.message).toContain('en attente de validation');
  });

  it('une boutique suspendue ne peut plus rien modifier, et ses produits disparaissent', async () => {
    const { agent, shop } = await seller(ctx);
    const p = await publishedProduct(agent, brandId);
    await ctx.prisma.shop.update({ where: { id: shop.id }, data: { status: 'SUSPENDED' } });
    await agent.patch(`/api/v1/seller/products/${p.id}`).send({ price: 90000 }).expect(403);
    await agent.post('/api/v1/seller/products').send(productBody(brandId)).expect(403);
    await client(ctx.app).get(`/api/v1/products/${p.slug}`).expect(404);
  });
});
