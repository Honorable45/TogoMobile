import { MailService } from '../../src/auth/mail.service';
import { brand, client, Ctx, loggedIn, PASSWORD, png, publishedProduct, seller, setupApp } from '../helpers';

describe('Sécurité, authentification et boutiques', () => {
  let ctx: Ctx;
  let brandId: string;

  beforeAll(async () => {
    ctx = await setupApp();
    brandId = (await brand(ctx.prisma)).id;
  });
  afterAll(() => ctx.app.close());

  describe('Administration', () => {
    const routes = ['/api/v1/admin/stats', '/api/v1/admin/shops', '/api/v1/admin/users', '/api/v1/admin/reviews', '/api/v1/admin/sales', '/api/v1/admin/audit-logs'];

    it('refuse l’accès aux visiteurs (401) et aux clients/vendeurs (403)', async () => {
      const anon = client(ctx.app);
      const { agent: customer } = await loggedIn(ctx);
      const { agent: sellerAgent } = await seller(ctx);
      for (const r of routes) {
        await anon.get(r).expect(401);
        await customer.get(r).expect(403);
        await sellerAgent.get(r).expect(403);
      }
      await customer.post('/api/v1/admin/brands').send({ name: 'Pirate' }).expect(403);
    });

    it('autorise un administrateur', async () => {
      const { agent } = await loggedIn(ctx, { role: 'ADMIN' });
      for (const r of routes) await agent.get(r).expect(200);
    });
  });

  describe('Rôles', () => {
    it('ignore toute tentative de choisir son rôle à l’inscription', async () => {
      const agent = client(ctx.app);
      const res = await agent
        .post('/api/v1/auth/register')
        .send({ name: 'Pirate', email: 'pirate@test.tg', password: PASSWORD, role: 'ADMIN' })
        .expect(400);
      expect(res.body.errors.role).toBe('Champ non autorisé.');
      const ok = await agent.post('/api/v1/auth/register').send({ name: 'Honnête', email: 'honnete@test.tg', password: PASSWORD }).expect(201);
      expect(ok.body.role).toBe('CUSTOMER');
    });

    it('refuse la modification du rôle via le profil', async () => {
      const { agent, user } = await loggedIn(ctx);
      await agent.patch('/api/v1/auth/me').send({ role: 'ADMIN' }).expect(400);
      expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('CUSTOMER');
    });

    it('un administrateur ne peut pas suspendre un autre administrateur ni lui-même', async () => {
      const a = await loggedIn(ctx, { role: 'ADMIN' });
      const b = await loggedIn(ctx, { role: 'ADMIN' });
      await a.agent.post(`/api/v1/admin/users/${b.user.id}/status`).send({ status: 'SUSPENDED', reason: 'test' }).expect(403);
      await a.agent.post(`/api/v1/admin/users/${a.user.id}/status`).send({ status: 'SUSPENDED', reason: 'test' }).expect(403);
    });
  });

  describe('Sessions et mots de passe', () => {
    it('pose un cookie httpOnly et ne renvoie jamais l’empreinte du mot de passe', async () => {
      const agent = client(ctx.app);
      const res = await agent.post('/api/v1/auth/register').send({ name: 'Kossi', phone: '+228 91 23 45 67', password: PASSWORD }).expect(201);
      const cookie = res.headers['set-cookie'][0];
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt/);
      expect(res.body.phone).toBe('+22891234567');
      // Connexion par numéro local, sans indicatif.
      await client(ctx.app).post('/api/v1/auth/login').send({ identifier: '91 23 45 67', password: PASSWORD }).expect(200);
    });

    it('refuse des identifiants incorrects avec un message générique', async () => {
      const { user } = await loggedIn(ctx);
      const wrong = await client(ctx.app).post('/api/v1/auth/login').send({ identifier: user.email, password: 'mauvais123' }).expect(401);
      const unknown = await client(ctx.app).post('/api/v1/auth/login').send({ identifier: 'inconnu@test.tg', password: 'mauvais123' }).expect(401);
      expect(wrong.body.message).toBe(unknown.body.message);
    });

    it('révoque la session à la déconnexion', async () => {
      const { agent } = await loggedIn(ctx);
      await agent.get('/api/v1/auth/me').expect(200);
      await agent.post('/api/v1/auth/logout').expect(204);
      await agent.get('/api/v1/auth/me').expect(401);
    });

    it('déconnecte les autres appareils au changement de mot de passe', async () => {
      const { agent, user } = await loggedIn(ctx);
      const other = client(ctx.app);
      await other.post('/api/v1/auth/login').send({ identifier: user.email, password: PASSWORD }).expect(200);
      await agent.post('/api/v1/auth/password/change').send({ currentPassword: PASSWORD, newPassword: 'Nouveau456789' }).expect(204);
      await agent.get('/api/v1/auth/me').expect(200);
      await other.get('/api/v1/auth/me').expect(401);
    });

    it('réinitialise le mot de passe avec un lien à usage unique', async () => {
      const { user } = await loggedIn(ctx);
      const mail = ctx.app.get(MailService);
      await client(ctx.app).post('/api/v1/auth/password/forgot').send({ email: user.email }).expect(204);
      const token = new URL(mail.lastMessage!.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;
      await client(ctx.app).post('/api/v1/auth/password/reset').send({ token, password: 'Reinit123456' }).expect(204);
      await client(ctx.app).post('/api/v1/auth/password/reset').send({ token, password: 'Encore123456' }).expect(400);
      await client(ctx.app).post('/api/v1/auth/login').send({ identifier: user.email, password: 'Reinit123456' }).expect(200);
      // Aucune information sur l'existence d'un compte.
      await client(ctx.app).post('/api/v1/auth/password/forgot').send({ email: 'personne@test.tg' }).expect(204);
    });

    it('bloque la connexion d’un compte suspendu et limite les tentatives', async () => {
      const { user } = await loggedIn(ctx);
      await ctx.prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
      const agent = client(ctx.app);
      await agent.post('/api/v1/auth/login').send({ identifier: user.email, password: PASSWORD }).expect(401);
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) statuses.push((await agent.post('/api/v1/auth/login').send({ identifier: user.email, password: 'x' })).status);
      expect(statuses).toContain(429);
    });

    it('refuse une requête de modification venant d’une origine non autorisée (CSRF)', async () => {
      const { agent } = await loggedIn(ctx);
      await agent.patch('/api/v1/auth/me').set('Origin', 'https://site-malveillant.example').send({ name: 'Piraté' }).expect(403);
      await agent.patch('/api/v1/auth/me').set('Origin', 'http://web.test').send({ name: 'Légitime' }).expect(200);
      // Application d'administration (ADMIN_URL), déployée sur son propre domaine.
      await agent.patch('/api/v1/auth/me').set('Origin', 'http://admin.test').send({ name: 'Légitime' }).expect(200);
    });
  });

  describe('Boutiques', () => {
    it('une boutique demandée reste invisible jusqu’à sa validation par l’administration', async () => {
      const { agent } = await loggedIn(ctx);
      const res = await agent
        .post('/api/v1/seller/shop')
        .send({ name: 'Ma Boutique Lomé', city: 'Lomé', whatsapp: '90 55 44 33', socialLinks: { facebook: 'https://facebook.com/maboutique' } })
        .expect(201);
      expect(res.body).toMatchObject({ status: 'PENDING', whatsapp: '+22890554433', slug: 'ma-boutique-lome' });
      expect((await agent.get('/api/v1/auth/me')).body.role).toBe('SELLER');
      await client(ctx.app).get('/api/v1/shops/ma-boutique-lome').expect(404);

      const { agent: admin } = await loggedIn(ctx, { role: 'ADMIN' });
      await admin.post(`/api/v1/admin/shops/${res.body.id}/status`).send({ status: 'ACTIVE' }).expect(200);
      const pub = await client(ctx.app).get('/api/v1/shops/ma-boutique-lome').expect(200);
      expect(pub.body.socialLinks).toEqual({ facebook: 'https://facebook.com/maboutique' });
      // Aucune donnée privée exposée.
      for (const key of ['ownerId', 'pendingChanges', 'statusReason', 'owner']) expect(pub.body[key]).toBeUndefined();
    });

    it('rejette les liens sociaux dangereux ou hors domaine', async () => {
      const { agent } = await loggedIn(ctx);
      const res = await agent
        .post('/api/v1/seller/shop')
        .send({ name: 'Piège', city: 'Lomé', whatsapp: '+22890000099', socialLinks: { instagram: 'javascript:alert(document.cookie)', tiktok: 'https://evil.example/x' } })
        .expect(400);
      expect(Object.keys(res.body.errors)).toEqual(expect.arrayContaining(['socialLinks.instagram', 'socialLinks.tiktok']));
    });

    it('soumet le changement de nom ou de WhatsApp d’une boutique active à validation', async () => {
      const { agent, shop } = await seller(ctx);
      const res = await agent.patch('/api/v1/seller/shop').send({ name: 'Nouveau nom', whatsapp: '+22893334455', description: 'Mise à jour' }).expect(200);
      expect(res.body).toMatchObject({ name: shop.name, whatsapp: shop.whatsapp, description: 'Mise à jour' });
      expect(res.body.pendingChanges).toMatchObject({ name: 'Nouveau nom', whatsapp: '+22893334455' });
      const { agent: admin } = await loggedIn(ctx, { role: 'ADMIN' });
      await admin.post(`/api/v1/admin/shops/${shop.id}/changes`).send({ approve: true }).expect(200);
      const pub = await client(ctx.app).get(`/api/v1/shops/${shop.slug}`).expect(200);
      expect(pub.body).toMatchObject({ name: 'Nouveau nom', whatsapp: '+22893334455' });
    });

    it('un vendeur ne peut modifier que sa propre boutique', async () => {
      const a = await seller(ctx);
      const b = await seller(ctx);
      await a.agent.patch('/api/v1/seller/shop').send({ description: 'A' }).expect(200);
      expect((await ctx.prisma.shop.findUniqueOrThrow({ where: { id: b.shop.id } })).description).toBeNull();
    });

    it('valide le type réel du logo', async () => {
      const { agent } = await seller(ctx);
      await agent.post('/api/v1/seller/shop/logo').attach('file', Buffer.from('GIF89a'.padEnd(100, 'x')), 'logo.png').expect(400);
      const ok = await agent.post('/api/v1/seller/shop/logo').attach('file', await png(300, 300), 'logo.png').expect(201);
      expect(ok.body.logoUrl).toMatch(/\.webp$/);
    });
  });

  describe('Données publiques', () => {
    it('n’expose aucune donnée interne dans les fiches et le catalogue', async () => {
      const s = await seller(ctx);
      const p = await publishedProduct(s.agent, brandId);
      const detail = await client(ctx.app).get(`/api/v1/products/${p.slug}`).expect(200);
      const list = await client(ctx.app).get('/api/v1/catalog/products').expect(200);
      for (const body of [detail.body, list.body]) {
        const json = JSON.stringify(body);
        expect(json).not.toMatch(/searchText|removalReason|ownerId|passwordHash|"key"|email/);
      }
    });

    it('génère un lien WhatsApp vers le numéro du bon vendeur', async () => {
      const s = await seller(ctx);
      const p = await publishedProduct(s.agent, brandId);
      const res = await client(ctx.app).post(`/api/v1/products/${p.id}/whatsapp`).expect(200);
      expect(res.body.url.startsWith(`https://wa.me/${s.shop.whatsapp.slice(1)}?text=`)).toBe(true);
      const message = decodeURIComponent(res.body.url.split('?text=')[1]);
      expect(message).toContain(p.reference);
      expect(message).toContain(`http://web.test/produits/${p.slug}`);
      expect(message).toContain('100 000 FCFA');
      // Un clic est compté, mais aucune vente n'est créée.
      expect(await ctx.prisma.sale.count({ where: { productId: p.id } })).toBe(0);
      expect((await ctx.prisma.product.findUniqueOrThrow({ where: { id: p.id } })).whatsappClicks).toBe(1);
    });

    it('expose un contrôle de santé', async () => {
      const res = await client(ctx.app).get('/api/v1/health').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', database: 'ok' });
    });
  });
});
