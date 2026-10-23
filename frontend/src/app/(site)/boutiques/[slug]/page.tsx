import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BadgeCheck, Clock, Globe, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { FollowShopButton } from '@/components/favorite-buttons';
import { CatalogBrowser, type RawParams } from '@/components/product/catalog-browser';
import { ReportButton } from '@/components/report-button';
import { ReviewsSection } from '@/components/reviews';
import { PromoCarousel } from '@/components/shop/promo-carousel';
import { ShopLogo } from '@/components/shop/shop-card';
import { FacebookIcon, InstagramIcon, TikTokIcon, WhatsAppIcon, YouTubeIcon } from '@/components/ui/brand-icons';
import { Alert, DemoBadge, Stars } from '@/components/ui/misc';
import { GlassPanel, PageBanner } from '@/components/layout/page-banner';
import { brand } from '@/config/brand';
import { apiGet, apiGetOrNull, cacheTags } from '@/lib/api-server';
import { formatDate, plural, rating } from '@/lib/format';
import type { Page, ProductCard, PublicShop, ReviewsPage } from '@/lib/types';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const s = await apiGetOrNull<PublicShop>(`/shops/${slug}`, { tags: [cacheTags.shop(slug)] });
  if (!s) return { title: 'Boutique indisponible', robots: { index: false } };
  const description = s.description?.slice(0, 160) || `Téléphones proposés par ${s.name} à ${s.city}. Commandez directement sur WhatsApp.`;
  return {
    title: `${s.name} — téléphones à ${s.city}`,
    description,
    alternates: { canonical: `/boutiques/${s.slug}` },
    robots: s.status !== 'ACTIVE' || s.isDemo ? { index: false } : undefined,
    openGraph: { title: s.name, description, url: `/boutiques/${s.slug}`, images: s.logoUrl ? [{ url: s.logoUrl }] : undefined },
  };
}

const SOCIAL = [
  { key: 'facebook', label: 'Facebook', Icon: FacebookIcon },
  { key: 'instagram', label: 'Instagram', Icon: InstagramIcon },
  { key: 'tiktok', label: 'TikTok', Icon: TikTokIcon },
  { key: 'youtube', label: 'YouTube', Icon: YouTubeIcon },
  { key: 'website', label: 'Site web', Icon: Globe },
] as const;

export default async function ShopPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const shop = await apiGetOrNull<PublicShop>(`/shops/${slug}`, { tags: [cacheTags.shop(slug)] });
  if (!shop) notFound();
  const active = shop.status === 'ACTIVE';
  const [promos, reviews] = await Promise.all([
    active ? apiGet<Page<ProductCard>>(`/promotions?shop=${slug}&pageSize=12`, { tags: [cacheTags.shop(slug), cacheTags.promotions] }) : Promise.resolve(null),
    apiGet<ReviewsPage>(`/shops/${slug}/reviews?pageSize=5`, { tags: [cacheTags.shop(slug)] }),
  ]);
  const waText = encodeURIComponent(`Bonjour ${shop.name}, je vous contacte depuis ${brand.name}.`);
  const waUrl = `https://wa.me/${shop.whatsapp.replace(/\D/g, '')}?text=${waText}`;
  const socials = SOCIAL.filter((s) => shop.socialLinks?.[s.key]);

  return (
    <>
      <PageBanner
        back="/boutiques"
        eyebrow={[shop.district, shop.city].filter(Boolean).join(', ')}
        title={
          <span className="flex items-center gap-4">
            <ShopLogo src={shop.logoUrl} name={shop.name} size="lg" />
            <span className="min-w-0">{shop.name}</span>
          </span>
        }
        subtitle={
          <span className="flex flex-col gap-2">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {shop.ratingCount > 0 ? (
                <span className="inline-flex items-center gap-1.5"><Stars value={shop.ratingAvg} size={13} /><span className="num">{rating(shop.ratingAvg)} · {shop.ratingCount} avis</span></span>
              ) : (
                <span>Pas encore d’avis</span>
              )}
              {active && <span className="num">{plural(shop.productCount, 'téléphone disponible', 'téléphones disponibles')}</span>}
              {shop.isDemo && <DemoBadge />}
            </span>
            {shop.description && <span className="max-w-2xl text-white/80">{shop.description}</span>}
          </span>
        }
        aside={
          <div className="flex flex-wrap gap-2">
            <a href={waUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-whatsapp px-5 font-medium text-white transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-whatsapp-hover">
              <WhatsAppIcon className="size-5" /> Contacter sur WhatsApp
            </a>
            <FollowShopButton shopId={shop.id} name={shop.name} />
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <GlassPanel className="space-y-1.5 text-sm">
            <p className="eyebrow text-white/60">Confiance</p>
            {shop.validatedAt && (
              <p className="flex items-center gap-2"><ShieldCheck className="size-4 text-promo-100" aria-hidden /> Boutique validée par {brand.name}</p>
            )}
            {shop.identityVerified ? (
              <p className="flex items-center gap-2"><BadgeCheck className="size-4 text-promo-100" aria-hidden /> Identité du vendeur vérifiée</p>
            ) : (
              <p className="text-white/70">Identité non vérifiée par la plateforme</p>
            )}
          </GlassPanel>
          {(shop.openingHours || shop.phone || shop.address) && (
            <GlassPanel className="space-y-1.5 text-sm">
              <p className="eyebrow text-white/60">Coordonnées</p>
              {shop.openingHours && <p className="flex items-center gap-2"><Clock className="size-4" aria-hidden />{shop.openingHours}</p>}
              {shop.phone && <a href={`tel:${shop.phone}`} className="flex items-center gap-2 hover:underline"><Phone className="size-4" aria-hidden /><span className="num">{shop.phone}</span></a>}
              {shop.address && <p className="flex items-center gap-2"><MapPin className="size-4" aria-hidden />{shop.address}</p>}
            </GlassPanel>
          )}
          {socials.length > 0 && (
            <GlassPanel className="space-y-2 text-sm">
              <p className="eyebrow text-white/60">Réseaux</p>
              <div className="flex flex-wrap gap-2">
                {socials.map(({ key, label, Icon }) => (
                  <a key={key} href={shop.socialLinks[key]} target="_blank" rel="noopener noreferrer nofollow" aria-label={`${shop.name} sur ${label}`} className="glass inline-flex size-11 items-center justify-center rounded-full">
                    <Icon className="size-[18px]" />
                  </a>
                ))}
              </div>
            </GlassPanel>
          )}
        </div>
      </PageBanner>

      <div className="container-page space-y-16 py-12 md:space-y-24 md:py-16">
        {!active && (
          <Alert tone="warn" title="Boutique fermée temporairement">
            Les annonces de cette boutique ne sont pas disponibles pour le moment. Vous pouvez suivre la boutique pour la retrouver facilement.
          </Alert>
        )}
        {promos && promos.items.length > 0 && <PromoCarousel promotions={promos.items} />}
        {active && (
          <section aria-labelledby="catalogue-boutique">
            <h2 id="catalogue-boutique" className="display mb-6 text-[26px] sm:text-[36px]">Tous les téléphones</h2>
            <CatalogBrowser searchParams={sp} basePath={`/boutiques/${shop.slug}`} shop={shop.slug} />
          </section>
        )}
        <section aria-labelledby="avis-boutique">
          <h2 id="avis-boutique" className="display mb-6 text-[26px] sm:text-[36px]">Avis sur la boutique</h2>
          <ReviewsSection initial={reviews} endpoint={`/shops/${shop.slug}/reviews`} showProduct />
        </section>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
          <span>Sur {brand.name} depuis {formatDate(shop.createdAt, { month: 'long', year: 'numeric' })}</span>
          <ReportButton targetType="SHOP" targetId={shop.id} label="Signaler cette boutique" />
        </div>
      </div>
    </>
  );
}
