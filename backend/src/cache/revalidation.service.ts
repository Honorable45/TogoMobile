import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { JobsService, PermanentJobError } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient | PrismaService;

/** Étiquettes de cache utilisées par le site (fetch Next.js `next.tags`). */
export const tags = {
  product: (slug: string) => `product:${slug}`,
  shop: (slug: string) => `shop:${slug}`,
  catalog: 'catalog',
  home: 'home',
  promotions: 'promotions',
  brands: 'brands',
};

const BATCH = 100;

/**
 * Invalidation ciblée du cache du site : l'API signale les étiquettes concernées après chaque changement
 * (prix, disponibilité, boutique, promotion, avis). L'appel est mis en file : un site momentanément
 * injoignable n'empêche pas l'écriture, et la tentative est renouvelée.
 * Sans WEB_REVALIDATE_URL, le site n'utilise pas de cache long (voir frontend/src/lib/api-server.ts).
 */
@Injectable()
export class RevalidationService implements OnModuleInit {
  private readonly logger = new Logger('Revalidation');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
  ) {}

  get enabled() {
    return !!env().cache.webRevalidateUrl;
  }

  onModuleInit() {
    this.jobs.register('web.revalidate', (payload) => this.send((payload.tags as string[]) ?? [], 10_000));
    // Début et fin des promotions : aucune écriture ne se produit à ce moment-là, d'où une vérification périodique.
    this.jobs.registerPeriodic({ name: 'promotions.boundaries', everyMs: 60_000, run: () => this.promotionBoundaries() });
  }

  private async send(list: string[], timeoutMs: number) {
    const res = await fetch(env().cache.webRevalidateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Revalidate-Secret': env().cache.revalidateSecret },
      body: JSON.stringify({ tags: list }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 401 || res.status === 400) throw new PermanentJobError(`Invalidation refusée par le site (${res.status})`);
    if (!res.ok) throw new Error(`Invalidation : réponse ${res.status}`);
  }

  /**
   * Invalide immédiatement (appel direct, 1,5 s au plus) pour que la page suivante soit à jour ;
   * en cas d'échec, ou dans une transaction (l'écriture n'est pas encore validée), l'appel est mis en file.
   */
  async invalidate(list: string[], tx?: Tx) {
    if (!this.enabled) return;
    const unique = [...new Set(list.filter(Boolean))];
    for (let i = 0; i < unique.length; i += BATCH) {
      const batch = unique.slice(i, i + BATCH);
      if (!tx) {
        try {
          await this.send(batch, 1500);
          continue;
        } catch (e) {
          this.logger.warn(`Invalidation directe impossible, mise en file : ${(e as Error).message}`);
        }
      }
      await this.jobs.enqueue('web.revalidate', { tags: batch }, { tx, maxAttempts: 8 });
    }
  }

  /** Un produit change : sa fiche, sa boutique et les listes publiques. */
  async product(productId: string, tx?: Tx) {
    if (!this.enabled) return;
    const p = await (tx ?? this.prisma).product.findUnique({ where: { id: productId }, select: { slug: true, shop: { select: { slug: true } } } });
    if (p) await this.invalidate([tags.product(p.slug), tags.shop(p.shop.slug), tags.catalog, tags.home, tags.promotions], tx);
  }

  /** Une boutique change (statut, nom, coordonnées) : sa page et toutes ses fiches produit. */
  async shop(shopId: string, tx?: Tx) {
    if (!this.enabled) return;
    const db = tx ?? this.prisma;
    const s = await db.shop.findUnique({ where: { id: shopId }, select: { slug: true } });
    if (!s) return;
    const products = await db.product.findMany({ where: { shopId }, select: { slug: true } });
    await this.invalidate([tags.shop(s.slug), tags.catalog, tags.home, tags.promotions, ...products.map((p) => tags.product(p.slug))], tx);
  }

  async promotionBoundaries() {
    if (!this.enabled) return;
    const now = Date.now();
    const from = new Date(now - 120_000);
    const to = new Date(now);
    const promos = await this.prisma.promotion.findMany({
      where: { status: 'ACTIVE', OR: [{ startsAt: { gte: from, lte: to } }, { endsAt: { gte: from, lte: to } }] },
      select: { product: { select: { slug: true } }, shop: { select: { slug: true } } },
      take: 500,
    });
    if (!promos.length) return;
    this.logger.log(`Début ou fin de ${promos.length} promotion(s) : invalidation du cache`);
    await this.invalidate([
      tags.catalog,
      tags.home,
      tags.promotions,
      ...promos.flatMap((p) => [tags.product(p.product.slug), tags.shop(p.shop.slug)]),
    ]);
  }
}

@Global()
@Module({ providers: [RevalidationService], exports: [RevalidationService] })
export class CacheModule {}
