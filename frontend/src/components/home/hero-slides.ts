import { fcfa } from '@/lib/format';
import type { HeroAd, ProductCard } from '@/lib/types';

/** Diapositive de fond : publicité de l'administration, ou à défaut promotion d'une boutique. */
export interface HeroSlide {
  id: string;
  /** Mention obligatoire : « Publicité » ou « Promotion ». */
  kind: 'Publicité' | 'Promotion';
  source: string | null;
  title: string;
  subtitle: string | null;
  href: string | null;
  image: string;
  mobileImage: string;
}

export function slidesFromAds(ads: HeroAd[]): HeroSlide[] {
  return ads.map((a) => ({
    id: a.id,
    kind: 'Publicité',
    source: a.advertiser,
    title: a.title,
    subtitle: a.subtitle,
    href: a.linkUrl,
    image: a.imageUrl,
    mobileImage: a.mobileImageUrl,
  }));
}

export function slidesFromPromotions(cards: ProductCard[]): HeroSlide[] {
  return cards
    .filter((c) => c.image && c.promotion)
    .slice(0, 6)
    .map((c) => ({
      id: c.id,
      kind: 'Promotion',
      source: c.shop.name,
      title: c.title,
      subtitle: `${fcfa(c.currentPrice)} au lieu de ${fcfa(c.price)}`,
      href: `/produits/${c.slug}`,
      image: c.image!.url,
      mobileImage: c.image!.mediumUrl ?? c.image!.url,
    }));
}
