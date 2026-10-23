import { brand, client, Ctx, loggedIn, nextPhone, publishedProduct, seller, setupApp } from '../helpers';

describe('Ventes déclarées, QR codes et avis vérifiés', () => {
  let ctx: Ctx;
  let brandId: string;

  beforeAll(async () => {
    ctx = await setupApp();
    brandId = (await brand(ctx.prisma)).id;
  });
  afterAll(() => ctx.app.close());

  async function saleWithToken(opts: { ref?: string } = {}) {
    const s = await seller(ctx);
    const product = await publishedProduct(s.agent, brandId);
    const buyerPhone = nextPhone();
    const res = await s.agent
      .post('/api/v1/seller/sales')
      .send({ productId: product.id, soldAt: new Date().toISOString(), internalRef: opts.ref ?? 'FAC-001', buyerPhone })
      .expect(201);
    const token = (res.body.qr.url as string).split('#')[1];
    return { ...s, product, buyerPhone, token, sale: res.body.sale, qr: res.body.qr };
  }

  const submit = (agent: ReturnType<typeof client>, token: string, buyerPhone: string, extra: Record<string, unknown> = {}) =>
    agent.post('/api/v1/review-tokens/submit').send({ token, buyerPhone, rating: 5, comment: 'Très bon téléphone, conforme.', ...extra });

  describe('QR code', () => {
    it('génère un jeton opaque, non séquentiel, sans donnée personnelle, et ne stocke que son empreinte', async () => {
      const { qr, token, sale, buyerPhone } = await saleWithToken();
      expect(qr.url).toMatch(/^http:\/\/web\.test\/avis#[A-Za-z0-9_-]{43}$/);
      expect(qr.svg).toContain('<svg');
      expect(qr.url).not.toContain(sale.id);
      expect(qr.url).not.toContain(buyerPhone.slice(4));
      const stored = await ctx.prisma.reviewToken.findFirstOrThrow({ where: { saleId: sale.id } });
      expect(stored.tokenHash).not.toBe(token);
      expect(stored.tokenHash).toHaveLength(64);
      const saleRow = await ctx.prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
      expect(saleRow.buyerPhoneHash).not.toContain(buyerPhone.slice(4));
      expect(saleRow.status).toBe('DECLARED');
    });

    it('valide un jeton valide et présente le produit sans donnée privée', async () => {
      const { token, product } = await saleWithToken();
      const res = await client(ctx.app).post('/api/v1/review-tokens/check').send({ token }).expect(200);
      expect(res.body).toMatchObject({ state: 'VALID', product: { slug: product.slug } });
      const json = JSON.stringify(res.body);
      expect(json).not.toMatch(/buyer|Phone|internalRef|FAC-001|email/);
    });

    it('signale un jeton inconnu sans rien divulguer', async () => {
      const res = await client(ctx.app).post('/api/v1/review-tokens/check').send({ token: 'x'.repeat(43) }).expect(200);
      expect(res.body).toEqual({ state: 'INVALID', message: expect.any(String) });
    });

    it('signale un jeton expiré et refuse l’avis', async () => {
      const { token, sale, buyerPhone } = await saleWithToken();
      await ctx.prisma.reviewToken.updateMany({ where: { saleId: sale.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await client(ctx.app).post('/api/v1/review-tokens/check').send({ token })).body.state).toBe('EXPIRED');
      const { agent } = await loggedIn(ctx);
      const res = await submit(agent, token, buyerPhone).expect(410);
      expect(res.body.code).toBe('TOKEN_EXPIRED');
    });

    it('révoque l’ancien jeton quand le vendeur régénère le QR code', async () => {
      const s = await saleWithToken();
      const regen = await s.agent.post(`/api/v1/seller/sales/${s.sale.id}/qr`).expect(200);
      const newToken = (regen.body.url as string).split('#')[1];
      const pub = client(ctx.app);
      expect((await pub.post('/api/v1/review-tokens/check').send({ token: s.token })).body.state).toBe('REVOKED');
      expect((await pub.post('/api/v1/review-tokens/check').send({ token: newToken })).body.state).toBe('VALID');
      const { agent } = await loggedIn(ctx);
      expect((await submit(agent, s.token, s.buyerPhone).expect(410)).body.code).toBe('TOKEN_REVOKED');
    });

    it('refuse un jeton d’une vente annulée', async () => {
      const s = await saleWithToken();
      await s.agent.post(`/api/v1/seller/sales/${s.sale.id}/cancel`).expect(200);
      const { agent } = await loggedIn(ctx);
      await submit(agent, s.token, s.buyerPhone).expect(410);
    });

    it('verrouille le jeton après des tentatives répétées avec un mauvais numéro', async () => {
      const s = await saleWithToken();
      const { agent } = await loggedIn(ctx);
      for (let i = 0; i < 4; i++) {
        const r = await submit(agent, s.token, '+22899999999').expect(400);
        expect(r.body.code).toBe('PHONE_MISMATCH');
      }
      const locked = await submit(agent, s.token, '+22899999999').expect(429);
      expect(locked.body.code).toBe('TOKEN_LOCKED');
      // Même le bon numéro ne fonctionne plus : le code est désactivé.
      await submit(agent, s.token, s.buyerPhone).expect(410);
    });

    it('limite la fréquence des vérifications depuis une même origine', async () => {
      const pub = client(ctx.app);
      const statuses: number[] = [];
      for (let i = 0; i < 22; i++) statuses.push((await pub.post('/api/v1/review-tokens/check').send({ token: 'y'.repeat(43) })).status);
      expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    });
  });

  describe('Dépôt d’avis', () => {
    it('refuse un avis sans connexion', async () => {
      const s = await saleWithToken();
      await submit(client(ctx.app), s.token, s.buyerPhone).expect(401);
    });

    it('refuse un avis sans jeton valide (aucune éligibilité)', async () => {
      const { agent } = await loggedIn(ctx);
      await submit(agent, 'z'.repeat(43), '+22890000000').expect(410);
      await agent.post('/api/v1/review-tokens/submit').send({ rating: 5 }).expect(400);
    });

    it('publie un avis admissible avec « Achat vérifié » et met à jour les notes', async () => {
      const s = await saleWithToken();
      const { agent, user } = await loggedIn(ctx, { name: 'Ama Kodjo' });
      const res = await submit(agent, s.token, s.buyerPhone, { rating: 4 }).expect(201);
      expect(res.body).toMatchObject({ status: 'PUBLISHED', verification: 'VERIFIED_PURCHASE' });

      const sale = await ctx.prisma.sale.findUniqueOrThrow({ where: { id: s.sale.id } });
      expect(sale).toMatchObject({ status: 'VERIFIED', buyerId: user.id });
      expect((await ctx.prisma.reviewToken.findFirstOrThrow({ where: { saleId: s.sale.id } })).status).toBe('USED');

      const pub = client(ctx.app);
      const product = (await pub.get(`/api/v1/products/${s.product.slug}`).expect(200)).body;
      expect(product).toMatchObject({ ratingAvg: 4, ratingCount: 1 });
      expect(product.shop).toMatchObject({ ratingAvg: 4, ratingCount: 1 });
      const reviews = (await pub.get(`/api/v1/products/${s.product.slug}/reviews`).expect(200)).body;
      expect(reviews.summary).toMatchObject({ average: 4, count: 1 });
      expect(reviews.items[0]).toMatchObject({ authorName: 'Ama K.', verifiedPurchase: true, rating: 4 });
      expect(JSON.stringify(reviews)).not.toContain(user.email!);
    });

    it('met à jour correctement la moyenne avec plusieurs avis', async () => {
      const s = await seller(ctx);
      const product = await publishedProduct(s.agent, brandId);
      for (const [i, rating] of [5, 3, 4].entries()) {
        const phone = nextPhone();
        const sale = await s.agent
          .post('/api/v1/seller/sales')
          .send({ productId: product.id, soldAt: new Date().toISOString(), internalRef: `MULTI-${i}`, buyerPhone: phone })
          .expect(201);
        const { agent } = await loggedIn(ctx);
        await submit(agent, sale.body.qr.url.split('#')[1], phone, { rating, comment: `Avis numéro ${i} sur ce produit, très bien.` }).expect(201);
      }
      const p = await ctx.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(p).toMatchObject({ ratingAvg: 4, ratingCount: 3 });
    });

    it('refuse un deuxième avis pour la même vente', async () => {
      const s = await saleWithToken();
      const { agent } = await loggedIn(ctx);
      await submit(agent, s.token, s.buyerPhone).expect(201);
      const again = await submit(agent, s.token, s.buyerPhone).expect(410);
      expect(again.body.code).toBe('TOKEN_USED');
      const other = await loggedIn(ctx);
      await submit(other.agent, s.token, s.buyerPhone).expect(410);
      expect(await ctx.prisma.review.count({ where: { saleId: s.sale.id } })).toBe(1);
    });

    it('n’accepte qu’un seul avis lors de soumissions concurrentes', async () => {
      const s = await saleWithToken();
      const users = await Promise.all([loggedIn(ctx), loggedIn(ctx), loggedIn(ctx), loggedIn(ctx)]);
      const results = await Promise.all(users.map((u) => submit(u.agent, s.token, s.buyerPhone)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status !== 201).every((r) => r.status === 410 || r.status === 409)).toBe(true);
      expect(await ctx.prisma.review.count({ where: { saleId: s.sale.id } })).toBe(1);
    });

    it('interdit au vendeur de déposer un avis sur sa propre boutique', async () => {
      const s = await saleWithToken();
      await submit(s.agent, s.token, s.buyerPhone).expect(403);
    });

    it('place en examen une vente suspecte : l’avis n’est pas publié ni compté', async () => {
      const s = await seller(ctx);
      const product = await publishedProduct(s.agent, brandId);
      const phone = nextPhone();
      // Même numéro d'acheteur réutilisé sur plusieurs ventes : comportement anormal.
      const tokens: string[] = [];
      for (let i = 0; i < 3; i++) {
        const sale = await s.agent
          .post('/api/v1/seller/sales')
          .send({ productId: product.id, soldAt: new Date().toISOString(), internalRef: `SUSP-${i}`, buyerPhone: phone })
          .expect(201);
        tokens.push(sale.body.qr.url.split('#')[1]);
      }
      const { agent } = await loggedIn(ctx);
      const res = await submit(agent, tokens[2], phone).expect(201);
      expect(res.body).toMatchObject({ status: 'PENDING', verification: 'PENDING' });
      const sale = await ctx.prisma.sale.findFirstOrThrow({ where: { internalRef: 'SUSP-2', shopId: s.shop.id } });
      expect(sale.status).toBe('PENDING_VERIFICATION');
      expect((await ctx.prisma.product.findUniqueOrThrow({ where: { id: product.id } })).ratingCount).toBe(0);
      const pub = (await client(ctx.app).get(`/api/v1/products/${product.slug}/reviews`).expect(200)).body;
      expect(pub.items).toHaveLength(0);
    });

    it('gère une vente contestée : l’avis perd la mention et sort des notes, puis la retrouve après vérification', async () => {
      const s = await saleWithToken();
      const { agent } = await loggedIn(ctx);
      await submit(agent, s.token, s.buyerPhone, { rating: 2, comment: 'Batterie moins bonne que prévu.' }).expect(201);
      const { agent: admin } = await loggedIn(ctx, { role: 'ADMIN' });

      await admin.post(`/api/v1/admin/sales/${s.sale.id}/decision`).send({ action: 'dispute', note: 'Le client conteste la vente' }).expect(200);
      let review = await ctx.prisma.review.findUniqueOrThrow({ where: { saleId: s.sale.id } });
      expect(review).toMatchObject({ verification: 'REVOKED', status: 'PENDING' });
      expect((await ctx.prisma.product.findUniqueOrThrow({ where: { id: s.product.id } })).ratingCount).toBe(0);

      await admin.post(`/api/v1/admin/sales/${s.sale.id}/decision`).send({ action: 'verify', note: 'Reçu vérifié' }).expect(200);
      review = await ctx.prisma.review.findUniqueOrThrow({ where: { saleId: s.sale.id } });
      expect(review).toMatchObject({ verification: 'VERIFIED_PURCHASE', status: 'PUBLISHED' });
      expect((await ctx.prisma.product.findUniqueOrThrow({ where: { id: s.product.id } })).ratingAvg).toBe(2);
    });

    it('empêche le vendeur d’annuler une vente après le dépôt d’un avis', async () => {
      const s = await saleWithToken();
      const { agent } = await loggedIn(ctx);
      await submit(agent, s.token, s.buyerPhone, { rating: 1, comment: 'Téléphone en panne après deux jours.' }).expect(201);
      await s.agent.post(`/api/v1/seller/sales/${s.sale.id}/cancel`).expect(400);
      expect((await ctx.prisma.review.findUniqueOrThrow({ where: { saleId: s.sale.id } })).status).toBe('PUBLISHED');
    });

    it('ne donne au vendeur aucun moyen de modifier ou supprimer un avis', async () => {
      const s = await saleWithToken();
      const { agent } = await loggedIn(ctx);
      const r = await submit(agent, s.token, s.buyerPhone).expect(201);
      await s.agent.patch(`/api/v1/seller/reviews/${r.body.id}`).send({ rating: 5 }).expect(404);
      await s.agent.delete(`/api/v1/seller/reviews/${r.body.id}`).expect(404);
      await s.agent.post(`/api/v1/admin/reviews/${r.body.id}/moderate`).send({ action: 'hide', note: 'je veux' }).expect(403);
      const list = await s.agent.get('/api/v1/seller/reviews').expect(200);
      expect(list.body.items[0].id).toBe(r.body.id);
    });

    it('met en modération un commentaire contenant un numéro de téléphone', async () => {
      const s = await saleWithToken();
      const { agent } = await loggedIn(ctx);
      const res = await submit(agent, s.token, s.buyerPhone, { comment: 'Super ! Appelez-moi au +228 90 11 22 33' }).expect(201);
      expect(res.body).toMatchObject({ status: 'PENDING', verification: 'VERIFIED_PURCHASE' });
    });
  });

  describe('Déclaration des ventes', () => {
    it('refuse une référence en double, une date future et le numéro de la boutique', async () => {
      const s = await saleWithToken({ ref: 'DUP-1' });
      await s.agent
        .post('/api/v1/seller/sales')
        .send({ productId: s.product.id, soldAt: new Date().toISOString(), internalRef: 'DUP-1', buyerPhone: nextPhone() })
        .expect(409);
      await s.agent
        .post('/api/v1/seller/sales')
        .send({ productId: s.product.id, soldAt: new Date(Date.now() + 86_400_000).toISOString(), internalRef: 'F-1', buyerPhone: nextPhone() })
        .expect(400);
      await s.agent
        .post('/api/v1/seller/sales')
        .send({ productId: s.product.id, soldAt: new Date().toISOString(), internalRef: 'F-2', buyerPhone: s.shop.whatsapp })
        .expect(400);
    });

    it('limite le nombre de ventes déclarées par jour', async () => {
      const s = await seller(ctx);
      // Boutique validée récemment : plafond réduit (5 par 24 h par défaut).
      await ctx.prisma.shop.update({ where: { id: s.shop.id }, data: { validatedAt: new Date() } });
      const product = await publishedProduct(s.agent, brandId);
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const r = await s.agent
          .post('/api/v1/seller/sales')
          .send({ productId: product.id, soldAt: new Date().toISOString(), internalRef: `LIM-${i}`, buyerPhone: nextPhone() });
        statuses.push(r.status);
      }
      expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
      expect(statuses[5]).toBe(429);
    });

    it('distingue ventes déclarées et vérifiées dans le tableau de bord', async () => {
      const s = await saleWithToken();
      await s.agent
        .post('/api/v1/seller/sales')
        .send({ productId: s.product.id, soldAt: new Date().toISOString(), internalRef: 'DASH-2', buyerPhone: nextPhone() })
        .expect(201);
      const { agent } = await loggedIn(ctx);
      await submit(agent, s.token, s.buyerPhone).expect(201);
      const dash = await s.agent.get('/api/v1/seller/dashboard').expect(200);
      expect(dash.body.sales).toMatchObject({ declared: 2, verified: 1 });
    });
  });
});
