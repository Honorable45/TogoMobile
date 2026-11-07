import Link from 'next/link';
import { brand } from '@/config/brand';

/**
 * Symbole bonplan : la cible (anneau + point), fichiers d'origine dans public/brand/.
 * `inverted` : version pour fond sombre.
 */
export function LogoMark({ className = 'size-8', inverted }: { className?: string; inverted?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill={inverted ? '#F5F7FA' : '#0A0B0D'} />
      <circle cx="32" cy="32" r="19" fill="none" stroke={inverted ? '#0A6FB0' : '#6CCBFF'} strokeWidth="8" />
      <circle cx="32" cy="32" r="5.5" fill={inverted ? '#0A6FB0' : '#6CCBFF'} />
    </svg>
  );
}

/** Logotype complet (« b◎nplan »), tracé vectoriel fourni : net à toutes les tailles. */
export function Logo({ inverted, className = 'h-[22px]' }: { inverted?: boolean; className?: string }) {
  return (
    <Link href="/" className="flex min-h-11 shrink-0 items-center" aria-label={`${brand.name} — accueil`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG statique, next/image n'apporte rien ici */}
      <img src={inverted ? '/brand/logo-inverse.svg' : '/brand/logo.svg'} alt="" width={84} height={22} className={`${className} w-auto bg-transparent`} />
    </Link>
  );
}
