/**
 * Contrôles automatiques appliqués lors de la confirmation d'une vente par le client.
 *
 * Portée « sale » : la vente part en examen administratif (PENDING_VERIFICATION) et l'avis
 * n'est pas publié tant qu'un administrateur ne l'a pas validée.
 * Portée « content » : la vente peut être vérifiée, mais le commentaire attend une modération.
 */
export interface SaleFlag {
  code: string;
  scope: 'sale' | 'content';
  label: string;
}

export interface CheckContext {
  /** Autres ventes de la même boutique confirmées par ce compte (90 derniers jours). */
  buyerSalesSameShop: number;
  /** Autres ventes de la même boutique déclarées avec le même numéro d'acheteur (90 jours). */
  phoneReuseSameShop: number;
  /** Ventes de la boutique confirmées dans les dernières 24 h. */
  shopConfirmedLast24h: number;
  /** La boutique a été validée il y a moins de 14 jours. */
  shopIsNew: boolean;
  /** Ventes confirmées de la boutique depuis sa validation. */
  shopConfirmedTotal: number;
  /** Le même commentaire existe déjà dans un autre avis. */
  duplicateComment: boolean;
  comment?: string | null;
}

const URL_RE = /(https?:\/\/|www\.)\S+/i;
const PHONE_RE = /(\+?\d[\d .-]{7,}\d)/;

export function evaluateSale(ctx: CheckContext): SaleFlag[] {
  const flags: SaleFlag[] = [];
  if (ctx.buyerSalesSameShop >= 2) {
    flags.push({ code: 'BUYER_REPEAT_SHOP', scope: 'sale', label: 'Ce compte a déjà confirmé plusieurs achats dans cette boutique.' });
  }
  if (ctx.phoneReuseSameShop >= 2) {
    flags.push({ code: 'PHONE_REUSED', scope: 'sale', label: 'Le même numéro d’acheteur apparaît dans plusieurs ventes de la boutique.' });
  }
  if (ctx.shopConfirmedLast24h >= 10) {
    flags.push({ code: 'HIGH_VOLUME', scope: 'sale', label: 'Volume inhabituel de ventes confirmées sur 24 h.' });
  }
  if (ctx.shopIsNew && ctx.shopConfirmedTotal >= 5) {
    flags.push({ code: 'NEW_SHOP_BURST', scope: 'sale', label: 'Nombreuses ventes confirmées pour une boutique récente.' });
  }
  if (ctx.duplicateComment) {
    flags.push({ code: 'DUPLICATE_COMMENT', scope: 'content', label: 'Commentaire identique à un autre avis.' });
  }
  if (ctx.comment && (URL_RE.test(ctx.comment) || PHONE_RE.test(ctx.comment))) {
    flags.push({ code: 'COMMENT_CONTACT', scope: 'content', label: 'Le commentaire contient un lien ou un numéro de téléphone.' });
  }
  return flags;
}

export const MAX_TOKEN_ATTEMPTS = 5;
