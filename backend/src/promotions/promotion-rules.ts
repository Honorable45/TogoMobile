import type { Promotion, PromotionStatus } from '@prisma/client';

/** Pourcentage de réduction, arrondi à l'inférieur pour ne jamais exagérer l'avantage annoncé. */
export function discountPercent(referencePrice: number, promoPrice: number): number {
  if (referencePrice <= 0 || promoPrice >= referencePrice) return 0;
  return Math.floor(((referencePrice - promoPrice) / referencePrice) * 100);
}

/**
 * Prix de référence d'une promotion : le prix le plus bas pratiqué pour ce produit
 * pendant les N derniers jours (prix actuel inclus). Empêche d'afficher un prix barré
 * gonflé artificiellement juste avant une promotion.
 */
export function referencePrice(currentPrice: number, recentPrices: number[]): number {
  return Math.min(currentPrice, ...recentPrices);
}

export type PromotionPhase = 'SCHEDULED' | 'RUNNING' | 'ENDED' | 'DISABLED' | 'SUSPENDED';

export function promotionPhase(p: Pick<Promotion, 'status' | 'startsAt' | 'endsAt'>, now = new Date()): PromotionPhase {
  const s: PromotionStatus = p.status;
  if (s === 'SUSPENDED') return 'SUSPENDED';
  if (s === 'DISABLED') return 'DISABLED';
  if (p.endsAt <= now) return 'ENDED';
  if (p.startsAt > now) return 'SCHEDULED';
  return 'RUNNING';
}

export interface PromotionInput {
  promoPrice: number;
  startsAt: Date;
  endsAt: Date;
}

/** Validation des règles de dates et de prix ; retourne la liste des erreurs (vide si valide). */
export function validatePromotion(
  input: PromotionInput,
  reference: number,
  opts: { now?: Date; maxDays: number },
): string[] {
  const now = opts.now ?? new Date();
  const errors: string[] = [];
  if (!Number.isInteger(input.promoPrice) || input.promoPrice <= 0) {
    errors.push('Le prix promotionnel doit être un montant positif.');
  } else if (input.promoPrice >= reference) {
    errors.push(`Le prix promotionnel doit être inférieur au prix de référence (${reference} FCFA).`);
  } else if (discountPercent(reference, input.promoPrice) < 1) {
    errors.push('La réduction doit être d’au moins 1 %.');
  }
  if (isNaN(input.startsAt.getTime()) || isNaN(input.endsAt.getTime())) {
    errors.push('Dates invalides.');
    return errors;
  }
  if (input.endsAt <= input.startsAt) errors.push('La date de fin doit être postérieure à la date de début.');
  if (input.endsAt <= now) errors.push('La date de fin doit être dans le futur.');
  // Tolérance de 5 minutes pour les horloges légèrement décalées ; pas d'antidatage.
  if (input.startsAt.getTime() < now.getTime() - 5 * 60_000) {
    errors.push('La date de début ne peut pas être dans le passé.');
  }
  if (input.endsAt.getTime() - input.startsAt.getTime() > opts.maxDays * 24 * 3600_000) {
    errors.push(`Une promotion ne peut pas durer plus de ${opts.maxDays} jours.`);
  }
  return errors;
}
