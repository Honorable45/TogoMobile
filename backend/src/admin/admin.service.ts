import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductModeration, PromotionStatus, ReportStatus, ReviewStatus, SaleStatus, ShopStatus, UserStatus } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { paged, skipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { ProductPresenter } from '../products/product-presenter';
import { promotionPhase, discountPercent } from '../promotions/promotion-rules';
import { ReviewsService } from '../reviews/reviews.service';
import { RevalidationService } from '../cache/revalidation.service';
import { SaleFlag } from '../sales/sale-rules';

type PageQ = { page: number; pageSize: number };

const SHOP_TRANSITIONS: Record<ShopStatus, ShopStatus[]> = {
  PENDING: ['ACTIVE', 'REJECTED', 'CHANGES_REQUESTED'],
  CHANGES_REQUESTED: ['ACTIVE', 'REJECTED'],
  REJECTED: ['ACTIVE'],
  ACTIVE: ['SUSPENDED'],
  CLOSED: ['SUSPENDED'],
  SUSPENDED: ['ACTIVE'],
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly reviews: ReviewsService,
    private readonly presenter: ProductPresenter,
    private readonly revalidation: RevalidationService,
  ) {}

  // ─── Boutiques et vendeurs ────────────────────────────────────────────────

  async shops(q: PageQ & { status?: ShopStatus; q?: string; pendingChanges?: boolean }) {
    const where: Prisma.ShopWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.pendingChanges ? { pendingChanges: { not: Prisma.AnyNull } } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { slug: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.shop.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        include: { owner: { select: { id: true, name: true, email: true, phone: true, status: true } }, _count: { select: { products: true, sales: true } } },
      }),
      this.prisma.shop.count({ where }),
    ]);
    return paged(items.map((s) => ({ ...s, logoUrl: this.presenter.url(s.logoKey) })), total, q.page, q.pageSize);
  }

  async shop(id: string) {
    const s = await this.prisma.shop.findUnique({
      where: { id },
      include: { owner: { select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true } }, _count: { select: { products: true, sales: true, reviews: true } } },
    });
    if (!s) throw new NotFoundException('Boutique introuvable.');
    const history = await this.prisma.auditLog.findMany({
      where: { targetType: 'Shop', targetId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { actor: { select: { name: true, role: true } } },
    });
    return { ...s, logoUrl: this.presenter.url(s.logoKey), history };
  }

  async setShopStatus(actor: string, id: string, status: ShopStatus, reason?: string) {
    const shop = await this.prisma.shop.findUnique({ where: { id } });
    if (!shop) throw new NotFoundException('Boutique introuvable.');
    if (!SHOP_TRANSITIONS[shop.status].includes(status)) {
      throw new BadRequestException(`Transition impossible : ${shop.status} → ${status}.`);
    }
    if ((status === 'SUSPENDED' || status === 'REJECTED' || status === 'CHANGES_REQUESTED') && !reason) {
      throw new BadRequestException('Indiquez le motif de la décision.');
    }
    const updated = await this.prisma.shop.update({
      where: { id },
      data: { status, statusReason: reason ?? null, ...(status === 'ACTIVE' && !shop.validatedAt ? { validatedAt: new Date() } : {}) },
    });
    await this.audit.log(actor, `shop.status.${status.toLowerCase()}`, 'Shop', id, { from: shop.status, reason });
    await this.revalidation.shop(id);
    return updated;
  }

  async setShopIdentity(actor: string, id: string, verified: boolean, note?: string) {
    const shop = await this.prisma.shop.update({ where: { id }, data: { identityVerifiedAt: verified ? new Date() : null } });
    await this.audit.log(actor, verified ? 'shop.identity_verified' : 'shop.identity_unverified', 'Shop', id, { note });
    await this.revalidation.shop(id);
    return shop;
  }

  /** Vendeur de confiance : ses prochaines annonces sont publiées sans validation préalable. */
  async setShopTrusted(actor: string, id: string, trusted: boolean, note?: string) {
    const shop = await this.prisma.shop.update({ where: { id }, data: { trustedSeller: trusted } });
    await this.audit.log(actor, trusted ? 'shop.trusted' : 'shop.untrusted', 'Shop', id, { note });
    return shop;
  }

  async reviewShopChanges(actor: string, id: string, approve: boolean, reason?: string) {
    const shop = await this.prisma.shop.findUnique({ where: { id } });
    if (!shop?.pendingChanges) throw new BadRequestException('Aucune modification en attente.');
    const changes = shop.pendingChanges as { name?: string; whatsapp?: string };
    const updated = await this.prisma.shop.update({
      where: { id },
      data: {
        pendingChanges: Prisma.DbNull,
        ...(approve ? { ...(changes.name ? { name: changes.name } : {}), ...(changes.whatsapp ? { whatsapp: changes.whatsapp } : {}) } : {}),
      },
    });
    await this.audit.log(actor, approve ? 'shop.changes_approved' : 'shop.changes_rejected', 'Shop', id, {
      fields: Object.keys(changes).filter((k) => k !== 'requestedAt'),
      reason,
    });
    if (approve) await this.revalidation.shop(id);
    return updated;
  }

  // ─── Comptes ──────────────────────────────────────────────────────────────

  async users(q: PageQ & { q?: string; role?: 'CUSTOMER' | 'SELLER' | 'ADMIN'; status?: UserStatus }) {
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { role: q.role } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        select: { id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true, isDemo: true, shop: { select: { id: true, name: true, status: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paged(items, total, q.page, q.pageSize);
  }

  async setUserStatus(actor: string, id: string, status: UserStatus, reason?: string) {
    if (actor === id) throw new ForbiddenException('Vous ne pouvez pas modifier le statut de votre propre compte.');
    const user = await this.prisma.user.findUnique({ where: { id }, include: { shop: true } });
    if (!user) throw new NotFoundException('Compte introuvable.');
    if (user.role === 'ADMIN') throw new ForbiddenException('Le statut d’un administrateur se gère hors de l’interface (voir la documentation).');
    if (status === 'SUSPENDED' && !reason) throw new BadRequestException('Indiquez le motif de la suspension.');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status } });
      if (status === 'SUSPENDED') {
        await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        // La boutique d'un vendeur suspendu est suspendue elle aussi.
        if (user.shop && user.shop.status !== 'SUSPENDED' && user.shop.status !== 'PENDING' && user.shop.status !== 'REJECTED') {
          await tx.shop.update({ where: { id: user.shop.id }, data: { status: 'SUSPENDED', statusReason: `Compte vendeur suspendu : ${reason}` } });
        }
      }
      await this.audit.log(actor, `user.status.${status.toLowerCase()}`, 'User', id, { reason }, tx);
    });
    if (user.shop) await this.revalidation.shop(user.shop.id);
    return { id, status };
  }

  // ─── Produits ─────────────────────────────────────────────────────────────

  async products(q: PageQ & { q?: string; shopId?: string; removed?: boolean; moderation?: ProductModeration }) {
    const where: Prisma.ProductWhereInput = {
      ...(q.shopId ? { shopId: q.shopId } : {}),
      ...(q.moderation ? { moderation: q.moderation, status: 'PUBLISHED' } : {}),
      ...(q.removed !== undefined ? { removedAt: q.removed ? { not: null } : null } : {}),
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { reference: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        ...skipTake(q),
        include: { shop: { select: { id: true, name: true, slug: true, status: true } }, brand: { select: { name: true } }, media: { where: { isPrimary: true }, take: 1 } },
      }),
      this.prisma.product.count({ where }),
    ]);
    return paged(
      items.map(({ media, searchText: _s, ...p }) => ({ ...p, imageUrl: this.presenter.url(media[0]?.thumbKey) })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async productDetail(id: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: { shop: { select: { id: true, name: true, slug: true } }, brand: true, media: true, priceHistory: { orderBy: { createdAt: 'desc' }, take: 30 } },
    });
    if (!p) throw new NotFoundException('Produit introuvable.');
    const history = await this.prisma.auditLog.findMany({ where: { targetType: 'Product', targetId: id }, orderBy: { createdAt: 'desc' }, take: 50 });
    return { ...p, media: p.media.map((m) => ({ ...m, url: this.presenter.url(m.key) })), history };
  }

  async removeProduct(actor: string, id: string, reason: string) {
    if (!reason) throw new BadRequestException('Indiquez le motif du retrait.');
    const p = await this.prisma.product.update({ where: { id }, data: { removedAt: new Date(), removalReason: reason } });
    await this.audit.log(actor, 'product.admin_remove', 'Product', id, { reason });
    await this.revalidation.product(id);
    return p;
  }

  async restoreProduct(actor: string, id: string) {
    const p = await this.prisma.product.update({ where: { id }, data: { removedAt: null, removalReason: null } });
    await this.audit.log(actor, 'product.admin_restore', 'Product', id);
    await this.revalidation.product(id);
    return p;
  }

  /** Validation d'une annonce publiée par un vendeur qui n'est pas « de confiance ». */
  async moderateProduct(actor: string, id: string, approve: boolean, note?: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Annonce introuvable.');
    if (!approve && !note) throw new BadRequestException('Indiquez au vendeur ce qui doit être corrigé.');
    const p = await this.prisma.product.update({
      where: { id },
      data: { moderation: approve ? 'APPROVED' : 'REJECTED', moderationNote: note ?? null, moderatedAt: new Date() },
    });
    await this.audit.log(actor, approve ? 'product.approve' : 'product.reject', 'Product', id, { note });
    await this.revalidation.product(id);
    return p;
  }

  // ─── Promotions ───────────────────────────────────────────────────────────

  async promotions(q: PageQ & { status?: PromotionStatus; shopId?: string }) {
    const where: Prisma.PromotionWhereInput = { ...(q.status ? { status: q.status } : {}), ...(q.shopId ? { shopId: q.shopId } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.promotion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        include: { product: { select: { id: true, title: true, slug: true, price: true } }, shop: { select: { id: true, name: true } }, _count: { select: { events: true } } },
      }),
      this.prisma.promotion.count({ where }),
    ]);
    const now = new Date();
    return paged(
      items.map((p) => ({ ...p, phase: promotionPhase(p, now), discountPercent: discountPercent(p.referencePrice, p.promoPrice) })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async setPromotionStatus(actor: string, id: string, suspend: boolean, reason?: string) {
    const promo = await this.prisma.promotion.findUnique({ where: { id } });
    if (!promo) throw new NotFoundException('Promotion introuvable.');
    if (suspend && !reason) throw new BadRequestException('Indiquez le motif de la suspension.');
    if (!suspend && promo.status !== 'SUSPENDED') throw new BadRequestException('Cette promotion n’est pas suspendue.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.promotion.update({
        where: { id },
        data: { status: suspend ? 'SUSPENDED' : 'ACTIVE', statusReason: suspend ? reason : null },
      });
      await tx.promotionEvent.create({ data: { promotionId: id, actorId: actor, type: suspend ? 'SUSPENDED' : 'REINSTATED', data: { reason } } });
      await this.audit.log(actor, suspend ? 'promotion.suspend' : 'promotion.reinstate', 'Promotion', id, { reason }, tx);
      return u;
    });
    await this.revalidation.product(promo.productId);
    return updated;
  }

  // ─── Avis ─────────────────────────────────────────────────────────────────

  async reviewsList(q: PageQ & { status?: ReviewStatus }) {
    const where: Prisma.ReviewWhereInput = q.status ? { status: q.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        include: {
          author: { select: { id: true, name: true, email: true, createdAt: true } },
          product: { select: { id: true, title: true, slug: true } },
          shop: { select: { id: true, name: true, slug: true } },
          sale: { select: { id: true, status: true, internalRef: true, soldAt: true, flags: true, confirmedAt: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    const reportCounts = await this.prisma.report.groupBy({
      by: ['targetId'],
      where: { targetType: 'REVIEW', targetId: { in: items.map((i) => i.id) } },
      _count: true,
    });
    return paged(
      items.map(({ commentHash: _h, ...r }) => ({ ...r, reports: reportCounts.find((c) => c.targetId === r.id)?._count ?? 0 })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async moderateReview(actor: string, id: string, action: 'publish' | 'hide' | 'reject', note?: string) {
    const review = await this.prisma.review.findUnique({ where: { id }, include: { sale: true } });
    if (!review) throw new NotFoundException('Avis introuvable.');
    if (action === 'publish' && review.sale.status !== 'VERIFIED') {
      throw new BadRequestException('Impossible de publier : la vente associée n’est pas vérifiée. Examinez d’abord la vente.');
    }
    if (action !== 'publish' && !note) throw new BadRequestException('Indiquez le motif de la décision.');
    const status: ReviewStatus = action === 'publish' ? 'PUBLISHED' : action === 'hide' ? 'HIDDEN' : 'REJECTED';
    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({ where: { id }, data: { status, moderationNote: note ?? null, moderatedById: actor, moderatedAt: new Date() } });
      await this.reviews.recompute(tx, review.productId, review.shopId);
      await this.audit.log(actor, `review.${action}`, 'Review', id, { note }, tx);
    });
    await this.revalidation.product(review.productId);
    return { id, status };
  }

  // ─── Ventes déclarées ─────────────────────────────────────────────────────

  async salesList(q: PageQ & { status?: SaleStatus; shopId?: string }) {
    const where: Prisma.SaleWhereInput = { ...(q.status ? { status: q.status } : {}), ...(q.shopId ? { shopId: q.shopId } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        include: {
          shop: { select: { id: true, name: true, slug: true, validatedAt: true } },
          product: { select: { id: true, title: true, slug: true } },
          buyer: { select: { id: true, name: true, createdAt: true } },
          review: { select: { id: true, rating: true, comment: true, status: true, verification: true } },
          tokens: { select: { status: true, failedAttempts: true, createdAt: true, usedAt: true }, orderBy: { createdAt: 'desc' } },
        },
      }),
      this.prisma.sale.count({ where }),
    ]);
    return paged(items.map(({ buyerPhoneHash: _h, ...s }) => s), total, q.page, q.pageSize);
  }

  /**
   * Décision administrative sur une vente :
   * - verify : vente vérifiée, avis publié avec « Achat vérifié » (sauf contenu à modérer) ;
   * - dispute : vente contestée, avis masqué et retiré des notes jusqu'à décision ;
   * - cancel : vente annulée, avis rejeté.
   */
  async decideSale(actor: string, id: string, action: 'verify' | 'dispute' | 'cancel', note?: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id }, include: { review: true } });
    if (!sale) throw new NotFoundException('Vente introuvable.');
    if (action !== 'verify' && !note) throw new BadRequestException('Indiquez le motif de la décision.');
    const allowed: Record<typeof action, SaleStatus[]> = {
      verify: ['PENDING_VERIFICATION', 'DISPUTED'],
      dispute: ['VERIFIED', 'PENDING_VERIFICATION', 'DECLARED'],
      cancel: ['DECLARED', 'PENDING_VERIFICATION', 'DISPUTED', 'VERIFIED'],
    };
    if (!allowed[action].includes(sale.status)) throw new BadRequestException(`Action impossible sur une vente au statut ${sale.status}.`);

    const flags = (sale.flags as unknown as SaleFlag[]) ?? [];
    const contentHeld = flags.some((f) => f.scope === 'content');
    const status: SaleStatus = action === 'verify' ? 'VERIFIED' : action === 'dispute' ? 'DISPUTED' : 'CANCELLED';

    await this.prisma.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id },
        data: { status, statusNote: note ?? null, ...(action === 'verify' ? { verifiedAt: new Date() } : {}) },
      });
      if (action !== 'verify') {
        await tx.reviewToken.updateMany({ where: { saleId: id, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: `Vente ${status}` } });
      }
      if (sale.review) {
        const data: Prisma.ReviewUncheckedUpdateInput =
          action === 'verify'
            ? { verification: 'VERIFIED_PURCHASE', status: contentHeld ? 'PENDING' : 'PUBLISHED' }
            : action === 'dispute'
              ? { verification: 'REVOKED', status: 'PENDING' }
              : { verification: 'REVOKED', status: 'REJECTED' };
        await tx.review.update({ where: { id: sale.review.id }, data: { ...data, moderatedById: actor, moderatedAt: new Date(), moderationNote: note ?? null } });
        await this.reviews.recompute(tx, sale.productId, sale.shopId);
      }
      await this.audit.log(actor, `sale.${action}`, 'Sale', id, { from: sale.status, note }, tx);
    });
    if (sale.review) await this.revalidation.product(sale.productId);
    return { id, status };
  }

  // ─── Signalements ─────────────────────────────────────────────────────────

  async reports(q: PageQ & { status?: ReportStatus }) {
    const where: Prisma.ReportWhereInput = q.status ? { status: q.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        include: { author: { select: { id: true, name: true } }, handledBy: { select: { name: true } } },
      }),
      this.prisma.report.count({ where }),
    ]);
    // Résumé lisible des cibles : une requête par type de contenu (et non une par signalement).
    const ids = (t: string) => items.filter((r) => r.targetType === t).map((r) => r.targetId);
    const [products, shops, reviews, promos] = await Promise.all([
      this.prisma.product.findMany({ where: { id: { in: ids('PRODUCT') } }, select: { id: true, title: true, slug: true, shop: { select: { name: true } } } }),
      this.prisma.shop.findMany({ where: { id: { in: ids('SHOP') } }, select: { id: true, name: true, slug: true } }),
      this.prisma.review.findMany({ where: { id: { in: ids('REVIEW') } }, select: { id: true, rating: true, comment: true, product: { select: { title: true } } } }),
      this.prisma.promotion.findMany({ where: { id: { in: ids('PROMOTION') } }, select: { id: true, promoPrice: true, product: { select: { title: true, slug: true } } } }),
    ]);
    const describe = (type: string, id: string) => {
      if (type === 'PRODUCT') {
        const p = products.find((x) => x.id === id);
        return p ? { label: `${p.title} — ${p.shop.name}`, href: `/produits/${p.slug}` } : null;
      }
      if (type === 'SHOP') {
        const s = shops.find((x) => x.id === id);
        return s ? { label: s.name, href: `/boutiques/${s.slug}` } : null;
      }
      if (type === 'REVIEW') {
        const r = reviews.find((x) => x.id === id);
        return r ? { label: `Avis ${r.rating}/5 sur ${r.product.title}`, excerpt: r.comment?.slice(0, 160) ?? null } : null;
      }
      const p = promos.find((x) => x.id === id);
      return p ? { label: `Promotion à ${p.promoPrice} FCFA sur ${p.product.title}`, href: `/produits/${p.product.slug}` } : null;
    };
    return paged(items.map((r) => ({ ...r, target: describe(r.targetType, r.targetId) })), total, q.page, q.pageSize);
  }

  async resolveReport(actor: string, id: string, status: 'RESOLVED' | 'DISMISSED', decision: string) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Signalement introuvable.');
    if (report.status !== 'OPEN') throw new BadRequestException('Ce signalement a déjà été traité.');
    const updated = await this.prisma.report.update({
      where: { id },
      data: { status, decision, handledById: actor, handledAt: new Date() },
    });
    await this.audit.log(actor, `report.${status.toLowerCase()}`, 'Report', id, { targetType: report.targetType, targetId: report.targetId });
    return updated;
  }

  // ─── Journal ──────────────────────────────────────────────────────────────

  async auditLogs(q: PageQ & { targetType?: string; targetId?: string; actorId?: string }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.targetType ? { targetType: q.targetType } : {}),
      ...(q.targetId ? { targetId: q.targetId } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q), include: { actor: { select: { name: true, role: true } } } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paged(items, total, q.page, q.pageSize);
  }
}
