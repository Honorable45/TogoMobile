import Link from 'next/link';
import { ArrowRight, Search, ShieldCheck, Smartphone, Store, Tag } from 'lucide-react';
import { RevealWords, revealEnd } from '@/components/layout/reveal';
import { ProductRow } from '@/components/product/product-card';
import { HeroBackdrop } from '@/components/home/hero-backdrop';
import { slidesFromAds, slidesFromPromotions } from '@/components/home/hero-slides';
import { ShopCard } from '@/components/shop/shop-card';
import { FacebookIcon, InstagramIcon, TikTokIcon } from '@/components/ui/brand-icons';
import { ButtonLink, buttonClass } from '@/components/ui/button';
import { EmptyState, SectionTitle } from '@/components/ui/misc';
import { brand } from '@/config/brand';
import { apiGet, cacheTags } from '@/lib/api-server';
import type { HomeData } from '@/lib/types';

const NAME_STEP = 180;
const MOTTO_STEP = 110;

export default async function HomePage() {
  // Repli si l'API est momentanément injoignable (y compris pendant le build).
  const data = await apiGet<HomeData>('/home', { tags: [cacheTags.home, cacheTags.catalog] }).catch((): HomeData => ({ heroAds: [], brands: [], newest: [], popular: [], promotions: [], shops: [] }));
  // Fond de l'accueil : publicités de l'administration, sinon promotions en cours des boutiques.
  const slides = data.heroAds?.length ? slidesFromAds(data.heroAds) : slidesFromPromotions(data.promotions);
  const nameEnd = revealEnd(brand.name, 150, NAME_STEP);
  const mottoStart = nameEnd - 350;
  const buttonsDelay = revealEnd(brand.motto, mottoStart, MOTTO_STEP);
  const social = [
    { href: brand.social.facebook, label: 'Facebook', Icon: FacebookIcon },
    { href: brand.social.instagram, label: 'Instagram', Icon: InstagramIcon },
    { href: brand.social.tiktok, label: 'TikTok', Icon: TikTokIcon },
  ].filter((s) => s.href);

  return (
    <>
      <section className="relative isolate flex min-h-[100svh] items-center justify-center overflow-hidden bg-navy text-white">
        {slides.length > 0 ? (
          <HeroBackdrop slides={slides} />
        ) : brand.heroImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.heroImage} alt="" className="absolute inset-0 -z-20 size-full object-cover" fetchPriority="high" />
            <div className="absolute inset-0 -z-10 bg-navy/55" aria-hidden />
          </>
        ) : null}
        <div className={`container-page flex flex-col items-center pt-40 text-center md:pt-32 ${slides.length ? 'pb-48 sm:pb-44' : 'pb-16'}`}>
          <h1 className="display text-[64px] md:text-[104px] lg:text-[128px]">
            <RevealWords text={brand.name} start={150} step={NAME_STEP} />
          </h1>
          <p className="display mt-4 max-w-2xl text-[22px] italic text-white/90 md:text-[30px]">
            <RevealWords text={brand.motto} start={mottoStart} step={MOTTO_STEP} />
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3 opacity-0 animate-slide-up" style={{ animationDelay: `${buttonsDelay}ms` }}>
            <ButtonLink href="/catalogue" variant="glass" size="lg">
              <Smartphone className="size-5" aria-hidden /> Catalogue
            </ButtonLink>
            <ButtonLink href="/promotions" variant="glass" size="lg">
              <Tag className="size-5" aria-hidden /> Promotions
            </ButtonLink>
            <ButtonLink href="/devenir-vendeur" variant="glass" size="lg">
              <Store className="size-5" aria-hidden /> Vendre
            </ButtonLink>
          </div>
          {social.length > 0 && (
            <div className="mt-8 flex gap-2 opacity-0 animate-slide-up" style={{ animationDelay: `${buttonsDelay + 150}ms` }}>
              {social.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} className="glass inline-flex size-11 items-center justify-center rounded-full">
                  <s.Icon className="size-[18px]" />
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="container-page space-y-16 py-16 md:space-y-24 md:py-24">
        <section aria-labelledby="recherche">
          <p className="eyebrow mb-2">Recherche</p>
          <h2 id="recherche" className="display mb-5 text-[26px] sm:text-[36px]">
            Quel téléphone cherchez-vous ?
          </h2>
          <form action="/catalogue" role="search" className="glass-light flex flex-col gap-2 rounded-3xl p-2 sm:flex-row sm:rounded-full">
            <label htmlFor="home-search" className="sr-only">
              Rechercher un téléphone
            </label>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
              <input
                id="home-search"
                name="q"
                type="search"
                enterKeyHint="search"
                placeholder="Marque, modèle ou référence"
                className="h-14 w-full rounded-full border border-line-2 bg-surface pl-12 pr-4 text-base placeholder:text-faint focus:border-brand-600 focus:outline-none"
              />
            </div>
            <button type="submit" className={buttonClass('primary', 'lg')}>
              Rechercher
            </button>
          </form>
          {data.brands.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2" aria-label="Marques">
              {data.brands.map((b) => (
                <li key={b.id}>
                  <Link href={`/catalogue?brand=${b.slug}`} className="inline-flex h-11 items-center rounded-full border border-line-2 bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-navy">
                    {b.name === 'Xiaomi' ? 'Xiaomi & Redmi' : b.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/catalogue" className="inline-flex h-11 items-center gap-1 px-2 text-sm font-medium text-brand-600 underline underline-offset-4">
                  Autres marques <ArrowRight className="size-4" aria-hidden />
                </Link>
              </li>
            </ul>
          )}
        </section>

        {data.promotions.length > 0 && (
          <section>
            <SectionTitle eyebrow="Offres limitées" title="Promotions en cours" href="/promotions" />
            <ProductRow products={data.promotions} />
          </section>
        )}

        <section>
          <SectionTitle eyebrow="Nouveautés" title="Récemment publiés" href="/catalogue" />
          {data.newest.length ? (
            <ProductRow products={data.newest} />
          ) : (
            <EmptyState title="Aucune annonce pour le moment">Les premières boutiques s’installent.</EmptyState>
          )}
        </section>

        {data.popular.length > 0 && (
          <section>
            <SectionTitle eyebrow="Tendances" title="Les plus consultés" href="/catalogue?sort=popular" />
            <ProductRow products={data.popular} />
          </section>
        )}

        {data.shops.length > 0 && (
          <section>
            <SectionTitle eyebrow="Boutiques" title="Récemment validées" href="/boutiques" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.shops.map((s) => (
                <ShopCard key={s.id} shop={s} />
              ))}
            </div>
          </section>
        )}
      </div>

      <section className="relative isolate overflow-hidden bg-navy">
        {brand.bannerImage && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.bannerImage} alt="" className="absolute inset-0 -z-20 size-full object-cover" loading="lazy" />
            <div className="absolute inset-0 -z-10 bg-navy/60" aria-hidden />
          </>
        )}
        <div className="container-page py-16 md:py-24">
          <div className="glass mx-auto max-w-2xl rounded-3xl p-8 text-center text-white md:p-12">
            <ShieldCheck className="mx-auto size-7 text-promo-100" aria-hidden />
            <h2 className="display mt-4 text-[32px] md:text-[40px]">Vous vendez des téléphones ?</h2>
            <p className="mt-3 text-white/80">Ouvrez votre boutique et recevez vos commandes sur WhatsApp.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/devenir-vendeur" variant="glass" size="lg">
                <Store className="size-5" aria-hidden /> Ouvrir ma boutique
              </ButtonLink>
              <ButtonLink href="/comment-ca-marche" variant="glass" size="lg">
                Comment ça marche
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
