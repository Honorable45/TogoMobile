import { agePriceHistory, brand, client, Ctx, loggedIn, publishedProduct, seller, setupApp } from '../helpers';

const DAY = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

describe('Promotions', () => {
  let ctx: Ctx;
  let brandId: string;

  beforeAll(async () => {
    ctx = await setupApp();
    brandId = (await brand(ctx.prisma)).id;
  });
  afterAll(() => ctx.app.close());

  async function sellerWithProduct(extra: Record<string, unknown> = {}) {
    const s = await seller(ctx);
    const product = await publishedProduct(s.agent, brandId, extra);
    await agePriceHistory(ctx.prisma, product.id);
    return { ...s, product };
  }

  it('crée une promotion valide et calcule la réduction', async () => {
    const { agent, product } = await sellerWithProduct();
    const res = await agent
      .post('/api/v1/seller/promotions')
      .send({ productId: product.id, promoPrice: 85000, endsAt: iso(7 * DAY) })
      .expect(201);
    expect(res.body).toMatchObject({ referencePrice: 100000, promoPrice: 85000, discountPercent: 15, phase: 'RUNNING' });
    const events = await ctx.prisma.promotionEvent.findMany({ where: { promotionId: res.body.id } });
    expect(events.map((e) => e.type)).toEqual(['CREATED']);
  });

  it.each([
    [0, 400],
    [-1, 400],
    [100000, 400],
    [150000, 400],
    [99999.5, 400],
  ])('rejette le prix promotionnel %s', async (promoPrice, status) => {
    const { agent, product } = await sellerWithProduct();
    await agent.post('/api/v1/seller/promotions').send({ productId: product.id, promoPrice, endsAt: iso(7 * DAY) }).expect(status);
  });

  it('rejette des dates incohérentes', async () => {
    const { agent, product } = await sellerWithProduct();
    const res = await agent
      .post('/api/v1/seller/promotions')
      .send({ productId: product.id, promoPrice: 80000, startsAt: iso(5 * DAY), endsAt: iso(2 * DAY) })
      .expect(400);
    expect(res.body.message).toContain('postérieure');
    await agent.post('/api/v1/seller/promotions').send({ productId: product.id, promoPrice: 80000, endsAt: 'demain' }).expect(400);
  });

  it('utilise le plus bas prix des 30 derniers jours comme prix de référence (pas de prix barré gonflé)', async () => {
    const { agent, product } = await sellerWithProduct();
    // Le vendeur augmente son prix juste avant la promotion…
    await agent.patch(`/api/v1/seller/products/${product.id}`).send({ price: 130000 }).expect(200);
    const res = await agent.post('/api/v1/seller/promotions').send({ productId: product.id, promoPrice: 110000, endsAt: iso(5 * DAY) });
    // … la référence reste 100 000 : une « promotion » à 110 000 est refusée.
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('100000');
  });

  it('refuse une promotion sur un produit indisponible et deux promotions qui se chevauchent', async () => {
    const { agent, product } = await sellerWithProduct();
    await agent.post('/api/v1/seller/promotions').send({ productId: product.id, promoPrice: 90000, endsAt: iso(5 * DAY) }).expect(201);
    const overlap = await agent.post('/api/v1/seller/promotions').send({ productId: product.id, promoPrice: 80000, startsAt: iso(2 * DAY), endsAt: iso(9 * DAY) }).expect(400);
    expect(overlap.body.message).toContain('déjà prévue');

    const other = await sellerWithProduct();
    await other.agent.patch(`/api/v1/seller/products/${other.product.id}/stock`).send({ stock: 0 }).expect(200);
    const res = await other.agent.post('/api/v1/seller/promotions').send({ productId: other.product.id, promoPrice: 90000, endsAt: iso(5 * DAY) }).expect(400);
    expect(res.body.message).toContain('indisponible');
  });

  it('n’active la promotion qu’à la date prévue, puis l’arrête automatiquement à expiration', async () => {
    const { agent, product, shop } = await sellerWithProduct();
    const pub = client(ctx.app);
    const created = await agent
      .post('/api/v1/seller/promotions')
      .send({ productId: product.id, promoPrice: 75000, startsAt: iso(2 * DAY), endsAt: iso(6 * DAY) })
      .expect(201);
    expect(created.body.phase).toBe('SCHEDULED');

    const price = async () => (await pub.get(`/api/v1/products/${product.slug}`).expect(200)).body;
    expect((await price()).promotion).toBeNull();
    expect((await price()).currentPrice).toBe(100000);

    // Le temps passe : la date de début est atteinte.
    await ctx.prisma.promotion.update({ where: { id: created.body.id }, data: { startsAt: new Date(Date.now() - 1000) } });
    expect((await price()).currentPrice).toBe(75000);
    const shopPromos = await pub.get(`/api/v1/promotions?shop=${shop.slug}`).expect(200);
    expect(shopPromos.body.items).toHaveLength(1);

    // La date de fin est dépassée : retour automatique au prix habituel, sans tâche planifiée.
    await ctx.prisma.promotion.update({ where: { id: created.body.id }, data: { endsAt: new Date(Date.now() - 1000), startsAt: new Date(Date.now() - 3 * DAY) } });
    expect((await price()).promotion).toBeNull();
    expect((await price()).currentPrice).toBe(100000);
    expect((await pub.get(`/api/v1/promotions?shop=${shop.slug}`).expect(200)).body.items).toHaveLength(0);
  });

  it('permet au vendeur de désactiver une promotion, et garde l’historique', async () => {
    const { agent, product } = await sellerWithProduct();
    const { body } = await agent.post('/api/v1/seller/promotions').send({ productId: product.id, promoPrice: 90000, endsAt: iso(5 * DAY) }).expect(201);
    const res = await agent.post(`/api/v1/seller/promotions/${body.id}/disable`).expect(200);
    expect(res.body.phase).toBe('DISABLED');
    expect((await client(ctx.app).get(`/api/v1/products/${product.slug}`)).body.promotion).toBeNull();
    const history = await agent.get(`/api/v1/seller/promotions/${body.id}/history`).expect(200);
    expect(history.body.map((e: { type: string }) => e.type)).toEqual(['CREATED', 'DISABLED']);
  });

  it('ne permet de modifier qu’une promotion programmée', async () => {
    const { agent, product } = await sellerWithProduct();
    const running = await agent.post('/api/v1/seller/promotions').send({ productId: product.id, promoPrice: 90000, endsAt: iso(2 * DAY) }).expect(201);
    await agent.patch(`/api/v1/seller/promotions/${running.body.id}`).send({ promoPrice: 80000 }).expect(400);
    const future = await agent
      .post('/api/v1/seller/promotions')
      .send({ productId: product.id, promoPrice: 90000, startsAt: iso(3 * DAY), endsAt: iso(6 * DAY) })
      .expect(201);
    const updated = await agent.patch(`/api/v1/seller/promotions/${future.body.id}`).send({ promoPrice: 80000 }).expect(200);
    expect(updated.body).toMatchObject({ promoPrice: 80000, discountPercent: 20 });
  });

  it('désactive automatiquement les promotions lorsque le prix habituel change', async () => {
    const { agent, product } = await sellerWithProduct();
    const { body } = await agent.post('/api/v1/seller/promotions').send({ productId: product.id, promoPrice: 90000, endsAt: iso(5 * DAY) }).expect(201);
    await agent.patch(`/api/v1/seller/products/${product.id}`).send({ price: 95000 }).expect(200);
    const promo = await ctx.prisma.promotion.findUniqueOrThrow({ where: { id: body.id } });
    expect(promo.status).toBe('DISABLED');
  });

  it('suspension administrative : la promotion disparaît partout et le vendeur ne peut pas la réactiver', async () => {
    const { agent, product } = await sellerWithProduct();
    const { body } = await agent.post('/api/v1/seller/promotions').send({ productId: product.id, promoPrice: 85000, endsAt: iso(5 * DAY) }).expect(201);
    const { agent: admin } = await loggedIn(ctx, { role: 'ADMIN' });
    await admin.post(`/api/v1/admin/promotions/${body.id}/suspend`).send({}).expect(400); // motif obligatoire
    await admin.post(`/api/v1/admin/promotions/${body.id}/suspend`).send({ reason: 'Prix de référence trompeur' }).expect(200);
    expect((await client(ctx.app).get(`/api/v1/products/${product.slug}`)).body.promotion).toBeNull();
    await agent.post(`/api/v1/seller/promotions/${body.id}/disable`).expect(400);
    const log = await ctx.prisma.auditLog.findFirst({ where: { action: 'promotion.suspend', targetId: body.id } });
    expect(log).not.toBeNull();
  });

  it('affiche le même prix promotionnel dans le catalogue, la fiche, la boutique, l’accueil, les favoris et WhatsApp', async () => {
    const { agent, product, shop } = await sellerWithProduct({ model: 'Coherence X' });
    await agent.post('/api/v1/seller/promotions').send({ productId: product.id, promoPrice: 82000, endsAt: iso(5 * DAY) }).expect(201);
    const { agent: buyer } = await loggedIn(ctx);
    await buyer.put(`/api/v1/me/favorites/products/${product.id}`).expect(200);

    const pub = client(ctx.app);
    const find = (items: Array<{ id: string; currentPrice: number }>) => items.find((i) => i.id === product.id)!;
    const catalog = find((await pub.get('/api/v1/catalog/products?q=coherence').expect(200)).body.items);
    const shopCatalog = find((await pub.get(`/api/v1/catalog/products?shop=${shop.slug}`).expect(200)).body.items);
    const shopPromos = find((await pub.get(`/api/v1/promotions?shop=${shop.slug}`).expect(200)).body.items);
    const home = find((await pub.get('/api/v1/home').expect(200)).body.promotions);
    const detail = (await pub.get(`/api/v1/products/${product.slug}`).expect(200)).body;
    const fav = find((await buyer.get('/api/v1/me/favorites/products').expect(200)).body.items);
    const wa = (await pub.post(`/api/v1/products/${product.id}/whatsapp`).expect(200)).body;

    for (const view of [catalog, shopCatalog, shopPromos, home, detail, fav]) expect(view.currentPrice).toBe(82000);
    expect(wa.price).toBe(82000);
    expect(wa.message).toContain('82 000 FCFA');
    expect(wa.message).toContain('100 000 FCFA');
  });
});
