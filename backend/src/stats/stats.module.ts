import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { listedProductWhere, runningPromotionWhere } from '../common/visibility';
import { PrismaService } from '../prisma/prisma.service';
import { ShopsModule } from '../shops/shops.module';
import { ShopsService } from '../shops/shops.service';

/**
 * Statistiques. Les consultations et clics WhatsApp sont des événements observés par la plateforme
 * (non dédoublonnés) ; les ventes sont des déclarations de vendeurs, non des paiements constatés.
 */
@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: ShopsService,
  ) {}

  async seller(userId: string) {
    const shop = await this.shops.ownedShop(userId);
    const since = new Date(Date.now() - 30 * 24 * 3600_000);
    const sinceDay = new Date(since.toISOString().slice(0, 10));
    const [byStatus, published, totals, promotions, favorites, salesByStatus, daily] = await Promise.all([
      this.prisma.product.groupBy({ by: ['status'], where: { shopId: shop.id }, _count: true }),
      this.prisma.product.groupBy({ by: ['availability'], where: { shopId: shop.id, status: 'PUBLISHED', removedAt: null }, _count: true }),
      this.prisma.product.aggregate({ where: { shopId: shop.id }, _sum: { viewCount: true, whatsappClicks: true } }),
      this.prisma.promotion.count({ where: { shopId: shop.id, ...runningPromotionWhere() } }),
      this.prisma.productFavorite.count({ where: { product: { shopId: shop.id } } }),
      this.prisma.sale.groupBy({ by: ['status'], where: { shopId: shop.id }, _count: true }),
      this.prisma.productDailyStat.groupBy({
        by: ['day'],
        where: { product: { shopId: shop.id }, day: { gte: sinceDay } },
        _sum: { views: true, whatsappClicks: true },
        orderBy: { day: 'asc' },
      }),
    ]);
    const count = <T extends { _count: number }>(arr: T[], pick: (t: T) => boolean) => arr.filter(pick).reduce((a, x) => a + x._count, 0);
    return {
      shop: { id: shop.id, name: shop.name, slug: shop.slug, status: shop.status, ratingAvg: shop.ratingAvg, ratingCount: shop.ratingCount },
      products: {
        active: count(published, (p) => p.availability === 'AVAILABLE'),
        unavailable: count(published, (p) => p.availability !== 'AVAILABLE'),
        drafts: count(byStatus, (p) => p.status === 'DRAFT'),
        archived: count(byStatus, (p) => p.status === 'ARCHIVED'),
      },
      activePromotions: promotions,
      views: totals._sum.viewCount ?? 0,
      whatsappClicks: totals._sum.whatsappClicks ?? 0,
      favoritesReceived: favorites,
      sales: {
        declared: count(salesByStatus, (s) => s.status !== 'CANCELLED'),
        verified: count(salesByStatus, (s) => s.status === 'VERIFIED'),
        pending: count(salesByStatus, (s) => s.status === 'PENDING_VERIFICATION' || s.status === 'DECLARED'),
        disputed: count(salesByStatus, (s) => s.status === 'DISPUTED'),
      },
      last30Days: daily.map((d) => ({ day: d.day.toISOString().slice(0, 10), views: d._sum.views ?? 0, whatsappClicks: d._sum.whatsappClicks ?? 0 })),
    };
  }

  async admin() {
    const [shopsByStatus, sellersActive, productsByCondition, productsActive, promotionsRunning, promotionsTotal, totals, reviewsByStatus, salesByStatus, openReports, users] =
      await Promise.all([
        this.prisma.shop.groupBy({ by: ['status'], _count: true }),
        this.prisma.user.count({ where: { role: 'SELLER', status: 'ACTIVE', shop: { status: 'ACTIVE' } } }),
        this.prisma.product.groupBy({ by: ['condition'], where: listedProductWhere(), _count: true }),
        this.prisma.product.count({ where: { ...listedProductWhere(), availability: 'AVAILABLE' } }),
        this.prisma.promotion.count({ where: runningPromotionWhere() }),
        this.prisma.promotion.count(),
        this.prisma.product.aggregate({ _sum: { viewCount: true, whatsappClicks: true } }),
        this.prisma.review.groupBy({ by: ['status'], _count: true }),
        this.prisma.sale.groupBy({ by: ['status'], _count: true }),
        this.prisma.report.count({ where: { status: 'OPEN' } }),
        this.prisma.user.count(),
      ]);
    const byKey = <K extends string>(arr: Array<{ _count: number } & Record<string, unknown>>, key: string) =>
      Object.fromEntries(arr.map((a) => [a[key] as K, a._count]));
    return {
      users,
      activeSellers: sellersActive,
      shops: byKey(shopsByStatus, 'status'),
      productsActive,
      productsByCondition: byKey(productsByCondition, 'condition'),
      promotions: { running: promotionsRunning, total: promotionsTotal },
      observed: { views: totals._sum.viewCount ?? 0, whatsappClicks: totals._sum.whatsappClicks ?? 0 },
      reviews: byKey(reviewsByStatus, 'status'),
      sales: byKey(salesByStatus, 'status'),
      openReports,
    };
  }

  async sitemap() {
    const [shops, products] = await Promise.all([
      this.prisma.shop.findMany({ where: { status: 'ACTIVE' }, select: { slug: true, updatedAt: true }, take: 10_000 }),
      this.prisma.product.findMany({ where: listedProductWhere(), select: { slug: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 40_000 }),
    ]);
    return { shops, products };
  }
}

@ApiTags('Statistiques')
@Controller()
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Roles('SELLER') @Get('seller/dashboard') seller(@CurrentUser() u: AuthUser) { return this.stats.seller(u.id); }
  @Roles('ADMIN') @Get('admin/stats') admin() { return this.stats.admin(); }
  @Public() @Get('sitemap') sitemap() { return this.stats.sitemap(); }
}

@Module({ imports: [ShopsModule], providers: [StatsService], controllers: [StatsController] })
export class StatsModule {}
