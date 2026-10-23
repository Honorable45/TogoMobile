import { BadRequestException, ForbiddenException, GoneException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, ReviewToken, Sale } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { hmac, sha256 } from '../common/crypto';
import { normalizePhone } from '../common/phone';
import { commentFingerprint } from '../common/text';
import { PrismaService } from '../prisma/prisma.service';
import { ProductPresenter } from '../products/product-presenter';
import { evaluateSale, MAX_TOKEN_ATTEMPTS, SaleFlag } from '../sales/sale-rules';
import { ReviewsService } from './reviews.service';
import { RevalidationService } from '../cache/revalidation.service';

export type TokenState = 'VALID' | 'INVALID' | 'EXPIRED' | 'USED' | 'REVOKED';

const DAY = 24 * 3600_000;

/** Messages volontairement génériques : aucune donnée sur la vente ou l'acheteur n'est divulguée. */
const STATE_MESSAGES: Record<Exclude<TokenState, 'VALID'>, string> = {
  INVALID: 'Ce code n’est pas reconnu. Vérifiez que vous avez scanné le QR code complet remis par le vendeur.',
  EXPIRED: 'Ce code a expiré. Demandez au vendeur de vous en générer un nouveau.',
  USED: 'Un avis a déjà été déposé avec ce code. Chaque achat ne permet qu’un seul avis.',
  REVOKED: 'Ce code a été désactivé. Demandez au vendeur un nouveau code si votre achat est bien réel.',
};

export interface SubmitReviewInput {
  buyerPhone: string;
  rating: number;
  comment?: string | null;
}

@Injectable()
export class ReviewVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenter: ProductPresenter,
    private readonly reviews: ReviewsService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  private stateOf(t: (ReviewToken & { sale: Sale }) | null): TokenState {
    if (!t) return 'INVALID';
    if (t.status === 'USED') return 'USED';
    if (t.status === 'REVOKED' || t.sale.status === 'CANCELLED') return 'REVOKED';
    if (t.expiresAt <= new Date()) return 'EXPIRED';
    if (t.sale.status !== 'DECLARED') return 'USED';
    return 'VALID';
  }

  private load(token: string) {
    if (typeof token !== 'string' || token.length < 30 || token.length > 100) return Promise.resolve(null);
    return this.prisma.reviewToken.findUnique({ where: { tokenHash: sha256(token) }, include: { sale: true } });
  }

  /** Étape 1 du parcours : validation du code et présentation du produit concerné. */
  async check(token: string) {
    const t = await this.load(token);
    const state = this.stateOf(t);
    if (state !== 'VALID') return { state, message: STATE_MESSAGES[state] };

    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id: t!.sale.productId },
      include: { shop: { select: { name: true, slug: true, logoKey: true } }, media: { where: { isPrimary: true }, take: 1 } },
    });
    return {
      state,
      expiresAt: t!.expiresAt,
      product: {
        title: product.title,
        slug: product.slug,
        reference: product.reference,
        imageUrl: this.presenter.url(product.media[0]?.thumbKey),
      },
      shop: { name: product.shop.name, slug: product.shop.slug, logoUrl: this.presenter.url(product.shop.logoKey) },
      soldAt: t!.sale.soldAt,
    };
  }

  private fail(state: Exclude<TokenState, 'VALID'>): never {
    throw new GoneException({ message: STATE_MESSAGES[state], code: `TOKEN_${state}` });
  }

  /** Étapes 2 à 10 : contrôles d'éligibilité puis enregistrement atomique de l'avis. */
  async submit(userId: string, token: string, input: SubmitReviewInput) {
    const t = await this.load(token);
    const state = this.stateOf(t);
    if (state !== 'VALID') this.fail(state);
    const sale = t!.sale;

    const [user, shop] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.shop.findUniqueOrThrow({ where: { id: sale.shopId } }),
    ]);
    if (shop.ownerId === userId || user.role === 'ADMIN') {
      throw new ForbiddenException('Ce compte ne peut pas déposer d’avis sur cette boutique.');
    }
    if (user.phone && [shop.whatsapp, shop.phone].includes(user.phone)) {
      throw new ForbiddenException('Ce compte ne peut pas déposer d’avis sur cette boutique.');
    }

    // Confirmation du client : il doit connaître le numéro communiqué au vendeur lors de l'achat.
    const phone = normalizePhone(input.buyerPhone);
    if (!phone || !sale.buyerPhoneHash || hmac(phone) !== sale.buyerPhoneHash) {
      const updated = await this.prisma.reviewToken.update({
        where: { id: t!.id },
        data: { failedAttempts: { increment: 1 } },
      });
      if (updated.failedAttempts >= MAX_TOKEN_ATTEMPTS) {
        await this.prisma.reviewToken.updateMany({
          where: { id: t!.id, status: 'ACTIVE' },
          data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: 'Trop de tentatives' },
        });
        await this.audit.log(userId, 'review_token.locked', 'Sale', sale.id);
        throw new HttpException(
          { message: 'Trop de tentatives incorrectes : ce code a été désactivé. Demandez un nouveau code au vendeur.', code: 'TOKEN_LOCKED' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new BadRequestException({
        message: `Ce numéro ne correspond pas à celui indiqué par le vendeur lors de l’achat. Tentatives restantes : ${MAX_TOKEN_ATTEMPTS - updated.failedAttempts}.`,
        code: 'PHONE_MISMATCH',
      });
    }

    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new BadRequestException('La note doit être comprise entre 1 et 5.');
    }
    const comment = input.comment?.trim() || null;
    const fingerprint = comment ? commentFingerprint(comment) : null;

    // Contrôles automatiques de cohérence.
    const now = Date.now();
    const since90 = new Date(now - 90 * DAY);
    const [buyerSalesSameShop, phoneReuseSameShop, shopConfirmedLast24h, shopConfirmedTotal, duplicate] = await Promise.all([
      this.prisma.sale.count({ where: { shopId: sale.shopId, buyerId: userId, confirmedAt: { gte: since90 }, id: { not: sale.id } } }),
      this.prisma.sale.count({ where: { shopId: sale.shopId, buyerPhoneHash: sale.buyerPhoneHash, createdAt: { gte: since90 }, id: { not: sale.id } } }),
      this.prisma.sale.count({ where: { shopId: sale.shopId, confirmedAt: { gte: new Date(now - DAY) } } }),
      this.prisma.sale.count({ where: { shopId: sale.shopId, confirmedAt: { not: null } } }),
      fingerprint && fingerprint.length >= 10 ? this.prisma.review.count({ where: { commentHash: fingerprint } }) : Promise.resolve(0),
    ]);
    const flags: SaleFlag[] = evaluateSale({
      buyerSalesSameShop,
      phoneReuseSameShop,
      shopConfirmedLast24h,
      shopConfirmedTotal,
      shopIsNew: !!shop.validatedAt && shop.validatedAt.getTime() > now - 14 * DAY,
      duplicateComment: duplicate > 0,
      comment,
    });
    const saleSuspicious = flags.some((f) => f.scope === 'sale');
    const contentHeld = flags.some((f) => f.scope === 'content');

    const review = await this.prisma.$transaction(async (tx) => {
      // Consommation atomique du jeton : une seule soumission concurrente peut réussir.
      const consumed = await tx.reviewToken.updateMany({
        where: { id: t!.id, status: 'ACTIVE', expiresAt: { gt: new Date() } },
        data: { status: 'USED', usedAt: new Date() },
      });
      if (consumed.count !== 1) this.fail('USED');

      const saleUpdate = await tx.sale.updateMany({
        where: { id: sale.id, status: 'DECLARED' },
        data: {
          buyerId: userId,
          confirmedAt: new Date(),
          status: saleSuspicious ? 'PENDING_VERIFICATION' : 'VERIFIED',
          verifiedAt: saleSuspicious ? null : new Date(),
          flags: flags as unknown as Prisma.InputJsonValue,
        },
      });
      if (saleUpdate.count !== 1) this.fail('USED');

      // La contrainte d'unicité sur saleId garantit au plus un avis par vente.
      const created = await tx.review.create({
        data: {
          authorId: userId,
          productId: sale.productId,
          shopId: sale.shopId,
          saleId: sale.id,
          rating: input.rating,
          comment,
          commentHash: fingerprint,
          status: saleSuspicious || contentHeld ? 'PENDING' : 'PUBLISHED',
          verification: saleSuspicious ? 'PENDING' : 'VERIFIED_PURCHASE',
        },
      });
      await this.reviews.recompute(tx, sale.productId, sale.shopId);
      await this.audit.log(userId, 'review.submit', 'Review', created.id, { saleId: sale.id, flags: flags.map((f) => f.code) }, tx);
      return created;
    });

    if (review.status === 'PUBLISHED') await this.revalidation.product(sale.productId);
    return {
      id: review.id,
      status: review.status,
      verification: review.verification,
      message:
        review.status === 'PUBLISHED'
          ? 'Merci ! Votre avis est publié avec la mention « Achat vérifié ».'
          : 'Merci ! Votre avis a bien été enregistré. Il sera publié après un contrôle de notre équipe de modération.',
    };
  }
}
