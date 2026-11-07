import Link from 'next/link';
import { ArrowRight, Laptop, Search, SearchX, ShieldCheck, Smartphone, Store, Tv } from 'lucide-react';
import { SortSelect } from '@/components/product/catalog-filters';
import { ProductRow } from '@/components/product/product-card';
import { InfiniteProductGrid } from '@/components/ui/infinite-list';
import { AdBar } from '@/components/home/ad-bar';
import { HeroBackdrop } from '@/components/home/hero-backdrop';
import { slidesFromAds, slidesFromPromotions } from '@/components/home/hero-slides';
import { ShopCard } from '@/components/shop/shop-card';
import { ButtonLink, buttonClass } from '@/components/ui/button';
import { EmptyState, SectionTitle } from '@/components/ui/misc';
import { brand } from '@/config/brand';
import { apiGet, cacheTags, toQuery } from '@/lib/api-server';
import { MAIN_CATEGORIES, PRODUCT_TYPES, plural } from '@/lib/format';
import type { HomeData, Page, ProductCard } from '@/lib/types';

const CATEGORY_ICONS = { telephones: Smartphone, ordinateurs: Laptop, 'smart-tv': Tv } as const;
const SORTS = ['recent', 'price_asc', 'price_desc', 'discount', 'rating', 'popular'];
const EMPTY_PAGE: Page<ProductCard> = { items: [], page: 1, pageSize: 24, total: 0, totalPages: 0 };

type HomeParams = { category?: string; type?: string; sort?: string; page?: string };

/** Lien de l'accueil qui conserve les filtres courants, en remplaçant ceux donnés. */
function homeHref(current: HomeParams, patch: Partial<HomeParams>, hash = '') {
  const merged = { ...current, page: undefined, ...patch };
  return `/${toQuery({ category: merged.category, type: merged.type, sort: merged.sort, page: merged.page })}${hash}`;
}

export default async function HomePage({ searchParams }: { searchParams: Promise<HomeParams> }) {
  const sp = await searchParams;
  const category = MAIN_CATEGORIES.find((c) => c.slug === sp.category);
  const type = PRODUCT_TYPES.find((t) => t.slug === sp.type);
  const sort = sp.sort && SORTS.includes(sp.sort) ? sp.sort : 'recent';
  const page = Math.min(1000, Math.max(1, Number(sp.page) || 1));
  const current: HomeParams = { category: category?.slug, type: type?.slug, sort: sort === 'recent' ? undefined : sort };
  const tags = [cacheTags.catalog];
  const productsPath = `/catalog/products${toQuery({ category: category?.slug, condition: type ? [...type.conditions] : undefined, sort, pageSize: 24 })}`;

  // Repli si l'API est momentanément injoignable (y compris pendant le build).
  const [data, products, ...categoryPages] = await Promise.all([
    apiGet<HomeData>('/home', { tags: [cacheTags.home, cacheTags.catalog] }).catch((): HomeData => ({ heroAds: [], brands: [], newest: [], popular: [], promotions: [], shops: [] })),
    apiGet<Page<ProductCard>>(`${productsPath}${productsPath.includes('?') ? '&' : '?'}page=${page}`, { tags }).catch(() => EMPTY_PAGE),
    ...MAIN_CATEGORIES.map((c) => apiGet<Page<ProductCard>>(`/catalog/products?category=${c.slug}&pageSize=1`, { tags }).catch(() => EMPTY_PAGE)),
  ]);
  const categoryCount = new Map(MAIN_CATEGORIES.map((c, i) => [c.slug, categoryPages[i].total]));
  // Fond de l'accueil : publicités de l'administration, sinon promotions en cours des boutiques.
  const slides = data.heroAds?.length ? slidesFromAds(data.heroAds) : slidesFromPromotions(data.promotions);

  return (
    <>
      {/* Ordinateur : bannière d'affiches publicitaires, sans texte. Mobile : barre de pubs dans l'en-tête. */}
      <h1 className="sr-only">{brand.name} : {brand.motto}</h1>
      {slides.length > 0 ? (
        <section aria-label="Publicités" className="container-page hidden pt-[100px] md:block">
          <HeroBackdrop slides={slides} />
        </section>
      ) : brand.heroImage ? (
        <div className="container-page hidden pt-[100px] md:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.heroImage} alt="" className="aspect-[8/3] w-full rounded-[32px] object-cover" fetchPriority="high" />
        </div>
      ) : null}

      {/* Mobile : publicités dans l'en-tête, au-dessus de la recherche (repliées au défilement). */}
      <AdBar slides={slides} />
      <div className={`container-page space-y-8 pb-16 md:space-y-24 md:pb-24 md:pt-16 ${slides.length ? 'pt-[228px]' : 'pt-[140px]'}`}>
        {/* Sur mobile, la recherche est dans l'en-tête. */}
        <section aria-labelledby="recherche" className="hidden md:block">
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

        <section aria-labelledby="categories">
          <h2 id="categories" className="sr-only">
            Catégories
          </h2>
          <ul className="grid grid-cols-3 gap-2 md:flex md:flex-wrap">
            {MAIN_CATEGORIES.map((c) => {
              const Icon = CATEGORY_ICONS[c.slug];
              const active = category?.slug === c.slug;
              const count = categoryCount.get(c.slug) ?? 0;
              return (
                <li key={c.slug}>
                  <Link
                    href={homeHref(current, { category: active ? undefined : c.slug }, '#produits')}
                    scroll={false}
                    aria-current={active ? 'true' : undefined}
                    title={count ? plural(count, 'produit', 'produits') : 'Bientôt disponible'}
                    className={`flex h-10 items-center justify-center gap-1.5 rounded-full border px-2 text-[13px] font-semibold transition-colors active:scale-[.98] md:h-11 md:px-5 md:text-sm ${
                      active ? 'border-navy bg-navy text-white' : 'border-line-2 bg-surface text-ink hover:border-navy'
                    } ${count || active ? '' : 'opacity-60'}`}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{c.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {data.promotions.length > 0 && (
          <section>
            <SectionTitle eyebrow="24 h seulement" title="Promo du jour" href="/promotions" />
            <ProductRow products={data.promotions} auto label="Promo du jour" />
          </section>
        )}

        {data.shops.length > 0 && (
          <section>
            <SectionTitle eyebrow="Boutiques" title="Récemment validées" href="/boutiques" />
            <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-3">
              {data.shops.map((s) => (
                <div key={s.id} className="w-[85%] shrink-0 snap-start sm:w-[60%] md:w-auto">
                  <ShopCard shop={s} />
                </div>
              ))}
            </div>
          </section>
        )}

        <section id="produits" aria-labelledby="tous-les-produits" className="scroll-mt-36 md:scroll-mt-28">
          <p className="eyebrow mb-2">{category ? category.label : 'Tout le catalogue'}</p>
          <h2 id="tous-les-produits" className="display mb-4 text-[26px] text-ink sm:text-[36px]">
            Tous les produits
          </h2>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Type de produit" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5">
              {[{ slug: undefined, label: 'Tous', hint: undefined as string | undefined }, ...PRODUCT_TYPES].map((t) => {
                const active = type?.slug === t.slug;
                return (
                  <Link
                    key={t.label}
                    href={homeHref(current, { type: t.slug }, '#produits')}
                    scroll={false}
                    title={'hint' in t ? t.hint : undefined}
                    aria-current={active ? 'true' : undefined}
                    className={`inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors ${
                      active ? 'border-navy bg-navy text-white' : 'border-line-2 bg-surface text-ink-2 hover:border-muted'
                    }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
            <SortSelect value={sort} />
          </div>
          <p className="mb-4 text-sm text-muted" aria-live="polite">
            <span className="font-bold text-ink">{plural(products.total, 'produit', 'produits')}</span>
            {type && ` · ${type.label.toLowerCase()}`}
          </p>
          {products.items.length ? (
            <>
              <InfiniteProductGrid
                key={productsPath}
                first={products}
                path={productsPath}
                priorityCount={2}
                nextHref={homeHref(current, { page: String(products.page + 1) }, '#produits')}
              />
            </>
          ) : (
            <EmptyState
              icon={<SearchX className="size-10" />}
              title={category && !categoryCount.get(category.slug) ? `${category.label} : bientôt disponible` : 'Aucun produit pour ce choix'}
              action={
                category || type ? (
                  <ButtonLink href="/#produits" variant="outline">
                    Voir tous les produits
                  </ButtonLink>
                ) : undefined
              }
            >
              {category && !categoryCount.get(category.slug)
                ? 'Les boutiques ajoutent leurs premiers articles dans ce rayon.'
                : 'Essayez un autre type ou une autre catégorie.'}
            </EmptyState>
          )}
        </section>

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
