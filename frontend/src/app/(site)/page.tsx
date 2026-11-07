import Link from 'next/link';
import { BadgeCheck, ChevronRight, Laptop, MessageCircle, QrCode, ReceiptText, Search, SearchX, ShieldCheck, Smartphone, Store, Tag, Tv, Wrench } from 'lucide-react';
import { SortSelect } from '@/components/product/catalog-filters';
import { InfiniteProductGrid } from '@/components/ui/infinite-list';
import { FeatureCarousel } from '@/components/home/feature-carousel';
import { slidesFromAds, slidesFromPromotions } from '@/components/home/hero-slides';
import { LineupTile } from '@/components/home/lineup-tile';
import { ScrollRow } from '@/components/home/scroll-row';
import { EmptyState } from '@/components/ui/misc';
import { ShopCard } from '@/components/shop/shop-card';
import { ButtonLink } from '@/components/ui/button';
import { brand } from '@/config/brand';
import { apiGet, cacheTags, toQuery } from '@/lib/api-server';
import { MAIN_CATEGORIES, PRODUCT_TYPES, plural } from '@/lib/format';
import type { HomeData, Page, ProductCard } from '@/lib/types';


const CATEGORY_ICONS = { telephones: Smartphone, ordinateurs: Laptop, 'smart-tv': Tv } as const;
const SORTS = ['recent', 'price_asc', 'price_desc', 'discount', 'rating', 'popular'];
const EMPTY_PAGE: Page<ProductCard> = { items: [], page: 1, pageSize: 24, total: 0, totalPages: 0 };

/** Arguments « Pourquoi acheter ici » : ce que la plateforme garantit réellement. */
const REASONS = [
  { Icon: MessageCircle, tone: 'bg-whatsapp/10 text-whatsapp', eyebrow: 'Commande sur WhatsApp', title: 'Un message, et le vendeur vous répond.', text: 'Vous discutez directement avec la boutique, sans compte ni carte bancaire.' },
  { Icon: QrCode, tone: 'bg-brand-50 text-brand-600', eyebrow: 'Avis vérifiés', title: 'Seuls les vrais acheteurs notent.', text: 'Chaque avis passe par le QR code remis au moment de la vente.' },
  { Icon: BadgeCheck, tone: 'bg-ok-50 text-ok', eyebrow: 'Boutiques validées', title: 'Des vendeurs examinés un par un.', text: 'L’équipe vérifie chaque boutique avant qu’elle apparaisse sur le site.' },
  { Icon: ReceiptText, tone: 'bg-promo-50 text-promo-700', eyebrow: 'Prix transparents', title: 'Un prix barré qui dit vrai.', text: 'Le prix barré est le plus bas pratiqué ces 30 derniers jours.' },
  { Icon: Wrench, tone: 'bg-paper-2 text-ink-2', eyebrow: 'Achat serein', title: 'Vérifiez, puis payez.', text: 'Contrôlez l’IMEI, la batterie et l’état de l’appareil avant de régler le vendeur.' },
] as const;

/** Titre de section façon apple.com : phrase courte terminée par un point, lien discret à droite. */
function SectionHead({ id, title, href, link }: { id?: string; title: string; href?: string; link?: string }) {
  return (
    <div className="container-page mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 md:mb-10">
      <h2 id={id} className="display text-[32px] md:text-[48px]">{title}</h2>
      {href && link && (
        <Link href={href} className="inline-flex items-center gap-0.5 text-[17px] text-brand-600 hover:underline">
          {link} <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

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
  // Cartes vedettes : publicités de l'administration, sinon promotions en cours des boutiques.
  const slides = data.heroAds?.length ? slidesFromAds(data.heroAds) : slidesFromPromotions(data.promotions);

  // Rangée d'icônes sous le titre : une photo par marque (prise parmi les annonces affichées), puis les raccourcis.
  const pool = [...data.promotions, ...data.newest, ...data.popular];
  const brandItems = data.brands.map((b) => ({ href: `/catalogue?brand=${b.slug}`, label: b.name === 'Xiaomi' ? 'Xiaomi' : b.name, img: pool.find((p) => p.brand.slug === b.slug)?.image?.thumbUrl ?? null }));
  const shortcuts = [
    { href: '/promotions', label: 'Promo du jour', Icon: Tag, note: data.promotions.length ? '24 h' : null },
    { href: '/boutiques', label: 'Boutiques', Icon: Store, note: null },
    { href: '/catalogue', label: 'Tout voir', Icon: Search, note: null },
    { href: '/devenir-vendeur', label: 'Vendre', Icon: ShieldCheck, note: null },
  ];

  return (
    <>
      {/* En-tête : grand titre, recherche, puis rangée de marques et raccourcis. */}
      <section className="bg-surface">
        <div className="container-page pt-[164px] md:pt-[128px]">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="display text-[48px] md:text-[80px]">{brand.name}</h1>
              <p className="mt-1 text-[19px] text-muted md:text-[21px]">{brand.motto}.</p>
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
          <ul className="scroller gap-6 px-4 pb-2 sm:px-6 md:gap-8 md:pl-[max(1.5rem,calc((100vw-76rem)/2+1.5rem))]">
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
            {shortcuts.map(({ href, label, Icon, note }) => (
              <li key={href} className="shrink-0">
                <Link href={href} className="group flex w-[76px] flex-col items-center gap-2 text-center">
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-canvas text-ink-2 transition-transform duration-200 group-hover:scale-105">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <span className="text-[12px] font-medium leading-tight text-ink group-hover:text-brand-600">
                    {label}
                    {note && <span className="block text-[11px] font-semibold text-promo-700">{note}</span>}
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

      {data.promotions.length > 0 && (
        <section aria-labelledby="promo" className="bg-canvas pt-16 md:pt-24">
          <SectionHead id="promo" title="Promo du jour." href="/promotions" link="Toutes les promos" />
          <ScrollRow label="Promo du jour" auto>
            {data.promotions.map((p) => <LineupTile key={p.id} product={p} />)}
          </ScrollRow>
        </section>
      )}

      <section aria-labelledby="pourquoi" className="bg-canvas py-16 md:py-24">
        <SectionHead id="pourquoi" title={`Pourquoi acheter sur ${brand.name}.`} href="/comment-ca-marche" link="Comment ça marche" />
        <ScrollRow label={`Pourquoi acheter sur ${brand.name}`}>
          {REASONS.map(({ Icon, tone, eyebrow, title, text }) => (
            <article key={eyebrow} className="flex h-[340px] w-[78vw] max-w-[340px] shrink-0 flex-col rounded-[28px] bg-surface p-7 md:h-[440px] md:p-8 transition-transform duration-300 hover:scale-[1.01] sm:w-[340px]">
              <p className="text-[13px] font-semibold text-ink-2">{eyebrow}</p>
              <h3 className="display mt-2 text-[26px]">{title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{text}</p>
              <span className={`mt-auto flex size-20 items-center justify-center self-center rounded-[26px] md:size-28 md:rounded-[32px] ${tone}`}>
                <Icon className="size-12" strokeWidth={1.5} aria-hidden />
              </span>
            </article>
          ))}
        </ScrollRow>
      </section>

      {data.newest.length > 0 && (
        <section aria-labelledby="nouveautes" className="bg-surface pt-16 md:pt-24">
          <SectionHead id="nouveautes" title="Nouveautés." href="/catalogue" link="Tout le catalogue" />
          <ScrollRow label="Nouveautés" auto>
            {data.newest.map((p) => (
              <div key={p.id} className="shrink-0 [&_article>div:first-child]:bg-canvas">
                <LineupTile product={p} />
              </div>
            ))}
          </ScrollRow>
        </section>
      )}

      {data.shops.length > 0 && (
        <section aria-labelledby="boutiques" className="bg-surface py-16 md:py-24">
          <SectionHead id="boutiques" title="Des boutiques validées." href="/boutiques" link="Toutes les boutiques" />
          <ScrollRow label="Boutiques" auto>
            {data.shops.map((s) => (
              <div key={s.id} className="w-[85vw] max-w-[380px] shrink-0">
                <ShopCard shop={s} />
              </div>
            ))}
          </ScrollRow>
        </section>
      )}

      <div className="bg-canvas py-16 md:py-24">
        <div className="container-page space-y-6">
        <section id="produits" aria-labelledby="tous-les-produits" className="scroll-mt-36 md:scroll-mt-28">
          <p className="eyebrow mb-1 text-promo-700">{category ? category.label : 'Tout le catalogue'}</p>
          <h2 id="tous-les-produits" className="display mb-6 text-[32px] text-ink md:text-[48px]">
            Tous les produits.
          </h2>
          <div className="mb-4">
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
                        active ? 'border-ink bg-ink text-white' : 'border-transparent bg-surface text-ink hover:border-line-2'
                      } ${count || active ? '' : 'opacity-60'}`}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate">{c.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            </div>

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
                      active ? 'border-ink bg-ink text-white' : 'border-transparent bg-surface text-ink-2 hover:border-line-2'
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
      </div>

      {/* Deux grandes cartes, façon « essentiels » : vendre et comprendre le fonctionnement. */}
      <section aria-labelledby="vendre" className="bg-surface py-16 md:py-24">
        <div className="container-page">
          <h2 id="vendre" className="display mb-8 text-[32px] md:mb-10 md:text-[48px]">Vous vendez des téléphones.</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="flex min-h-[380px] flex-col items-center rounded-[28px] bg-canvas px-8 pt-12 text-center">
              <h3 className="display text-[28px]">Ouvrez votre boutique.</h3>
              <p className="mt-3 max-w-sm text-[17px] text-ink-2">Gratuite, gérée depuis votre téléphone. Les clients vous écrivent directement sur WhatsApp.</p>
              <Link href="/devenir-vendeur" className="mt-4 inline-flex items-center gap-0.5 text-[17px] text-brand-600 hover:underline">
                Devenir vendeur <ChevronRight className="size-4" aria-hidden />
              </Link>
              <span className="mt-auto mb-10 flex size-28 items-center justify-center rounded-[32px] bg-surface text-navy">
                <Store className="size-12" strokeWidth={1.5} aria-hidden />
              </span>
            </div>
            <div className="flex min-h-[380px] flex-col items-center rounded-[28px] bg-ink px-8 pt-12 text-center text-white">
              <h3 className="display text-[28px]">Comment ça marche.</h3>
              <p className="mt-3 max-w-sm text-[17px] text-white/75">Publier, recevoir les commandes, enregistrer les ventes et récolter des avis vérifiés.</p>
              <Link href="/comment-ca-marche" className="mt-4 inline-flex items-center gap-0.5 text-[17px] text-promo-100 hover:underline">
                Tout comprendre en 2 minutes <ChevronRight className="size-4" aria-hidden />
              </Link>
              <span className="mt-auto mb-10 flex size-28 items-center justify-center rounded-[32px] bg-white/10">
                <QrCode className="size-12" strokeWidth={1.5} aria-hidden />
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
