import { INestApplication } from '@nestjs/common';
import { PrismaClient, Role, ShopStatus } from '@prisma/client';
import sharp from 'sharp';
import request from 'supertest';
import { createApp } from '../src/bootstrap';
import { hashPassword } from '../src/common/crypto';
import { PrismaService } from '../src/prisma/prisma.service';

export const PASSWORD = 'Motdepasse123';
let counter = 0;
const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export interface Ctx {
  app: INestApplication;
  prisma: PrismaClient;
}

export async function setupApp(): Promise<Ctx> {
  const app = await createApp();
  await app.init();
  const prisma = app.get(PrismaService);
  await resetDb(prisma);
  return { app, prisma };
}

export async function resetDb(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
}

/** Client HTTP avec cookies persistants ; chaque client a son propre compteur de limitation. */
export function client(app: INestApplication, key = uid()) {
  return request.agent(app.getHttpServer()).set('x-test-client', key);
}

export type Agent = ReturnType<typeof client>;

let hashCache: string | null = null;
export async function createUser(prisma: PrismaClient, opts: { role?: Role; name?: string; phone?: string } = {}) {
  hashCache ??= await hashPassword(PASSWORD);
  return prisma.user.create({
    data: {
      name: opts.name ?? 'Client Test',
      email: `u-${uid()}@test.tg`,
      phone: opts.phone,
      passwordHash: hashCache,
      role: opts.role ?? 'CUSTOMER',
    },
  });
}

export async function loggedIn(ctx: Ctx, opts: { role?: Role; name?: string; phone?: string } = {}) {
  const user = await createUser(ctx.prisma, opts);
  const agent = client(ctx.app);
  await agent.post('/api/v1/auth/login').send({ identifier: user.email, password: PASSWORD }).expect(200);
  return { user, agent };
}

let phoneSeq = 0;
/** Numéro togolais unique au format E.164 (+228 9X XX XX XX). */
export const nextPhone = () => `+2289${String(1_000_000 + Math.floor(Math.random() * 8_000_000) + phoneSeq++).slice(-7)}`;

export async function brand(prisma: PrismaClient) {
  const name = `Marque ${uid()}`;
  return prisma.brand.create({ data: { name, slug: name.toLowerCase().replace(/\s/g, '-') } });
}

/** Vendeur connecté avec une boutique (active par défaut). */
export async function seller(ctx: Ctx, status: ShopStatus = 'ACTIVE', opts: { trusted?: boolean } = {}) {
  const { user, agent } = await loggedIn(ctx, { role: 'SELLER', name: 'Vendeur Test' });
  const shop = await ctx.prisma.shop.create({
    data: {
      ownerId: user.id,
      name: `Boutique ${uid()}`,
      slug: `boutique-${uid()}`,
      city: 'Lomé',
      whatsapp: nextPhone(),
      status,
      validatedAt: status === 'ACTIVE' ? new Date(Date.now() - 60 * 24 * 3600_000) : null,
      trustedSeller: opts.trusted ?? true,
    },
  });
  return { user, agent, shop };
}

export async function png(width = 64, height = 64, color = '#3a7') {
  return sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
}

export const productBody = (brandId: string, extra: Record<string, unknown> = {}) => ({
  brandId,
  model: 'Galaxy Test',
  condition: 'NEW',
  price: 100000,
  stock: 3,
  storageGb: 128,
  ramGb: 6,
  ...extra,
});

/** Crée un produit via l'API, ajoute une photo et le publie. */
export async function publishedProduct(agent: Agent, brandId: string, extra: Record<string, unknown> = {}) {
  const created = await agent.post('/api/v1/seller/products').send(productBody(brandId, extra)).expect(201);
  const id = created.body.id as string;
  await agent.post(`/api/v1/seller/products/${id}/media`).attach('file', await png(), 'photo.png').expect(201);
  const published = await agent.post(`/api/v1/seller/products/${id}/publish`).expect(200);
  return published.body as { id: string; slug: string; price: number; reference: string };
}

/** Rend un historique de prix ancien (prix de référence stable depuis plus de 30 jours). */
export async function agePriceHistory(prisma: PrismaClient, productId: string) {
  await prisma.priceHistory.updateMany({ where: { productId }, data: { createdAt: new Date(Date.now() - 40 * 24 * 3600_000) } });
}
