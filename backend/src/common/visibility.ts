import { Prisma } from '@prisma/client';

/**
 * Règles de visibilité publique — source unique utilisée par toutes les requêtes publiques
 * (catalogue, boutique, promotions, favoris, sitemap) pour garantir des pages cohérentes.
 */

/** Annonce consultable publiquement : publiée, approuvée, non retirée par l'administration, boutique active. */
export function publicProductWhere(): Prisma.ProductWhereInput {
  return { status: 'PUBLISHED', moderation: 'APPROVED', removedAt: null, shop: { status: 'ACTIVE' } };
}

/** Annonce listée dans les catalogues : consultable et non « retirée de la vente ». */
export function listedProductWhere(): Prisma.ProductWhereInput {
  return { ...publicProductWhere(), availability: { not: 'WITHDRAWN' } };
}

/**
 * Promotion appliquée à l'instant `now` : activée, dans sa période de validité,
 * sur une annonce publique et disponible. L'activation et l'expiration sont donc automatiques.
 */
export function runningPromotionWhere(now = new Date()): Prisma.PromotionWhereInput {
  return {
    status: 'ACTIVE',
    startsAt: { lte: now },
    endsAt: { gt: now },
    product: { ...publicProductWhere(), availability: 'AVAILABLE' },
  };
}

/**
 * Équivalent SQL de runningPromotionWhere pour le moteur de recherche (alias produit : p, promotion : pr).
 * Les promotions en cours sont peu nombreuses : une jointure par hachage sur leur ensemble est bien plus
 * rapide qu'une sous-requête évaluée pour chaque annonce (mesuré : 650 ms → voir docs/RAPPORT-OPTIMISATION.md).
 */
export const RUNNING_PROMOTIONS_CTE = Prisma.sql`
  running_promotions AS (
    SELECT DISTINCT ON (x."productId") x."productId", x."promoPrice", x."referencePrice"
    FROM "Promotion" x
    WHERE x.status = 'ACTIVE' AND x."startsAt" <= now() AND x."endsAt" > now()
    ORDER BY x."productId", x."promoPrice" ASC
  )`;
export const RUNNING_PROMOTIONS_JOIN = Prisma.sql`
  LEFT JOIN running_promotions pr ON pr."productId" = p.id AND p.availability = 'AVAILABLE'`;

export function publicShopWhere(): Prisma.ShopWhereInput {
  return { status: 'ACTIVE' };
}
