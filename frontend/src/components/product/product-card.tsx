import Link from 'next/link';
import { BadgeCheck, Smartphone } from 'lucide-react';
import { CONDITION_LABELS, formatDate, storageLabel } from '@/lib/format';
import type { ProductCard as Card } from '@/lib/types';
import { FavoriteProductButton } from '../favorite-buttons';
import { Badge, PriceTag, RatingInline } from '../ui/misc';
import { CardOrderButton } from './whatsapp-button';
import { FallbackImg } from './fallback-img';

export function ProductImage({
  src,
  srcSet,
  sizes,
  alt,
  className = '',
  priority,
}: {
  src?: string | null;
  srcSet?: string;
  sizes?: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-paper-2 text-faint ${className}`} role="img" aria-label={`${alt} — pas de photo`}>
        <Smartphone className="size-10" aria-hidden />
      </div>
    );
  }
  // Images déjà redimensionnées et compressées en WebP à l'envoi : pas de transformation supplémentaire.
  return (
    <FallbackImg
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      width={480}
      height={480}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={`object-cover ${className}`}
    />
  );
}

/** Badge de catégorie : promotion (ocre), neuf (vert), autres états (bleu nuit). */
function CategoryBadge({ p }: { p: Card }) {
  if (p.availability !== 'AVAILABLE') return <Badge tone="muted">{p.availability === 'OUT_OF_STOCK' ? 'Rupture' : 'Indisponible'}</Badge>;
  if (p.promotion) return <Badge tone="promo">Promo −{p.promotion.discountPercent} %</Badge>;
  if (p.condition === 'NEW') return <Badge tone="ok">Neuf</Badge>;
  const short = { LIKE_NEW: 'Comme neuf', REFURBISHED: 'Reconditionné', USED_GOOD: 'Occasion', USED_FAIR: 'Occasion' } as const;
  return <Badge tone="navy">{short[p.condition as keyof typeof short]}</Badge>;
}

export function ProductCard({ product, priority }: { product: Card; priority?: boolean }) {
  const p = product;
  const unavailable = p.availability !== 'AVAILABLE';
  const details = [p.brand.name, storageLabel(p.storageGb), p.ramGb ? `${p.ramGb} Go RAM` : null].filter(Boolean).join(' · ');
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.2,0.7,0.2,1)] hover:-translate-y-0.5 hover:shadow-card">
      <div className="relative aspect-square overflow-hidden bg-paper-2">
        <ProductImage
          src={p.image?.thumbUrl}
          srcSet={p.image?.mediumUrl ? `${p.image.thumbUrl} 480w, ${p.image.mediumUrl} 960w` : undefined}
          sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
          alt={p.title}
          priority={priority}
          className={`size-full transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] group-hover:scale-[1.03] ${unavailable ? 'opacity-60' : ''}`}
        />
        <div className="absolute left-2.5 top-2.5">
          <CategoryBadge p={p} />
        </div>
        <div className="absolute right-2 top-2 z-10">
          <FavoriteProductButton productId={p.id} title={p.title} />
        </div>
        {!unavailable && (
          <div className="absolute bottom-2.5 right-2.5">
            <CardOrderButton productId={p.id} title={p.title} />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <h3 className="line-clamp-2 text-[14.5px] font-medium leading-snug text-ink">
          <Link href={`/produits/${p.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {p.title}
          </Link>
        </h3>
        <p className="text-xs text-muted">
          {details}
          {p.condition !== 'NEW' && ` · ${CONDITION_LABELS[p.condition]}`}
        </p>
        <RatingInline avg={p.ratingAvg} count={p.ratingCount} />
        <p className="flex items-center gap-1 truncate text-xs text-muted">
          {p.shop.identityVerified && <BadgeCheck className="size-3.5 shrink-0 text-brand-600" aria-label="Identité vérifiée" />}
          <span className="truncate">
            {p.shop.name} · {p.shop.city}
          </span>
        </p>
        <div className="mt-auto pt-2">
          <PriceTag current={p.currentPrice} reference={p.promotion?.referencePrice} />
          {p.promotion && <p className="text-[11.5px] text-promo-700">Jusqu’au {formatDate(p.promotion.endsAt, { day: 'numeric', month: 'short' })}</p>}
        </div>
      </div>
    </article>
  );
}

/** Grille : 2 colonnes sur mobile, 3 sur tablette, 4 sur ordinateur. */
export function ProductGrid({ products, priorityCount = 0 }: { products: Card[]; priorityCount?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 lg:gap-5">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < priorityCount} />
      ))}
    </div>
  );
}

/** Rangée défilante horizontalement sur mobile, grille sur grand écran. */
export function ProductRow({ products }: { products: Card[] }) {
  return (
    <div className="scrollbar-none relative -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-4 lg:gap-5">
      {products.map((p) => (
        <div key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[38%] md:w-auto">
          <ProductCard product={p} />
        </div>
      ))}
    </div>
  );
}
