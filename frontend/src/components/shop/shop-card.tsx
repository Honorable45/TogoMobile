import Link from 'next/link';
import { BadgeCheck, MapPin, Store } from 'lucide-react';
import { plural } from '@/lib/format';
import type { ShopCard as Shop } from '@/lib/types';
import { RatingInline } from '../ui/misc';

export function ShopLogo({ src, name, size = 'md' }: { src: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = { sm: 'size-11 rounded-xl', md: 'size-14 rounded-2xl', lg: 'size-16 rounded-2xl sm:size-20' }[size];
  if (!src) {
    return (
      <div className={`${cls} flex shrink-0 items-center justify-center bg-paper-2 text-navy`} aria-hidden>
        <Store className={size === 'lg' ? 'size-9' : 'size-6'} />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={`Logo de ${name}`} className={`${cls} shrink-0 border border-line bg-surface object-cover`} loading="lazy" />;
}

export function ShopCard({ shop }: { shop: Shop }) {
  return (
    <article className="lift relative flex items-center gap-3 rounded-card border border-line bg-surface p-4 hover:shadow-card">
      <ShopLogo src={shop.logoUrl} name={shop.name} />
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="flex items-center gap-1 text-[15px] font-medium text-ink">
          <Link href={`/boutiques/${shop.slug}`} className="truncate after:absolute after:inset-0 after:content-['']">
            {shop.name}
          </Link>
          {shop.identityVerified && <BadgeCheck className="size-4 shrink-0 text-brand-600" aria-label="Identité vérifiée par la plateforme" />}
        </h3>
        <p className="flex items-center gap-1 text-xs text-muted">
          <MapPin className="size-3.5" aria-hidden />
          {shop.city}
          <span aria-hidden>·</span>
          {plural(shop.productCount, 'téléphone disponible', 'téléphones disponibles')}
        </p>
        <RatingInline avg={shop.ratingAvg} count={shop.ratingCount} />
      </div>
    </article>
  );
}
