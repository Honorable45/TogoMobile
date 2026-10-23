import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { buildWhatsappUrl } from '../common/phone';
import { listedProductWhere, publicProductWhere, runningPromotionWhere } from '../common/visibility';
import { PrismaService } from '../prisma/prisma.service';
import { CARD_INCLUDE, ProductPresenter } from '../products/product-presenter';

const fcfa = (n: number) => new Intl.NumberFormat('fr-FR').format(n).replace(/ | /g, ' ') + ' FCFA';
const lomeDate = (d: Date) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Lome', day: 'numeric', month: 'long' }).format(d);

@Injectable()
export class PublicProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenter: ProductPresenter,
  ) {}

  async detail(slug: string) {
    const p = await this.prisma.product.findFirst({
      where: { slug, ...publicProductWhere() },
      include: {
        brand: { select: { name: true, slug: true } },
        category: { select: { name: true, slug: true } },
        media: { where: { status: 'READY' }, orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }] },
        shop: true,
      },
    });
    if (!p) throw new NotFoundException("Cette annonce n'existe pas ou n'est plus disponible.");

    const [promos, productCount] = await Promise.all([
      this.presenter.runningPromotions([p.id]),
      this.prisma.product.count({ where: { shopId: p.shopId, ...listedProductWhere() } }),
    ]);
    const promo = promos.get(p.id);
    const primary = p.media.find((m) => m.isPrimary && m.type === 'IMAGE');

    return {
      id: p.id,
      slug: p.slug,
      reference: p.reference,
      title: p.title,
      model: p.model,
      brand: p.brand,
      category: p.category,
      condition: p.condition,
      availability: p.availability,
      orderable: p.availability === 'AVAILABLE',
      storageGb: p.storageGb,
      ramGb: p.ramGb,
      color: p.color,
      warranty: p.warranty,
      accessories: p.accessories,
      defects: p.defects,
      description: p.description,
      specs: p.specs,
      price: p.price,
      currentPrice: promo ? promo.promoPrice : p.price,
      promotion: promo ? this.presenter.promotionView(promo) : null,
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      publishedAt: p.publishedAt,
      updatedAt: p.updatedAt,
      isDemo: p.isDemo,
      image: primary ? { url: this.presenter.url(primary.key), thumbUrl: this.presenter.url(primary.thumbKey) } : null,
      media: p.media.map((m) => ({
        id: m.id,
        type: m.type,
        url: this.presenter.url(m.key),
        mediumUrl: this.presenter.url(m.mediumKey ?? m.key),
        thumbUrl: this.presenter.url(m.thumbKey ?? m.posterKey),
        posterUrl: this.presenter.url(m.posterKey),
        width: m.width,
        height: m.height,
        isPrimary: m.isPrimary,
      })),
      shop: {
        id: p.shop.id,
        name: p.shop.name,
        slug: p.shop.slug,
        logoUrl: this.presenter.url(p.shop.logoKey),
        city: p.shop.city,
        district: p.shop.district,
        ratingAvg: p.shop.ratingAvg,
        ratingCount: p.shop.ratingCount,
        productCount,
        validatedAt: p.shop.validatedAt,
        identityVerified: !!p.shop.identityVerifiedAt,
      },
    };
  }

  async similar(slug: string) {
    const p = await this.prisma.product.findFirst({ where: { slug, ...publicProductWhere() }, select: { id: true, brandId: true } });
    if (!p) return [];
    const items = await this.prisma.product.findMany({
      where: { ...listedProductWhere(), brandId: p.brandId, id: { not: p.id }, availability: 'AVAILABLE' },
      include: CARD_INCLUDE,
      orderBy: { publishedAt: 'desc' },
      take: 8,
    });
    return this.presenter.cards(items);
  }

  /**
   * Prépare la redirection WhatsApp : vérifie que l'annonce est toujours accessible,
   * compose le message avec le prix affiché à cet instant, et compte le clic.
   * Un clic n'est pas une vente : rien d'autre n'est enregistré.
   */
  async whatsapp(productId: string) {
    const p = await this.prisma.product.findFirst({
      where: { id: productId, ...publicProductWhere() },
      include: { shop: { select: { name: true, whatsapp: true } } },
    });
    if (!p) throw new NotFoundException("Cette annonce n'est plus disponible.");
    if (p.availability === 'WITHDRAWN') throw new GoneException('Ce téléphone a été retiré de la vente.');

    const promo = (await this.presenter.runningPromotions([p.id])).get(p.id);
    const link = `${env().webUrl}/produits/${p.slug}`;
    const priceLine = promo
      ? `Prix affiché : ${fcfa(promo.promoPrice)} (promotion jusqu'au ${lomeDate(promo.endsAt)}, au lieu de ${fcfa(promo.referencePrice)})`
      : `Prix affiché : ${fcfa(p.price)}`;
    const question =
      p.availability === 'AVAILABLE' ? 'Est-il toujours disponible ?' : 'Pouvez-vous me dire quand il sera de nouveau disponible ?';
    const message = [
      `Bonjour ${p.shop.name}, je suis intéressé(e) par ce téléphone vu sur TogoMobile :`,
      `${p.title}`,
      `Référence : ${p.reference}`,
      priceLine,
      link,
      question,
    ].join('\n');

    await this.track(p.id, 'whatsappClicks');
    return { url: buildWhatsappUrl(p.shop.whatsapp, message), message, price: promo ? promo.promoPrice : p.price };
  }

  async view(productId: string) {
    const exists = await this.prisma.product.count({ where: { id: productId, ...publicProductWhere() } });
    if (exists) await this.track(productId, 'views');
  }

  private async track(productId: string, field: 'views' | 'whatsappClicks') {
    const total = field === 'views' ? Prisma.sql`"viewCount"` : Prisma.sql`"whatsappClicks"`;
    const col = field === 'views' ? Prisma.sql`views` : Prisma.sql`"whatsappClicks"`;
    await this.prisma.$transaction([
      this.prisma.$executeRaw`UPDATE "Product" SET ${total} = ${total} + 1 WHERE id = ${productId}`,
      this.prisma.$executeRaw`
        INSERT INTO "ProductDailyStat" ("productId", day, ${col})
        VALUES (${productId}, (now() AT TIME ZONE 'Africa/Lome')::date, 1)
        ON CONFLICT ("productId", day) DO UPDATE SET ${col} = "ProductDailyStat".${col} + 1`,
    ]);
  }

  async home() {
    const now = new Date();
    const [brands, newest, popular, promoRows, shops] = await Promise.all([
      this.prisma.brand.findMany({
        where: { isActive: true, featured: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, slug: true, logoUrl: true },
      }),
      this.prisma.product.findMany({
        where: { ...listedProductWhere(), availability: 'AVAILABLE' },
        include: CARD_INCLUDE,
        orderBy: { publishedAt: 'desc' },
        take: 8,
      }),
      this.prisma.product.findMany({
        where: { ...listedProductWhere(), availability: 'AVAILABLE', viewCount: { gt: 0 } },
        include: CARD_INCLUDE,
        orderBy: [{ whatsappClicks: 'desc' }, { viewCount: 'desc' }],
        take: 8,
      }),
      this.prisma.promotion.findMany({
        where: runningPromotionWhere(now),
        orderBy: { endsAt: 'asc' },
        take: 8,
        include: { product: { include: CARD_INCLUDE } },
      }),
      this.prisma.shop.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { validatedAt: 'desc' },
        take: 6,
        select: {
          id: true,
          name: true,
          slug: true,
          logoKey: true,
          city: true,
          ratingAvg: true,
          ratingCount: true,
          identityVerifiedAt: true,
          _count: { select: { products: { where: { ...listedProductWhere(), availability: 'AVAILABLE' } } } },
        },
      }),
    ]);

    return {
      brands,
      newest: await this.presenter.cards(newest),
      popular: await this.presenter.cards(popular),
      promotions: promoRows.map((pr) => this.presenter.card(pr.product, pr)),
      shops: shops.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        logoUrl: this.presenter.url(s.logoKey),
        city: s.city,
        ratingAvg: s.ratingAvg,
        ratingCount: s.ratingCount,
        identityVerified: !!s.identityVerifiedAt,
        productCount: s._count.products,
      })),
    };
  }
}
