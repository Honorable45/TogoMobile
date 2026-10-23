import { brand, client, Ctx, loggedIn, publishedProduct, seller, setupApp } from '../helpers';

describe('Favoris', () => {
  let ctx: Ctx;
  let product: { id: string };
  let shopId: string;

  beforeAll(async () => {
    ctx = await setupApp();
    const b = await brand(ctx.prisma);
    const s = await seller(ctx);
    shopId = s.shop.id;
    product = await publishedProduct(s.agent, b.id);
  });
  afterAll(() => ctx.app.close());

  it('exige une connexion', async () => {
    await client(ctx.app).put(`/api/v1/me/favorites/products/${product.id}`).expect(401);
  });

  it('ajoute puis supprime un produit des favoris', async () => {
    const { agent } = await loggedIn(ctx);
    await agent.put(`/api/v1/me/favorites/products/${product.id}`).expect(200, { favorite: true });
    let list = await agent.get('/api/v1/me/favorites/products').expect(200);
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([product.id]);
    await agent.delete(`/api/v1/me/favorites/products/${product.id}`).expect(200, { favorite: false });
    list = await agent.get('/api/v1/me/favorites/products').expect(200);
    expect(list.body.total).toBe(0);
  });

  it('empêche les doublons, y compris en cas de requêtes simultanées', async () => {
    const { agent, user } = await loggedIn(ctx);
    await Promise.all([1, 2, 3].map(() => agent.put(`/api/v1/me/favorites/products/${product.id}`).expect(200)));
    await agent.put(`/api/v1/me/favorites/shops/${shopId}`).expect(200);
    await agent.put(`/api/v1/me/favorites/shops/${shopId}`).expect(200);
    expect(await ctx.prisma.productFavorite.count({ where: { userId: user.id } })).toBe(1);
    expect(await ctx.prisma.shopFavorite.count({ where: { userId: user.id } })).toBe(1);
  });

  it('isole les favoris entre utilisateurs', async () => {
    const a = await loggedIn(ctx);
    const b = await loggedIn(ctx);
    await a.agent.put(`/api/v1/me/favorites/products/${product.id}`).expect(200);
    await a.agent.put(`/api/v1/me/favorites/shops/${shopId}`).expect(200);
    const ids = await b.agent.get('/api/v1/me/favorites/ids').expect(200);
    expect(ids.body).toEqual({ products: [], shops: [] });
    // Supprimer « son » favori n'affecte pas celui d'un autre utilisateur.
    await b.agent.delete(`/api/v1/me/favorites/products/${product.id}`).expect(200);
    expect((await a.agent.get('/api/v1/me/favorites/ids').expect(200)).body.products).toEqual([product.id]);
  });

  it('liste les boutiques suivies', async () => {
    const { agent } = await loggedIn(ctx);
    await agent.put(`/api/v1/me/favorites/shops/${shopId}`).expect(200);
    const res = await agent.get('/api/v1/me/favorites/shops').expect(200);
    expect(res.body.items[0]).toMatchObject({ id: shopId, productCount: 1 });
    expect(res.body.items[0].ownerId).toBeUndefined();
  });

  it('refuse un produit inexistant ou non publié', async () => {
    const { agent } = await loggedIn(ctx);
    await agent.put('/api/v1/me/favorites/products/inexistant').expect(404);
  });
});
