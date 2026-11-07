/**
 * Textes et réglages de la page d'accueil, réunis ici pour les modifier sans toucher à la mise en page.
 * Chaque section de l'accueil (components/home/sections/) lit ce fichier.
 */
import { BadgeCheck, MessageCircle, QrCode, ReceiptText, Search, ShieldCheck, Store, Tag, Wrench } from 'lucide-react';

/** Titres des sections (une phrase courte terminée par un point, façon apple.com). */
export const HOME_TITLES = {
  promo: 'Promo du jour.',
  reasons: (siteName: string) => `Pourquoi acheter sur ${siteName}.`,
  newest: 'Nouveautés.',
  shops: 'Des boutiques validées.',
  brands: 'Choisissez votre marque.',
  sell: 'Vous vendez des téléphones.',
};

/**
 * Filtres du catalogue utilisés par les rangées sans fin pour charger la suite
 * (mêmes paramètres que la page Catalogue : sort, promo, available, brand…).
 */
export const ROW_QUERIES = {
  promo: 'promo=true&sort=discount',
  newest: 'sort=recent&available=true',
  brand: (slug: string) => `brand=${slug}`,
};

/**
 * Nombre de téléphones chargés à chaque fois qu'on approche du bout d'une rangée.
 * (Ici et non dans endless-row.tsx : ce fichier est lu aussi par le serveur.)
 */
export const ROW_PAGE_SIZE = 12;

/** Nom affiché d'une marque quand il diffère du nom enregistré. */
export const BRAND_DISPLAY_NAMES: Record<string, string> = { Xiaomi: 'Xiaomi & Redmi' };

/** Raccourcis affichés après les marques, sous le titre de l'accueil. */
export const SHORTCUTS = [
  { href: '/promotions', label: 'Promo du jour', Icon: Tag, showPromoNote: true },
  { href: '/boutiques', label: 'Boutiques', Icon: Store, showPromoNote: false },
  { href: '/catalogue', label: 'Catalogue', Icon: Search, showPromoNote: false },
  { href: '/devenir-vendeur', label: 'Vendre', Icon: ShieldCheck, showPromoNote: false },
] as const;

/** Cartes « Pourquoi acheter ici » : uniquement ce que la plateforme garantit réellement. */
export const REASONS = [
  { Icon: MessageCircle, tone: 'bg-whatsapp/10 text-whatsapp', eyebrow: 'Commande sur WhatsApp', title: 'Un message, et le vendeur vous répond.', text: 'Vous discutez directement avec la boutique, sans compte ni carte bancaire.' },
  { Icon: QrCode, tone: 'bg-brand-50 text-brand-600', eyebrow: 'Avis vérifiés', title: 'Seuls les vrais acheteurs notent.', text: 'Chaque avis passe par le QR code remis au moment de la vente.' },
  { Icon: BadgeCheck, tone: 'bg-ok-50 text-ok', eyebrow: 'Boutiques validées', title: 'Des vendeurs examinés un par un.', text: 'L’équipe vérifie chaque boutique avant qu’elle apparaisse sur le site.' },
  { Icon: ReceiptText, tone: 'bg-promo-50 text-promo-700', eyebrow: 'Prix transparents', title: 'Un prix barré qui dit vrai.', text: 'Le prix barré est le plus bas pratiqué ces 30 derniers jours.' },
  { Icon: Wrench, tone: 'bg-paper-2 text-ink-2', eyebrow: 'Achat serein', title: 'Vérifiez, puis payez.', text: 'Contrôlez l’IMEI, la batterie et l’état de l’appareil avant de régler le vendeur.' },
] as const;
