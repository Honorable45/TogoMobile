import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma, Promotion } from '@prisma/client';
import { runningPromotionWhere } from '../common/visibility';
import { PrismaService } from '../prisma/prisma.service';
import { discountPercent } from '../promotions/promotion-rules';
import { StorageService } from '../storage/storage.service';

export const CARD_INCLUDE = {
  brand: { select: { name: true, slug: true } },
  shop: { select: { name: true, slug: true, logoKey: true, city: true, identityVerifiedAt: true } },
  media: { where: { isPrimary: true, status: 'READY' }, take: 1 },
} satisfies Prisma.ProductInclude;

export type CardProduct = Prisma.ProductGetPayload<{ include: typeof CARD_INCLUDE }>;

export interface PromotionView {
  id: string;
  promoPrice: number;
  referencePrice: number;
  discountPercent: number;
  startsAt: Date;
  endsAt: Date;
  conditions: string | null;
}

/**
 * Construit les représentations publiques des produits. Le prix courant et la promotion
 * sont toujours calculés ici, à partir de la même règle, pour toutes les pages.
 */
@Injectable()
export class ProductPresenter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  url(key: string | null | undefined) {
    return key ? this.storage.publicUrl(key) : null;
  }

  promotionView(p: Promotion): PromotionView {
    return {
      id: p.id,
      promoPrice: p.promoPrice,
      referencePrice: p.referencePrice,
      discountPercent: discountPercent(p.referencePrice, p.promoPrice),
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      conditions: p.conditions,
    };
  }

  async runningPromotions(productIds: string[]): Promise<Map<string, Promotion>> {
    if (!productIds.length) return new Map();
    const promos = await this.prisma.promotion.findMany({
      where: { ...runningPromotionWhere(), productId: { in: productIds } },
      orderBy: { promoPrice: 'asc' },
    });
    const map = new Map<string, Promotion>();
    for (const p of promos) if (!map.has(p.productId)) map.set(p.productId, p);
    return map;
  }

  card(p: CardProduct, promo?: Promotion) {
    const img = p.media[0];
    return {
      id: p.id,
      slug: p.slug,
      reference: p.reference,
      title: p.title,
      model: p.model,
      brand: p.brand,
      condition: p.condition,
      availability: p.availability,
      storageGb: p.storageGb,
      ramGb: p.ramGb,
      price: p.price,
      currentPrice: promo ? promo.promoPrice : p.price,
      promotion: promo ? this.promotionView(promo) : null,
      image: img
        ? { url: this.url(img.key), mediumUrl: this.url(img.mediumKey ?? img.key), thumbUrl: this.url(img.thumbKey ?? img.key), width: img.width, height: img.height }
        : null,
      shop: {
        name: p.shop.name,
        slug: p.shop.slug,
        city: p.shop.city,
        logoUrl: this.url(p.shop.logoKey),
        identityVerified: !!p.shop.identityVerifiedAt,
      },
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      isDemo: p.isDemo,
    };
  }

  async cards(products: CardProduct[]) {
    const promos = await this.runningPromotions(products.map((p) => p.id));
    return products.map((p) => this.card(p, promos.get(p.id)));
  }
}

export type ProductCard = ReturnType<ProductPresenter['card']>;

@Global()
@Module({ providers: [ProductPresenter], exports: [ProductPresenter] })
export class PresenterModule {}
