import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Sale } from '@prisma/client';
import QRCode from 'qrcode';
import { env } from '../config/env';
import { AuditService } from '../common/audit.service';
import { hmac, randomToken, sha256 } from '../common/crypto';
import { paged, skipTake } from '../common/pagination';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { ProductPresenter } from '../products/product-presenter';
import { ShopsService } from '../shops/shops.service';

export interface DeclareSaleInput {
  productId: string;
  soldAt: string;
  internalRef: string;
  amount?: number;
  buyerPhone: string;
}

const DAY = 24 * 3600_000;

/** URL encodée dans le QR code. Le jeton est placé dans le fragment (#) : il n'est jamais transmis
 *  aux serveurs dans l'URL et n'apparaît donc pas dans les journaux d'accès. */
export function reviewUrl(token: string) {
  return `${env().webUrl}/avis#${token}`;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: ShopsService,
    private readonly presenter: ProductPresenter,
    private readonly audit: AuditService,
  ) {}

  private async issueToken(tx: Prisma.TransactionClient, saleId: string) {
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + env().rules.reviewTokenDays * DAY);
    await tx.reviewToken.create({ data: { saleId, tokenHash: sha256(token), expiresAt } });
    return { token, expiresAt };
  }

  private async qr(token: string, expiresAt: Date) {
    const url = reviewUrl(token);
    const svg = await QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
    // Le jeton en clair n'est renvoyé qu'une seule fois, au vendeur, et n'est jamais stocké.
    return { url, svg, expiresAt };
  }

  async declare(userId: string, dto: DeclareSaleInput) {
    const shop = await this.shops.ownedShop(userId);
    this.shops.assertActive(shop, 'enregistrer une vente');

    const product = await this.prisma.product.findFirst({ where: { id: dto.productId, shopId: shop.id } });
    if (!product) throw new NotFoundException('Produit introuvable.');
    if (product.status === 'DRAFT' || product.removedAt) {
      throw new BadRequestException('La vente doit porter sur une annonce publiée (ou retirée après la vente).');
    }

    const soldAt = new Date(dto.soldAt);
    const now = Date.now();
    if (isNaN(soldAt.getTime()) || soldAt.getTime() > now + 10 * 60_000) throw new BadRequestException('La date de vente ne peut pas être dans le futur.');
    if (soldAt.getTime() < now - 30 * DAY) throw new BadRequestException('Seules les ventes des 30 derniers jours peuvent être enregistrées.');

    const buyerPhone = normalizePhone(dto.buyerPhone);
    if (!buyerPhone) throw new BadRequestException('Numéro de l’acheteur invalide.');
    const owner = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true } });
    if ([shop.whatsapp, shop.phone, owner.phone].includes(buyerPhone)) {
      throw new BadRequestException('Le numéro de l’acheteur ne peut pas être celui de la boutique ou du vendeur.');
    }

    // Limitation du nombre de ventes déclarées.
    const isNewShop = !!shop.validatedAt && shop.validatedAt.getTime() > now - 14 * DAY;
    const limit = isNewShop ? env().rules.maxSalesPerDayNewShop : env().rules.maxSalesPerDay;
    const recent = await this.prisma.sale.count({ where: { shopId: shop.id, createdAt: { gte: new Date(now - DAY) } } });
    if (recent >= limit) {
      throw new HttpException(
        { message: `Limite atteinte : ${limit} ventes déclarées par 24 h pour votre boutique. Réessayez plus tard.`, code: 'SALE_LIMIT' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const existing = await this.prisma.sale.count({ where: { shopId: shop.id, internalRef: dto.internalRef } });
    if (existing) throw new ConflictException('Cette référence de transaction est déjà utilisée dans votre boutique.');

    const { sale, token, expiresAt } = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          shopId: shop.id,
          productId: product.id,
          declaredById: userId,
          internalRef: dto.internalRef,
          soldAt,
          amount: dto.amount ?? null,
          buyerPhoneHash: hmac(buyerPhone),
          buyerPhoneHint: buyerPhone.slice(-2),
          status: 'DECLARED',
        },
      });
      const t = await this.issueToken(tx, sale.id);
      await this.audit.log(userId, 'sale.declare', 'Sale', sale.id, { productId: product.id }, tx);
      return { sale, ...t };
    });

    return { sale: await this.get(userId, sale.id), qr: await this.qr(token, expiresAt) };
  }

  private async owned(userId: string, saleId: string): Promise<Sale> {
    const shop = await this.shops.ownedShop(userId);
    const sale = await this.prisma.sale.findFirst({ where: { id: saleId, shopId: shop.id } });
    if (!sale) throw new NotFoundException('Vente introuvable.');
    return sale;
  }

  /** Génère un nouveau QR code (l'ancien est révoqué). Utile si le client a perdu le premier. */
  async regenerate(userId: string, saleId: string) {
    const shop = await this.shops.ownedShop(userId);
    this.shops.assertActive(shop, 'générer un QR code');
    const sale = await this.owned(userId, saleId);
    if (sale.status !== 'DECLARED') throw new BadRequestException('Un nouveau QR code ne peut être généré que pour une vente non encore confirmée.');
    const { token, expiresAt } = await this.prisma.$transaction(async (tx) => {
      await tx.reviewToken.updateMany({
        where: { saleId: sale.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: 'Remplacé par un nouveau code' },
      });
      const t = await this.issueToken(tx, sale.id);
      await this.audit.log(userId, 'sale.qr_regenerate', 'Sale', sale.id, {}, tx);
      return t;
    });
    return this.qr(token, expiresAt);
  }

  async cancel(userId: string, saleId: string) {
    const shop = await this.shops.ownedShop(userId);
    this.shops.assertWritable(shop);
    const sale = await this.owned(userId, saleId);
    // Une vente déjà confirmée (avec avis) ne peut pas être annulée par le vendeur : cela lui
    // permettrait de faire disparaître un avis défavorable. Il doit passer par l'administration.
    if (sale.status !== 'DECLARED') {
      throw new BadRequestException('Cette vente a déjà été confirmée par le client : contactez l’administration pour la contester.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.sale.update({ where: { id: sale.id }, data: { status: 'CANCELLED', statusNote: 'Annulée par le vendeur' } });
      await tx.reviewToken.updateMany({
        where: { saleId: sale.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: 'Vente annulée' },
      });
      await this.audit.log(userId, 'sale.cancel', 'Sale', sale.id, {}, tx);
    });
    return this.get(userId, sale.id);
  }

  async get(userId: string, saleId: string) {
    const sale = await this.owned(userId, saleId);
    const full = await this.prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: {
        product: { select: { id: true, title: true, slug: true, reference: true } },
        tokens: { orderBy: { createdAt: 'desc' }, take: 1 },
        review: { select: { id: true, rating: true, status: true, verification: true, createdAt: true } },
      },
    });
    return this.sellerView(full);
  }

  private sellerView(
    s: Prisma.SaleGetPayload<{
      include: { product: { select: { id: true; title: true; slug: true; reference: true } }; tokens: true; review: { select: { id: true; rating: true; status: true; verification: true; createdAt: true } } };
    }>,
  ) {
    const t = s.tokens[0];
    const tokenState = !t ? 'NONE' : t.status !== 'ACTIVE' ? t.status : t.expiresAt <= new Date() ? 'EXPIRED' : 'ACTIVE';
    return {
      id: s.id,
      internalRef: s.internalRef,
      soldAt: s.soldAt,
      amount: s.amount,
      buyerPhoneHint: s.buyerPhoneHint,
      status: s.status,
      statusNote: s.statusNote,
      confirmedAt: s.confirmedAt,
      verifiedAt: s.verifiedAt,
      createdAt: s.createdAt,
      product: s.product,
      token: t ? { state: tokenState, expiresAt: t.expiresAt, usedAt: t.usedAt } : null,
      review: s.review,
    };
  }

  async list(userId: string, q: { page: number; pageSize: number; status?: Sale['status'] }) {
    const shop = await this.shops.ownedShop(userId);
    const where: Prisma.SaleWhereInput = { shopId: shop.id, ...(q.status ? { status: q.status } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        include: {
          product: { select: { id: true, title: true, slug: true, reference: true } },
          tokens: { orderBy: { createdAt: 'desc' }, take: 1 },
          review: { select: { id: true, rating: true, status: true, verification: true, createdAt: true } },
        },
      }),
      this.prisma.sale.count({ where }),
    ]);
    return paged(items.map((s) => this.sellerView(s)), total, q.page, q.pageSize);
  }
}
