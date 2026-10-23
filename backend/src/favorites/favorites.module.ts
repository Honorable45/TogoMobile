import { Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/auth.decorators';
import { PageQuery, paged, skipTake } from '../common/pagination';
import { listedProductWhere, publicProductWhere } from '../common/visibility';
import { PrismaService } from '../prisma/prisma.service';
import { CARD_INCLUDE, ProductPresenter } from '../products/product-presenter';
import { ShopsService } from '../shops/shops.service';
import { ShopsModule } from '../shops/shops.module';

@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenter: ProductPresenter,
    private readonly shops: ShopsService,
  ) {}

  /** Identifiants favoris de l'utilisateur, pour l'état des boutons dans l'interface. */
  async ids(userId: string) {
    const [products, shops] = await Promise.all([
      this.prisma.productFavorite.findMany({ where: { userId }, select: { productId: true }, take: 1000 }),
      this.prisma.shopFavorite.findMany({ where: { userId }, select: { shopId: true }, take: 1000 }),
    ]);
    return { products: products.map((p) => p.productId), shops: shops.map((s) => s.shopId) };
  }

  async addProduct(userId: string, productId: string) {
    const exists = await this.prisma.product.count({ where: { id: productId, ...publicProductWhere() } });
    if (!exists) throw new NotFoundException('Annonce introuvable.');
    // Idempotent : la clé primaire (userId, productId) empêche les doublons.
    await this.prisma.productFavorite.createMany({ data: [{ userId, productId }], skipDuplicates: true });
    return { favorite: true };
  }

  async removeProduct(userId: string, productId: string) {
    await this.prisma.productFavorite.deleteMany({ where: { userId, productId } });
    return { favorite: false };
  }

  async addShop(userId: string, shopId: string) {
    const exists = await this.prisma.shop.count({ where: { id: shopId, status: { in: ['ACTIVE', 'CLOSED'] } } });
    if (!exists) throw new NotFoundException('Boutique introuvable.');
    await this.prisma.shopFavorite.createMany({ data: [{ userId, shopId }], skipDuplicates: true });
    return { favorite: true };
  }

  async removeShop(userId: string, shopId: string) {
    await this.prisma.shopFavorite.deleteMany({ where: { userId, shopId } });
    return { favorite: false };
  }

  async products(userId: string, q: PageQuery) {
    // Les favoris dont l'annonce n'est plus publique sont conservés mais signalés comme indisponibles.
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.productFavorite.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        include: { product: { include: { ...CARD_INCLUDE, shop: { select: { ...CARD_INCLUDE.shop.select, status: true } } } } },
      }),
      this.prisma.productFavorite.count({ where }),
    ]);
    const publicIds = new Set(
      (
        await this.prisma.product.findMany({
          where: { id: { in: rows.map((r) => r.productId) }, ...listedProductWhere() },
          select: { id: true },
        })
      ).map((p) => p.id),
    );
    const cards = await this.presenter.cards(rows.map((r) => r.product));
    return paged(
      cards.map((c, i) => ({ ...c, addedAt: rows[i].createdAt, listed: publicIds.has(c.id) })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async shopsList(userId: string, q: PageQuery) {
    const where = { userId, shop: { status: { in: ['ACTIVE' as const, 'CLOSED' as const] } } };
    const [rows, total] = await Promise.all([
      this.prisma.shopFavorite.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        include: {
          shop: { include: { _count: { select: { products: { where: { ...listedProductWhere(), availability: 'AVAILABLE' } } } } } },
        },
      }),
      this.prisma.shopFavorite.count({ where }),
    ]);
    return paged(
      rows.map((r) => ({ ...this.shops.publicCard(r.shop, r.shop._count.products), status: r.shop.status, addedAt: r.createdAt })),
      total,
      q.page,
      q.pageSize,
    );
  }
}

@ApiTags('Favoris')
@Controller('me/favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get('ids')
  ids(@CurrentUser() user: AuthUser) {
    return this.favorites.ids(user.id);
  }

  @Get('products')
  products(@CurrentUser() user: AuthUser, @Query() q: PageQuery) {
    return this.favorites.products(user.id, q);
  }

  @Put('products/:productId')
  addProduct(@CurrentUser() user: AuthUser, @Param('productId') productId: string) {
    return this.favorites.addProduct(user.id, productId);
  }

  @Delete('products/:productId')
  @HttpCode(200)
  removeProduct(@CurrentUser() user: AuthUser, @Param('productId') productId: string) {
    return this.favorites.removeProduct(user.id, productId);
  }

  @Get('shops')
  shops(@CurrentUser() user: AuthUser, @Query() q: PageQuery) {
    return this.favorites.shopsList(user.id, q);
  }

  @Put('shops/:shopId')
  addShop(@CurrentUser() user: AuthUser, @Param('shopId') shopId: string) {
    return this.favorites.addShop(user.id, shopId);
  }

  @Delete('shops/:shopId')
  @HttpCode(200)
  removeShop(@CurrentUser() user: AuthUser, @Param('shopId') shopId: string) {
    return this.favorites.removeShop(user.id, shopId);
  }
}

@Module({ imports: [ShopsModule], providers: [FavoritesService], controllers: [FavoritesController] })
export class FavoritesModule {}
