import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Product, Shop } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { publicReference } from '../common/crypto';
import { paged, skipTake } from '../common/pagination';
import { buildSearchText, slugify } from '../common/text';
import { PrismaService } from '../prisma/prisma.service';
import { ShopsService } from '../shops/shops.service';
import { RevalidationService } from '../cache/revalidation.service';
import { ProductPresenter } from './product-presenter';
import { CreateProductDto, SellerProductsQuery, StockDto, UpdateProductDto } from './product.dto';

export function storageLabel(gb: number | null | undefined) {
  if (!gb) return '';
  return gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024} To` : `${gb} Go`;
}

const SELLER_INCLUDE = {
  brand: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, slug: true } },
  media: { orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }] },
} satisfies Prisma.ProductInclude;

type SellerProduct = Prisma.ProductGetPayload<{ include: typeof SELLER_INCLUDE }>;

@Injectable()
export class SellerProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: ShopsService,
    private readonly presenter: ProductPresenter,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  /** Charge un produit en vérifiant qu'il appartient à la boutique du vendeur connecté (sinon 404). */
  async owned(userId: string, productId: string): Promise<{ shop: Shop; product: Product }> {
    const shop = await this.shops.ownedShop(userId);
    const product = await this.prisma.product.findFirst({ where: { id: productId, shopId: shop.id } });
    if (!product) throw new NotFoundException('Produit introuvable.');
    return { shop, product };
  }

  view(p: SellerProduct) {
    return {
      ...p,
      media: p.media.map((m) => ({
        id: m.id,
        type: m.type,
        status: m.status,
        error: m.error,
        // Un fichier en traitement n'a pas encore de version diffusable.
        url: m.status === 'READY' ? this.presenter.url(m.key) : null,
        mediumUrl: m.status === 'READY' ? this.presenter.url(m.mediumKey ?? m.key) : null,
        thumbUrl: m.status === 'READY' ? this.presenter.url(m.thumbKey ?? m.posterKey) : null,
        posterUrl: this.presenter.url(m.posterKey),
        isPrimary: m.isPrimary,
        position: m.position,
        width: m.width,
        height: m.height,
        size: m.size,
        durationSec: m.durationSec,
        transcoded: m.transcoded,
      })),
    };
  }

  async get(userId: string, productId: string) {
    const { product } = await this.owned(userId, productId);
    const p = await this.prisma.product.findUniqueOrThrow({ where: { id: product.id }, include: SELLER_INCLUDE });
    const promos = await this.presenter.runningPromotions([p.id]);
    const running = promos.get(p.id);
    return { ...this.view(p), runningPromotion: running ? this.presenter.promotionView(running) : null };
  }

  async list(userId: string, q: SellerProductsQuery) {
    const shop = await this.shops.ownedShop(userId);
    const where: Prisma.ProductWhereInput = {
      shopId: shop.id,
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { reference: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({ where, include: SELLER_INCLUDE, orderBy: { updatedAt: 'desc' }, ...skipTake(q) }),
      this.prisma.product.count({ where }),
    ]);
    const promos = await this.presenter.runningPromotions(items.map((i) => i.id));
    return paged(
      items.map((p) => {
        const r = promos.get(p.id);
        return { ...this.view(p), runningPromotion: r ? this.presenter.promotionView(r) : null };
      }),
      total,
      q.page,
      q.pageSize,
    );
  }

  private async checkRefs(brandId?: string, categoryId?: string | null) {
    if (brandId) {
      const brand = await this.prisma.brand.findFirst({ where: { id: brandId, isActive: true } });
      if (!brand) throw new BadRequestException('Marque inconnue.');
    }
    if (categoryId) {
      const cat = await this.prisma.category.findFirst({ where: { id: categoryId, isActive: true } });
      if (!cat) throw new BadRequestException('Catégorie inconnue.');
    }
  }

  private async searchTextFor(p: { brandId: string; model: string; title: string; reference: string; storageGb?: number | null; ramGb?: number | null; color?: string | null; specs?: unknown }) {
    const brand = await this.prisma.brand.findUniqueOrThrow({ where: { id: p.brandId } });
    const specs = (p.specs ?? {}) as Record<string, unknown>;
    return buildSearchText([
      brand.name,
      p.model,
      p.title,
      p.reference,
      p.storageGb ? `${p.storageGb}go ${p.storageGb}gb` : null,
      p.ramGb ? `${p.ramGb}go ram` : null,
      p.color,
      specs.processor as string,
      specs.connectivity as string,
      specs.os as string,
    ]);
  }

  async create(userId: string, dto: CreateProductDto) {
    const shop = await this.shops.ownedShop(userId);
    this.shops.assertWritable(shop);
    await this.checkRefs(dto.brandId, dto.categoryId);

    const brand = await this.prisma.brand.findUniqueOrThrow({ where: { id: dto.brandId } });
    const title = dto.title ?? [brand.name, dto.model, storageLabel(dto.storageGb)].filter(Boolean).join(' ');
    const reference = publicReference();
    const stock = dto.stock ?? 1;
    const availability = dto.availability ?? (stock === 0 ? 'OUT_OF_STOCK' : 'AVAILABLE');
    const searchText = await this.searchTextFor({ ...dto, title, reference });

    const product = await this.prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          shopId: shop.id,
          brandId: dto.brandId,
          categoryId: dto.categoryId ?? null,
          model: dto.model,
          title,
          reference,
          slug: `${slugify(title, 70)}-${reference.slice(3).toLowerCase()}`,
          description: dto.description,
          condition: dto.condition,
          price: dto.price,
          stock,
          availability,
          storageGb: dto.storageGb ?? null,
          ramGb: dto.ramGb ?? null,
          color: dto.color,
          warranty: dto.warranty,
          accessories: dto.accessories,
          defects: dto.defects,
          specs: (dto.specs ?? {}) as Prisma.InputJsonValue,
          searchText,
          status: 'DRAFT',
        },
      });
      await tx.priceHistory.create({ data: { productId: p.id, price: p.price, changedById: userId } });
      await this.audit.log(userId, 'product.create', 'Product', p.id, { price: p.price }, tx);
      return p;
    });
    return this.get(userId, product.id);
  }

  async update(userId: string, productId: string, dto: UpdateProductDto) {
    const { shop, product } = await this.owned(userId, productId);
    this.shops.assertWritable(shop);
    if (product.removedAt) throw new ForbiddenException('Cette annonce a été retirée par l’administration et ne peut plus être modifiée.');
    await this.checkRefs(dto.brandId, dto.categoryId);

    const merged = { ...product, ...dto, specs: dto.specs ?? product.specs };
    const searchText = await this.searchTextFor(merged);
    const priceChanged = dto.price !== undefined && dto.price !== product.price;

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: product.id },
        data: {
          brandId: dto.brandId,
          categoryId: dto.categoryId,
          model: dto.model,
          title: dto.title,
          description: dto.description,
          condition: dto.condition,
          price: dto.price,
          stock: dto.stock,
          availability: dto.availability,
          storageGb: dto.storageGb,
          ramGb: dto.ramGb,
          color: dto.color,
          warranty: dto.warranty,
          accessories: dto.accessories,
          defects: dto.defects,
          specs: dto.specs ? (dto.specs as Prisma.InputJsonValue) : undefined,
          searchText,
        },
      });
      if (priceChanged) {
        await tx.priceHistory.create({ data: { productId: product.id, price: dto.price!, changedById: userId } });
        await this.disablePromotionsAfterPriceChange(tx, product.id, userId, product.price, dto.price!);
      }
      await this.audit.log(userId, 'product.update', 'Product', product.id, {
        fields: Object.keys(dto),
        ...(priceChanged ? { oldPrice: product.price, newPrice: dto.price } : {}),
      }, tx);
    });
    await this.revalidation.product(product.id);
    return this.get(userId, product.id);
  }

  /**
   * Règle : toute modification du prix habituel met fin aux promotions en cours ou programmées,
   * pour que le prix barré affiché corresponde toujours à un prix réellement pratiqué.
   */
  private async disablePromotionsAfterPriceChange(
    tx: Prisma.TransactionClient,
    productId: string,
    actorId: string,
    oldPrice: number,
    newPrice: number,
  ) {
    const promos = await tx.promotion.findMany({ where: { productId, status: 'ACTIVE', endsAt: { gt: new Date() } } });
    for (const p of promos) {
      await tx.promotion.update({ where: { id: p.id }, data: { status: 'DISABLED', statusReason: 'Prix habituel modifié' } });
      await tx.promotionEvent.create({
        data: { promotionId: p.id, actorId, type: 'AUTO_DISABLED', data: { reason: 'price_change', oldPrice, newPrice } },
      });
    }
  }

  async updateStock(userId: string, productId: string, dto: StockDto) {
    const { shop, product } = await this.owned(userId, productId);
    this.shops.assertWritable(shop);
    let availability = dto.availability ?? product.availability;
    // Synchronisation automatique stock / disponibilité, sauf choix explicite du vendeur.
    if (!dto.availability) {
      if (dto.stock === 0 && availability === 'AVAILABLE') availability = 'OUT_OF_STOCK';
      if (dto.stock > 0 && availability === 'OUT_OF_STOCK') availability = 'AVAILABLE';
    }
    if (availability === 'AVAILABLE' && dto.stock === 0) {
      throw new BadRequestException('Un produit sans stock ne peut pas être marqué disponible.');
    }
    await this.prisma.product.update({ where: { id: product.id }, data: { stock: dto.stock, availability } });
    await this.audit.log(userId, 'product.stock', 'Product', product.id, { stock: dto.stock, availability });
    await this.revalidation.product(product.id);
    return this.get(userId, product.id);
  }

  async publish(userId: string, productId: string) {
    const { shop, product } = await this.owned(userId, productId);
    this.shops.assertActive(shop, 'publier une annonce');
    if (product.removedAt) throw new ForbiddenException('Cette annonce a été retirée par l’administration.');
    const [ready, processing] = await Promise.all([
      this.prisma.productMedia.count({ where: { productId: product.id, type: 'IMAGE', status: 'READY' } }),
      this.prisma.productMedia.count({ where: { productId: product.id, type: 'IMAGE', status: 'PROCESSING' } }),
    ]);
    if (ready === 0) {
      throw new BadRequestException(
        processing ? 'Vos photos sont en cours de traitement. Réessayez dans quelques instants.' : 'Ajoutez au moins une photo avant de publier l’annonce.',
      );
    }
    // La validation de la boutique n'approuve pas ses annonces : sauf vendeur de confiance, une annonce
    // nouvelle (ou refusée puis corrigée) attend la validation de l'administration avant d'être visible.
    const moderation = product.moderation === 'APPROVED' || shop.trustedSeller ? 'APPROVED' : 'PENDING';
    await this.prisma.product.update({
      where: { id: product.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: product.publishedAt ?? new Date(),
        moderation,
        ...(moderation === 'APPROVED' && product.moderation !== 'APPROVED' ? { moderatedAt: new Date(), moderationNote: 'Vendeur de confiance' } : {}),
      },
    });
    await this.audit.log(userId, 'product.publish', 'Product', product.id, { moderation });
    await this.revalidation.product(product.id);
    return this.get(userId, product.id);
  }

  async unpublish(userId: string, productId: string) {
    const { shop, product } = await this.owned(userId, productId);
    this.shops.assertWritable(shop);
    await this.prisma.product.update({ where: { id: product.id }, data: { status: 'ARCHIVED' } });
    await this.audit.log(userId, 'product.unpublish', 'Product', product.id);
    await this.revalidation.product(product.id);
    return this.get(userId, product.id);
  }

  async remove(userId: string, productId: string) {
    const { shop, product } = await this.owned(userId, productId);
    this.shops.assertWritable(shop);
    if (product.status !== 'DRAFT') {
      throw new BadRequestException('Seuls les brouillons peuvent être supprimés. Retirez l’annonce pour la masquer.');
    }
    const sales = await this.prisma.sale.count({ where: { productId: product.id } });
    if (sales) throw new BadRequestException('Ce produit est associé à des ventes et ne peut pas être supprimé.');
    return product;
  }
}
