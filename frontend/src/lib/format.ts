import type { Availability, Condition, ReviewStatus, SaleStatus, ShopStatus } from './types';

const TZ = 'Africa/Lome';

/** 100000 → « 100 000 FCFA » (pas de décimales : le franc CFA n'en a pas). */
export function fcfa(amount: number) {
  // Espaces insécables classiques : l'espace fine (U+202F) d'Intl manque dans certaines polices.
  const n = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount).replace(/[\u202f\u00a0]/g, '\u00a0');
  return `${n}\u00a0FCFA`;
}

export function formatDate(d: string | Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, ...opts }).format(new Date(d));
}

export function formatDateTime(d: string | Date) {
  return formatDate(d, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Valeur d'un champ datetime-local, exprimée à l'heure de Lomé (UTC+0, sans heure d'été). */
export function toLomeInput(d: Date) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  return parts.replace(' ', 'T');
}

/** Interprète la saisie d'un champ datetime-local comme une heure de Lomé et renvoie un ISO UTC. */
export function fromLomeInput(value: string) {
  // Lomé est en UTC+0 toute l'année.
  return new Date(`${value}:00Z`).toISOString();
}

export function storageLabel(gb: number | null | undefined) {
  if (!gb) return null;
  return gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024} To` : `${gb} Go`;
}

export function rating(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export const CONDITION_LABELS: Record<Condition, string> = {
  NEW: 'Neuf',
  LIKE_NEW: 'Comme neuf',
  REFURBISHED: 'Reconditionné',
  USED_GOOD: 'Occasion — bon état',
  USED_FAIR: 'Occasion — état correct',
};

/** Types affichés aux acheteurs : regroupent les états détaillés saisis par les vendeurs. */
export const PRODUCT_TYPES = [
  { slug: 'neuf', label: 'Neuf', conditions: ['NEW'] },
  { slug: 'venu', label: 'Venu', hint: 'Importé, quasi neuf ou reconditionné', conditions: ['LIKE_NEW', 'REFURBISHED'] },
  { slug: 'occasion', label: 'Occasion', conditions: ['USED_GOOD', 'USED_FAIR'] },
] as const satisfies ReadonlyArray<{ slug: string; label: string; hint?: string; conditions: readonly Condition[] }>;

/** Rayons principaux du site (catégories racines, voir la migration main_categories). */
export const MAIN_CATEGORIES = [
  { slug: 'telephones', label: 'Téléphones' },
  { slug: 'ordinateurs', label: 'Ordinateurs' },
  { slug: 'smart-tv', label: 'Smart TV' },
] as const;

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  AVAILABLE: 'Disponible',
  OUT_OF_STOCK: 'En rupture de stock',
  TEMPORARILY_UNAVAILABLE: 'Temporairement indisponible',
  WITHDRAWN: 'Retiré de la vente',
};

export const SHOP_STATUS_LABELS: Record<ShopStatus, string> = {
  PENDING: 'En attente de validation',
  CHANGES_REQUESTED: 'Corrections demandées',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspendue',
  CLOSED: 'Fermée temporairement',
  REJECTED: 'Demande refusée',
};

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  DECLARED: 'Déclarée — en attente du client',
  PENDING_VERIFICATION: 'Achat en cours de vérification',
  VERIFIED: 'Vérifiée selon la procédure',
  DISPUTED: 'Contestée — suspicion de fraude',
  CANCELLED: 'Annulée — achat non vérifié',
};

export const MODERATION_LABELS = {
  PENDING: 'En attente de validation',
  APPROVED: 'Approuvée',
  REJECTED: 'Refusée — à corriger',
} as const;

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  PENDING: 'En attente de modération',
  PUBLISHED: 'Publié',
  HIDDEN: 'Masqué',
  REJECTED: 'Rejeté',
};

export const PHASE_LABELS = {
  SCHEDULED: 'Programmée',
  RUNNING: 'En cours',
  ENDED: 'Terminée',
  DISABLED: 'Désactivée',
  SUSPENDED: 'Suspendue par l’administration',
} as const;

export const SPEC_LABELS: Record<string, string> = {
  screen: 'Écran',
  processor: 'Processeur',
  battery: 'Batterie',
  batteryHealth: 'État de la batterie',
  rearCamera: 'Appareil photo arrière',
  frontCamera: 'Caméra avant',
  connectivity: 'Connectivité',
  sim: 'SIM',
  os: 'Système d’exploitation',
  dimensions: 'Dimensions',
  weight: 'Poids',
};

export function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`;
}

/**
 * Fin d'une promotion, dite comme on la dirait à voix haute (heure de Lomé) :
 * « Se termine ce soir à 23:55 », « Se termine demain à 12:00 », sinon « Jusqu’au 9 nov. ».
 */
export function promoEnds(endsAt: string | Date, now: Date = new Date()) {
  const day = (d: Date) => formatDate(d, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const end = new Date(endsAt);
  const time = formatDate(end, { hour: '2-digit', minute: '2-digit' });
  if (day(end) === day(now)) {
    const hour = parseInt(time, 10);
    return hour >= 18 ? `Se termine ce soir à ${time}` : `Se termine aujourd’hui à ${time}`;
  }
  if (day(end) === day(new Date(now.getTime() + 86_400_000))) return `Se termine demain à ${time}`;
  return `Jusqu’au ${formatDate(end, { day: 'numeric', month: 'short' })}`;
}
