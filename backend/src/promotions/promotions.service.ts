import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Promotion } from '@prisma/client';
import { env } from '../config/env';
import { AuditService } from '../common/audit.service';
import { paged, skipTake } from '../common/pagination';
import { runningPromotionWhere } from '../common/visibility';
import { PrismaService } from '../prisma/prisma.service';
import { CARD_INCLUDE, ProductPresenter } from '../products/product-presenter';
import { ShopsService } from '../shops/shops.service';
import { RevalidationService } from '../cache/revalidation.service';
import { discountPercent, promotionPhase, referencePrice, validatePromotion } from './promotion-rules';

export interface PromotionPayload {
  productId: string;
  promoPrice: number;
  startsAt?: string;
  endsAt: string;
  conditions?: string | null;
}

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: ShopsService,
    private readonly presenter: ProductPresenter,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  /** Prix de référence actuel d'un produit (plus bas prix habituel sur la fenêtre réglementaire). */
  async referencePriceFor(tx: Prisma.TransactionClient | PrismaService, productId: string, currentPrice: number) {
    const since = new Date(Date.now() - env().rules.referencePriceDays * 24 * 3600_000);
    // Prix pratiqués sur la fenêtre : changements intervenus pendant la fenêtre,
    // plus le prix en vigueur au début de celle-ci (dernier changement antérieur).
    const [inWindow, atStart] = await Promise.all([
      tx.priceHistory.findMany({ where: { productId, createdAt: { gte: since } }, select: { price: true } }),
      tx.priceHistory.findFirst({ where: { productId, createdAt: { lt: since } }, orderBy: { createdAt: 'desc' }, select: { price: true } }),
    ]);
    const prices = [...inWindow, ...(atStart ? [atStart] : [])].map((h) => h.price);
    return referencePrice(currentPrice, prices);
  }

  view(p: Promotion, now = new Date()) {
    return {
      ...p,
      phase: promotionPhase(p, now),
      discountPercent: discountPercent(p.referencePrice, p.promoPrice),
      editable: p.status === 'ACTIVE' && p.startsAt > now,
    };
  }

  private parseDates(dto: { startsAt?: string; endsAt: string }) {
    return { startsAt: dto.startsAt ? new Date(dto.startsAt) : new Date(), endsAt: new Date(dto.endsAt) };
  }

  private async assertNoOverlap(tx: Prisma.TransactionClient, productId: string, startsAt: Date, endsAt: Date, exceptId?: string) {
    const overlap = await tx.promotion.findFirst({
      where: {
        productId,
        status: 'ACTIVE',
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (overlap) throw new BadRequestException('Une autre promotion est déjà prévue sur ce produit pendant cette période.');
  }

  async create(userId: string, dto: PromotionPayload) {
    const shop = await this.shops.ownedShop(userId);
    this.shops.assertActive(shop, 'créer une promotion');
    const { startsAt, endsAt } = this.parseDates(dto);

    const promo = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Product" WHERE id = ${dto.productId} FOR UPDATE`;
      const product = await tx.product.findFirst({ where: { id: dto.productId, shopId: shop.id } });
      if (!product) throw new NotFoundException('Produit introuvable.');
      if (product.status !== 'PUBLISHED' || product.removedAt) {
        throw new BadRequestException('La promotion doit porter sur une annonce publiée.');
      }
      if (product.availability !== 'AVAILABLE') {
        throw new BadRequestException('Impossible de créer une promotion sur un produit indisponible ou retiré de la vente.');
      }
      const reference = await this.referencePriceFor(tx, product.id, product.price);
      const errors = validatePromotion({ promoPrice: dto.promoPrice, startsAt, endsAt }, reference, { maxDays: env().rules.maxPromotionDays });
      if (errors.length) throw new BadRequestException({ message: errors[0], errors });
      await this.assertNoOverlap(tx, product.id, startsAt, endsAt);

      const created = await tx.promotion.create({
        data: {
          productId: product.id,
          shopId: shop.id,
          promoPrice: dto.promoPrice,
          referencePrice: reference,
          startsAt,
          endsAt,
          conditions: dto.conditions ?? null,
          status: 'ACTIVE',
        },
      });
      await tx.promotionEvent.create({
        data: { promotionId: created.id, actorId: userId, type: 'CREATED', data: { promoPrice: dto.promoPrice, referencePrice: reference, startsAt, endsAt } },
      });
      await this.audit.log(userId, 'promotion.create', 'Promotion', created.id, { productId: product.id }, tx);
      return created;
    });
    await this.revalidation.product(promo.productId);
    return this.view(promo);
  }

  private async ownedPromotion(userId: string, id: string) {
    const shop = await this.shops.ownedShop(userId);
    const promo = await this.prisma.promotion.findFirst({ where: { id, shopId: shop.id } });
    if (!promo) throw new NotFoundException('Promotion introuvable.');
    return { shop, promo };
  }

  /** Seules les promotions qui n'ont pas encore commencé peuvent être modifiées. */
  async update(userId: string, id: string, dto: Partial<PromotionPayload>) {
    const { shop, promo } = await this.ownedPromotion(userId, id);
    this.shops.assertActive(shop, 'modifier une promotion');
    if (promo.status !== 'ACTIVE' || promo.startsAt <= new Date()) {
      throw new BadRequestException('Seule une promotion programmée (pas encore commencée) peut être modifiée. Vous pouvez désactiver une promotion en cours.');
    }
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : promo.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : promo.endsAt;
    const promoPrice = dto.promoPrice ?? promo.promoPrice;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Product" WHERE id = ${promo.productId} FOR UPDATE`;
      const product = await tx.product.findUniqueOrThrow({ where: { id: promo.productId } });
      const reference = await this.referencePriceFor(tx, product.id, product.price);
      const errors = validatePromotion({ promoPrice, startsAt, endsAt }, reference, { maxDays: env().rules.maxPromotionDays });
      if (errors.length) throw new BadRequestException({ message: errors[0], errors });
      await this.assertNoOverlap(tx, product.id, startsAt, endsAt, promo.id);
      const u = await tx.promotion.update({
        where: { id: promo.id },
        data: { promoPrice, startsAt, endsAt, referencePrice: reference, conditions: dto.conditions === undefined ? undefined : dto.conditions },
      });
      await tx.promotionEvent.create({
        data: {
          promotionId: promo.id,
          actorId: userId,
          type: 'UPDATED',
          data: { before: { promoPrice: promo.promoPrice, startsAt: promo.startsAt, endsAt: promo.endsAt }, after: { promoPrice, startsAt, endsAt } },
        },
      });
      return u;
    });
    await this.audit.log(userId, 'promotion.update', 'Promotion', promo.id);
    await this.revalidation.product(promo.productId);
    return this.view(updated);
  }

  async disable(userId: string, id: string) {
    const { shop, promo } = await this.ownedPromotion(userId, id);
    this.shops.assertWritable(shop);
    if (promo.status !== 'ACTIVE') throw new BadRequestException('Cette promotion n’est pas active.');
    if (promo.endsAt <= new Date()) throw new BadRequestException('Cette promotion est déjà terminée.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.promotion.update({ where: { id: promo.id }, data: { status: 'DISABLED', statusReason: 'Désactivée par le vendeur' } });
      await tx.promotionEvent.create({ data: { promotionId: promo.id, actorId: userId, type: 'DISABLED' } });
      return u;
    });
    await this.audit.log(userId, 'promotion.disable', 'Promotion', promo.id);
    await this.revalidation.product(promo.productId);
    return this.view(updated);
  }

  async history(userId: string, id: string) {
    const { promo } = await this.ownedPromotion(userId, id);
    return this.prisma.promotionEvent.findMany({ where: { promotionId: promo.id }, orderBy: { createdAt: 'asc' } });
  }

  async sellerList(userId: string, q: { page: number; pageSize: number; productId?: string }) {
    const shop = await this.shops.ownedShop(userId);
    const where: Prisma.PromotionWhereInput = { shopId: shop.id, ...(q.productId ? { productId: q.productId } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.promotion.findMany({
        where,
        orderBy: [{ endsAt: 'desc' }],
        ...skipTake(q),
        include: { product: { select: { id: true, title: true, slug: true, price: true, reference: true, media: { where: { isPrimary: true }, take: 1 } } } },
      }),
      this.prisma.promotion.count({ where }),
    ]);
    const now = new Date();
    return paged(
      items.map(({ product, ...p }) => ({
        ...this.view(p, now),
        product: { id: product.id, title: product.title, slug: product.slug, price: product.price, reference: product.reference, imageUrl: this.presenter.url(product.media[0]?.thumbKey) },
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  // ─── Public ───────────────────────────────────────────────────────────────

  async publicList(q: { page: number; pageSize: number; shop?: string }) {
    const where: Prisma.PromotionWhereInput = {
      ...runningPromotionWhere(),
      ...(q.shop ? { shop: { slug: q.shop } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.promotion.findMany({
        where,
        orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
        ...skipTake(q),
        include: { product: { include: CARD_INCLUDE } },
      }),
      this.prisma.promotion.count({ where }),
    ]);
    return paged(rows.map((r) => this.presenter.card(r.product, r)), total, q.page, q.pageSize);
  }
}
