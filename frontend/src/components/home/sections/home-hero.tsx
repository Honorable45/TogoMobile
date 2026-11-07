import Link from 'next/link';
import { Search } from 'lucide-react';
import { brand } from '@/config/brand';
import { SHORTCUTS } from '@/config/home-content';
import type { HomeData } from '@/lib/types';
import { FeatureCarousel } from '../feature-carousel';
import { slidesFromAds, slidesFromPromotions } from '../hero-slides';

/**
 * Haut de l'accueil : accroche, recherche (ordinateur), rangée d'icônes (marques puis raccourcis)
 * et grand carrousel. Sur téléphone, le logo est déjà dans l'en-tête : l'accroche sert de titre.
 */
export function HomeHero({ data }: { data: HomeData }) {
  // Une photo par marque, prise parmi les téléphones déjà chargés pour l'accueil.
  const pool = [...data.promotions, ...data.newest, ...data.popular];
  const brandItems = data.brands.map((b) => ({
    href: `/catalogue?brand=${b.slug}`,
    label: b.name,
    img: pool.find((p) => p.brand.slug === b.slug)?.image?.thumbUrl ?? null,
  }));
  const hasPromos = data.promotions.length > 0;
  // Carrousel : publicités de l'administration s'il y en a, sinon les promotions en cours.
  const slides = data.heroAds?.length ? slidesFromAds(data.heroAds) : slidesFromPromotions(data.promotions);

  return (
    <section className="bg-surface">
      <div className="container-page pt-[164px] md:pt-[128px]">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1>
              <span className="sr-only">{brand.name}</span>
              {/* Logotype en grand, comme « iPhone » sur apple.com */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo.svg" alt="" width={366} height={96} className="hidden h-12 w-auto bg-transparent md:block md:h-[76px]" />
            </h1>
            <p className="display text-[32px] leading-tight text-ink md:mt-1 md:font-sans md:text-[21px] md:font-normal md:tracking-normal md:text-muted">{brand.motto}.</p>
          </div>
          <form action="/catalogue" role="search" className="hidden w-full max-w-sm md:block">
            <label htmlFor="home-search" className="sr-only">Rechercher un téléphone</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted" aria-hidden />
              <input
                id="home-search"
                name="q"
                type="search"
                enterKeyHint="search"
                placeholder="Rechercher un téléphone"
                className="h-12 w-full rounded-full bg-canvas pl-11 pr-4 text-[15px] placeholder:text-faint focus:outline-2 focus:outline-brand-600"
              />
            </div>
          </form>
        </div>
      </div>
      <nav aria-label="Marques et raccourcis" className="mt-8 md:mt-12">
        <ul className="scroller gap-3 px-4 pb-2 sm:px-6 md:gap-8 md:pl-[max(1.5rem,calc((100vw-76rem)/2+1.5rem))]">
          {brandItems.map((b) => (
            <li key={b.href} className="shrink-0">
              <Link href={b.href} className="group flex w-[76px] flex-col items-center gap-2 text-center">
                <span className="size-14 overflow-hidden rounded-2xl bg-canvas transition-transform duration-200 group-hover:scale-105">
                  {b.img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.img} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-lg font-semibold text-ink-2">{b.label.charAt(0)}</span>
                  )}
                </span>
                <span className="text-[12px] font-medium text-ink group-hover:text-brand-600">{b.label}</span>
              </Link>
            </li>
          ))}
          {SHORTCUTS.map(({ href, label, Icon, showPromoNote }) => (
            <li key={href} className="shrink-0">
              <Link href={href} className="group flex w-[76px] flex-col items-center gap-2 text-center">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-canvas text-ink-2 transition-transform duration-200 group-hover:scale-105">
                  <Icon className="size-6" aria-hidden />
                </span>
                <span className="text-[12px] font-medium leading-tight text-ink group-hover:text-brand-600">
                  {label}
                  {showPromoNote && hasPromos && <span className="block text-[11px] font-semibold text-promo-700">24 h</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="pb-16 pt-10 md:pb-24 md:pt-14">
        <FeatureCarousel slides={slides} />
      </div>
    </section>
  );
}
