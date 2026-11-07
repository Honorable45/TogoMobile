import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgeCheck, ChevronRight, MapPin, PackageCheck } from 'lucide-react';
import { FavoriteProductButton } from '@/components/favorite-buttons';
import { Gallery } from '@/components/product/gallery';
import { ConditionPanel } from '@/components/product/detail/condition-panel';
import { InfoAccordions } from '@/components/product/detail/info-accordions';
import { OrderBar } from '@/components/product/detail/order-bar';
import { OtherOffers } from '@/components/product/detail/other-offers';
import { PriceBlock } from '@/components/product/detail/price-block';
import { TrustRows } from '@/components/product/detail/trust-rows';
import { ProductRow } from '@/components/home/endless-row';
import { ViewTracker, WhatsAppOrderButton } from '@/components/product/whatsapp-button';
import { ReportButton } from '@/components/report-button';
import { ReviewsSection } from '@/components/reviews';
import { ShopLogo } from '@/components/shop/shop-card';
import { Alert, Badge, DemoBadge, RatingInline, Stars } from '@/components/ui/misc';
import { brand } from '@/config/brand';
import { apiGet, apiGetOrNull, cacheTags } from '@/lib/api-server';
import { AVAILABILITY_LABELS, CONDITION_LABELS, fcfa, plural } from '@/lib/format';
import type { ProductCard, ProductDetail, ReviewsPage } from '@/lib/types';


type Props = { params: Promise<{ slug: string }> };

/**
 * Fiches rendues à la première visite puis servies depuis le cache (ISR), invalidées par étiquette
 * dès qu'un prix, une disponibilité, une promotion ou la boutique change.
 */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await apiGetOrNull<ProductDetail>(`/products/${slug}`, { tags: [cacheTags.product(slug)] });
  if (!p) return { title: 'Annonce indisponible', robots: { index: false } };
  const price = fcfa(p.currentPrice);
  const description = `${p.title} — ${CONDITION_LABELS[p.condition]}, ${price}${p.promotion ? ` (au lieu de ${fcfa(p.promotion.referencePrice)})` : ''}. Vendu par ${p.shop.name} à ${p.shop.city}.`;
  return {
    title: `${p.title} — ${price}`,
    description,
    alternates: { canonical: `/produits/${p.slug}` },
    robots: p.availability === 'WITHDRAWN' || p.isDemo ? { index: false, follow: true } : undefined,
    openGraph: {
      title: `${p.title} — ${price}`,
      description,
      url: `/produits/${p.slug}`,
      type: 'website',
      images: p.image ? [{ url: p.image.url, alt: p.title }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const p = await apiGetOrNull<ProductDetail>(`/products/${slug}`, { tags: [cacheTags.product(slug)] });
  if (!p) notFound();
  const [reviews, similar] = await Promise.all([
    apiGet<ReviewsPage>(`/products/${slug}/reviews?pageSize=5`, { tags: [cacheTags.product(slug)] }),
    apiGet<ProductCard[]>(`/products/${slug}/similar`, { tags: [cacheTags.catalog] }),
  ]);

  // Données structurées : uniquement des informations réelles (aucune note inventée).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    sku: p.reference,
    brand: { '@type': 'Brand', name: p.brand.name },
    image: p.media.filter((m) => m.type === 'IMAGE').map((m) => m.url),
    description: p.description ?? undefined,
    itemCondition: p.condition === 'NEW' ? 'https://schema.org/NewCondition' : p.condition === 'REFURBISHED' ? 'https://schema.org/RefurbishedCondition' : 'https://schema.org/UsedCondition',
    offers: {
      '@type': 'Offer',
      price: p.currentPrice,
      priceCurrency: 'XOF',
      availability: p.availability === 'AVAILABLE' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `${brand.siteUrl}/produits/${p.slug}`,
      seller: { '@type': 'Organization', name: p.shop.name },
      ...(p.promotion ? { priceValidUntil: p.promotion.endsAt.slice(0, 10) } : {}),
    },
    ...(p.ratingCount > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.ratingAvg, reviewCount: p.ratingCount } } : {}),
  };

  return (
    <div className="container-page pb-16 pt-[150px] md:pt-[104px]">
      <ViewTracker productId={p.id} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      {/* Fil d'Ariane : où l'on est dans le catalogue. */}
      <nav aria-label="Fil d’Ariane" className="mb-6 flex flex-wrap items-center gap-1 text-[13px] text-muted">
        <Link href="/" className="hover:text-ink hover:underline">Accueil</Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <Link href="/catalogue" className="hover:text-ink hover:underline">Catalogue</Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <Link href={`/catalogue?brand=${p.brand.slug}`} className="hover:text-ink hover:underline">{p.brand.name}</Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="truncate text-ink-2">{p.title}</span>
      </nav>

      {/* Deux colonnes : photos fixées à gauche pendant qu'on parcourt l'offre à droite. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Gallery media={p.media} title={p.title} />
        </div>

        <div className="space-y-7">
          {/* Titre, note et prix */}
          <div className="space-y-3">
            {p.promotion && <Badge tone="promo">Promotion −{p.promotion.discountPercent} %</Badge>}
            <h1 className="display text-[30px] leading-tight sm:text-[38px]">{p.title}</h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
              {p.ratingCount > 0 ? (
                <a href="#avis" className="inline-flex items-center gap-1.5 hover:underline">
                  <Stars value={p.ratingAvg} size={14} />
                  <span className="num">{p.ratingAvg.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}/5 · {plural(p.ratingCount, 'avis vérifié', 'avis vérifiés')}</span>
                </a>
              ) : (
                <span className="text-muted">Pas encore d’avis</span>
              )}
              <span className={`inline-flex items-center gap-1 font-medium ${p.availability === 'AVAILABLE' ? 'text-ok' : 'text-warn'}`}>
                <PackageCheck className="size-4" aria-hidden /> {AVAILABILITY_LABELS[p.availability]}
              </span>
              {p.isDemo && <DemoBadge />}
            </p>
          </div>
          <PriceBlock p={p} />

          {/* Bouton principal : la barre du bas prend le relais quand il sort de l'écran. */}
          {p.availability === 'WITHDRAWN' ? (
            <Alert tone="warn" title="Ce téléphone a été retiré de la vente">
              Consultez les autres offres pour ce modèle ou les téléphones similaires ci-dessous.
            </Alert>
          ) : (
            <div id="main-cta" className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <WhatsAppOrderButton productId={p.id} orderable={p.orderable} />
              <FavoriteProductButton productId={p.id} title={p.title} variant="full" />
            </div>
          )}

          <TrustRows p={p} />
          <ConditionPanel p={p} />
          <OtherOffers p={p} />
          <InfoAccordions p={p} />

          <Link href={`/boutiques/${p.shop.slug}`} className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-4 transition-shadow hover:shadow-card">
            <ShopLogo src={p.shop.logoUrl} name={p.shop.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 font-medium">
                <span className="truncate">Vendu par {p.shop.name}</span>
                {p.shop.identityVerified && <BadgeCheck className="size-4 shrink-0 text-brand-600" aria-label="Identité vérifiée" />}
              </p>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span className="inline-flex items-center gap-0.5"><MapPin className="size-3.5" aria-hidden />{[p.shop.district, p.shop.city].filter(Boolean).join(', ')}</span>
                <span>{plural(p.shop.productCount, 'annonce', 'annonces')}</span>
              </p>
              <div className="mt-1">
                <RatingInline avg={p.shop.ratingAvg} count={p.shop.ratingCount} />
              </div>
            </div>
            <ChevronRight className="size-5 text-subtle" aria-hidden />
          </Link>
        </div>
      </div>

      <section className="mt-16 scroll-mt-28 md:mt-24" id="avis" aria-labelledby="avis-titre">
        <h2 id="avis-titre" className="display mb-6 text-[26px] sm:text-[36px]">Avis clients</h2>
        <ReviewsSection initial={reviews} endpoint={`/products/${p.slug}/reviews`} />
      </section>

      {similar.length > 0 && (
        <section className="mt-16 md:mt-24">
          <h2 className="display mb-6 text-[26px] sm:text-[36px]">Vous aimerez aussi</h2>
          <ProductRow products={similar} label={`Autres ${p.brand.name} disponibles`} query={`brand=${p.brand.slug}&available=true`} exclude={p.id} />
        </section>
      )}

      <div className="mt-10 border-t border-line pt-4">
        <ReportButton targetType="PRODUCT" targetId={p.id} label="Signaler cette annonce" />
      </div>

      {p.availability !== 'WITHDRAWN' && <OrderBar p={p} />}
    </div>
  );
}
