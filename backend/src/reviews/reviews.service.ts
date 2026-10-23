import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paged, skipTake } from '../common/pagination';
import { publicProductWhere } from '../common/visibility';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient | PrismaService;

/** Un avis compte dans les notes et s'affiche publiquement uniquement s'il est publié ET lié à une vente vérifiée. */
export const PUBLIC_REVIEW_WHERE: Prisma.ReviewWhereInput = { status: 'PUBLISHED', verification: 'VERIFIED_PURCHASE' };

/** « Kossi Mensah » → « Kossi M. » : l'identité complète de l'auteur n'est jamais publiée. */
export function displayName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Recalcule les notes moyennes à partir des seuls avis admissibles et publiés. */
  async recompute(tx: Tx, productId: string, shopId: string) {
    const [p, s] = await Promise.all([
      tx.review.aggregate({ where: { productId, ...PUBLIC_REVIEW_WHERE }, _avg: { rating: true }, _count: true }),
      tx.review.aggregate({ where: { shopId, ...PUBLIC_REVIEW_WHERE }, _avg: { rating: true }, _count: true }),
    ]);
    const round = (n: number | null) => (n ? Math.round(n * 100) / 100 : 0);
    await tx.product.update({ where: { id: productId }, data: { ratingAvg: round(p._avg.rating), ratingCount: p._count } });
    await tx.shop.update({ where: { id: shopId }, data: { ratingAvg: round(s._avg.rating), ratingCount: s._count } });
  }

  private async summary(where: Prisma.ReviewWhereInput) {
    const groups = await this.prisma.review.groupBy({ by: ['rating'], where: { ...where, ...PUBLIC_REVIEW_WHERE }, _count: true });
    const distribution = [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: groups.find((g) => g.rating === r)?._count ?? 0 }));
    const count = distribution.reduce((a, d) => a + d.count, 0);
    const avg = count ? distribution.reduce((a, d) => a + d.rating * d.count, 0) / count : 0;
    return { average: Math.round(avg * 10) / 10, count, distribution };
  }

  private async page(where: Prisma.ReviewWhereInput, q: { page: number; pageSize: number }, withProduct: boolean) {
    const full = { ...where, ...PUBLIC_REVIEW_WHERE };
    const [rows, total, summary] = await Promise.all([
      this.prisma.review.findMany({
        where: full,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        include: { author: { select: { name: true } }, product: { select: { title: true, slug: true } } },
      }),
      this.prisma.review.count({ where: full }),
      this.summary(where),
    ]);
    const items = rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      authorName: displayName(r.author.name),
      createdAt: r.createdAt,
      verifiedPurchase: r.verification === 'VERIFIED_PURCHASE',
      isDemo: r.isDemo,
      ...(withProduct ? { product: r.product } : {}),
    }));
    return { summary, ...paged(items, total, q.page, q.pageSize) };
  }

  async forProduct(slug: string, q: { page: number; pageSize: number }) {
    const p = await this.prisma.product.findFirst({ where: { slug, ...publicProductWhere() }, select: { id: true } });
    if (!p) throw new NotFoundException('Annonce introuvable.');
    return this.page({ productId: p.id }, q, false);
  }

  async forShop(slug: string, q: { page: number; pageSize: number }) {
    const s = await this.prisma.shop.findFirst({ where: { slug, status: { in: ['ACTIVE', 'CLOSED'] } }, select: { id: true } });
    if (!s) throw new NotFoundException('Boutique introuvable.');
    return this.page({ shopId: s.id }, q, true);
  }

  /** Avis reçus par la boutique du vendeur : consultation seule, aucune modification possible. */
  async forSeller(shopId: string, q: { page: number; pageSize: number }) {
    const where = { shopId };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        include: { author: { select: { name: true } }, product: { select: { title: true, slug: true } }, sale: { select: { internalRef: true } } },
      }),
      this.prisma.review.count({ where }),
    ]);
    return paged(
      rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        status: r.status,
        verification: r.verification,
        authorName: displayName(r.author.name),
        product: r.product,
        saleRef: r.sale.internalRef,
        createdAt: r.createdAt,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }
}
