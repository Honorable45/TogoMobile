import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgeCheck, CalendarClock, ChevronRight, MapPin, PackageCheck, ShieldAlert, Store, Wrench } from 'lucide-react';
import { FavoriteProductButton } from '@/components/favorite-buttons';
import { Gallery } from '@/components/product/gallery';
import { ProductRow } from '@/components/product/product-card';
import { ViewTracker, WhatsAppOrderButton } from '@/components/product/whatsapp-button';
import { ReportButton } from '@/components/report-button';
import { ReviewsSection } from '@/components/reviews';
import { ShopLogo } from '@/components/shop/shop-card';
import { Alert, Badge, DemoBadge, PriceTag, RatingInline, Stars } from '@/components/ui/misc';
import { PageBanner } from '@/components/layout/page-banner';
import { brand } from '@/config/brand';
import { apiGet, apiGetOrNull, cacheTags } from '@/lib/api-server';
import { AVAILABILITY_LABELS, CONDITION_LABELS, fcfa, formatDate, plural, SPEC_LABELS, storageLabel } from '@/lib/format';
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

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-[minmax(8rem,40%)_1fr] gap-3 py-2.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className={value ? 'font-medium text-ink' : 'text-subtle'}>{value || 'Non renseigné'}</dd>
    </div>
  );
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const p = await apiGetOrNull<ProductDetail>(`/products/${slug}`, { tags: [cacheTags.product(slug)] });
  if (!p) notFound();
  const [reviews, similar] = await Promise.all([
    apiGet<ReviewsPage>(`/products/${slug}/reviews?pageSize=5`, { tags: [cacheTags.product(slug)] }),
    apiGet<ProductCard[]>(`/products/${slug}/similar`, { tags: [cacheTags.catalog] }),
  ]);

  const specs = p.specs ?? {};
  const specRows = Object.entries(SPEC_LABELS)
    .map(([k, label]) => ({ label, value: (specs as Record<string, string | null | undefined>)[k] }))
    .filter((r) => r.value);
  const isUsed = p.condition === 'USED_GOOD' || p.condition === 'USED_FAIR';

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
    <>
    <PageBanner
      back="/catalogue"
      eyebrow={
        <span className="flex flex-wrap items-center gap-x-2">
          <Link href={`/catalogue?brand=${p.brand.slug}`} className="hover:text-white hover:underline">{p.brand.name}</Link>
          <span aria-hidden>·</span>
          <span>{CONDITION_LABELS[p.condition]}</span>
        </span>
      }
      title={p.title}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {p.ratingCount > 0 ? (
            <span className="inline-flex items-center gap-1.5"><Stars value={p.ratingAvg} size={13} /><span className="num">{p.ratingAvg.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} · {p.ratingCount} avis vérifiés</span></span>
          ) : (
            <span>Pas encore d’avis</span>
          )}
          <span className="font-mono text-[13px] text-white/70">Réf. {p.reference}</span>
          {p.isDemo && <DemoBadge />}
        </span>
      }
    />
    <div className="container-page py-8 md:py-12">
      <ViewTracker productId={p.id} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10">
        <Gallery media={p.media} title={p.title} />

        <div className="space-y-5">
          {p.promotion && <Badge tone="promo">Promotion −{p.promotion.discountPercent} %</Badge>}
          <div className="glass-light space-y-2 rounded-3xl p-6">
            <PriceTag current={p.currentPrice} reference={p.promotion?.referencePrice} size="lg" />
            {p.promotion ? (
              <p className="text-sm text-promo-700">
                Offre valable jusqu’au {formatDate(p.promotion.endsAt, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                {p.promotion.conditions ? ` · ${p.promotion.conditions}` : ''}.{' '}
                <span className="text-muted">Prix barré : prix le plus bas pratiqué ces 30 derniers jours.</span>
              </p>
            ) : null}
            <p className={`flex items-center gap-1.5 text-sm font-medium ${p.availability === 'AVAILABLE' ? 'text-ok' : 'text-warn'}`}>
              <PackageCheck className="size-4" aria-hidden />
              {AVAILABILITY_LABELS[p.availability]}
            </p>
          </div>

          {p.availability === 'WITHDRAWN' ? (
            <Alert tone="warn" title="Ce téléphone a été retiré de la vente">
              Consultez les autres annonces de la boutique ou des téléphones similaires.
            </Alert>
          ) : (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <WhatsAppOrderButton productId={p.id} orderable={p.orderable} />
              <FavoriteProductButton productId={p.id} title={p.title} variant="full" />
            </div>
          )}
          <p className="text-xs leading-relaxed text-muted">
            La commande et le paiement se font directement avec le vendeur. Confirmez avec lui le prix, l’état de l’appareil et la garantie avant de payer.
          </p>

          <dl className="divide-y divide-line rounded-card border border-line bg-surface px-5">
            <Row label="Marque" value={p.brand.name} />
            <Row label="Modèle" value={p.model} />
            <Row label="Stockage" value={storageLabel(p.storageGb)} />
            <Row label="Mémoire vive" value={p.ramGb ? `${p.ramGb} Go` : null} />
            <Row label="Couleur" value={p.color} />
            <Row label="Garantie" value={p.warranty} />
            <Row label="Accessoires inclus" value={p.accessories} />
            {p.publishedAt && <Row label="Annonce publiée le" value={formatDate(p.publishedAt)} />}
          </dl>

          <Link href={`/boutiques/${p.shop.slug}`} className="lift flex items-center gap-3 rounded-card border border-line bg-surface p-4 hover:shadow-card">
            <ShopLogo src={p.shop.logoUrl} name={p.shop.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 font-medium">
                <span className="truncate">{p.shop.name}</span>
                {p.shop.identityVerified && <BadgeCheck className="size-4 shrink-0 text-brand-600" aria-label="Identité vérifiée" />}
              </p>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span className="inline-flex items-center gap-0.5"><MapPin className="size-3.5" aria-hidden />{[p.shop.district, p.shop.city].filter(Boolean).join(', ')}</span>
                <span>{plural(p.shop.productCount, 'annonce', 'annonces')}</span>
                {p.shop.validatedAt && <span className="inline-flex items-center gap-0.5"><Store className="size-3.5" aria-hidden />Boutique validée</span>}
              </p>
              <div className="mt-1">
                <RatingInline avg={p.shop.ratingAvg} count={p.shop.ratingCount} />
              </div>
            </div>
            <ChevronRight className="size-5 text-subtle" aria-hidden />
          </Link>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="desc">
          <h2 id="desc" className="display mb-4 text-[26px] sm:text-[32px]">Description</h2>
          <div className="space-y-4 rounded-card border border-line bg-surface p-5">
            <p className="whitespace-pre-line text-[0.9375rem] leading-relaxed">{p.description || 'Le vendeur n’a pas ajouté de description.'}</p>
            <div className="flex gap-2.5 border-t border-line pt-4 text-sm">
              <Wrench className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <div>
                <p className="font-semibold">Défauts déclarés par le vendeur</p>
                <p className="mt-0.5 text-muted">{p.defects || (isUsed ? 'Aucun défaut déclaré. Demandez des photos supplémentaires au vendeur si nécessaire.' : 'Aucun défaut déclaré.')}</p>
              </div>
            </div>
            {isUsed && (
              <div className="flex gap-2.5 text-sm text-muted">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>Appareil d’occasion : vérifiez l’IMEI, l’état de la batterie et le fonctionnement avant de payer.</p>
              </div>
            )}
          </div>
        </section>
        <section aria-labelledby="specs">
          <h2 id="specs" className="display mb-4 text-[26px] sm:text-[32px]">Caractéristiques</h2>
          {specRows.length || specs.extra?.length ? (
            <dl className="divide-y divide-line rounded-card border border-line bg-surface px-5">
              {specRows.map((r) => (
                <Row key={r.label} label={r.label} value={r.value} />
              ))}
              {specs.extra?.map((e) => <Row key={e.label} label={e.label} value={e.value} />)}
            </dl>
          ) : (
            <p className="rounded-card border border-line bg-surface p-5 text-sm text-muted">Le vendeur n’a pas renseigné de caractéristiques détaillées.</p>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <CalendarClock className="size-3.5" aria-hidden /> Informations fournies par le vendeur, mises à jour le {formatDate(p.updatedAt)}.
          </p>
        </section>
      </div>

      <section className="mt-16 md:mt-24" aria-labelledby="avis">
        <h2 id="avis" className="display mb-6 text-[26px] sm:text-[36px]">Avis clients</h2>
        <ReviewsSection initial={reviews} endpoint={`/products/${p.slug}/reviews`} />
      </section>

      {similar.length > 0 && (
        <section className="mt-16 md:mt-24">
          <h2 className="display mb-6 text-[26px] sm:text-[36px]">Autres {p.brand.name} disponibles</h2>
          <ProductRow products={similar} />
        </section>
      )}

      <div className="mt-10 border-t border-line pt-4">
        <ReportButton targetType="PRODUCT" targetId={p.id} label="Signaler cette annonce" />
      </div>

      {p.availability !== 'WITHDRAWN' && (
        <div className="glass-light fixed inset-x-2 bottom-2 z-30 flex items-center gap-3 rounded-[28px] py-2 pl-4 pr-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:hidden">
          <div className="min-w-0">
            <p className="num text-base font-semibold leading-tight text-brand-600">{fcfa(p.currentPrice)}</p>
            {p.promotion && <p className="text-xs text-muted line-through">{fcfa(p.promotion.referencePrice)}</p>}
          </div>
          <div className="flex-1">
            <WhatsAppOrderButton productId={p.id} orderable={p.orderable} />
          </div>
        </div>
      )}
    </div>
    </>
  );
}
