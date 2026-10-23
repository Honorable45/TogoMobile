import { Smartphone, Store } from 'lucide-react';

/** Vignette de produit (variante 480 px déjà produite par le traitement des médias). */
export function ProductImage({ src, alt, className = '' }: { src?: string | null; alt: string; className?: string }) {
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-paper-2 text-faint ${className}`} role="img" aria-label={`${alt} — pas de photo`}>
        <Smartphone className="size-8" aria-hidden />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={480} height={480} loading="lazy" decoding="async" className={`object-cover ${className}`} />;
}

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
