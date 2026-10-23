import Link from 'next/link';
import { brand } from '@/config/brand';

export function LogoMark({ className = 'size-8', inverted }: { className?: string; inverted?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="10" className={inverted ? 'fill-white' : 'fill-navy'} />
      <rect x="10.5" y="6.5" width="11" height="19" rx="2.5" fill="none" className={inverted ? 'stroke-navy' : 'stroke-white'} strokeWidth="1.8" />
      <circle cx="16" cy="22" r="1.2" className={inverted ? 'fill-promo-600' : 'fill-promo-100'} />
    </svg>
  );
}

export function Logo({ inverted }: { inverted?: boolean }) {
  return (
    <Link href="/" className="flex min-h-11 shrink-0 items-center gap-2" aria-label={`${brand.name} — accueil`}>
      <LogoMark inverted={inverted} />
      <span className={`display text-[21px] ${inverted ? 'text-white' : 'text-ink'}`}>{brand.name}</span>
    </Link>
  );
}
