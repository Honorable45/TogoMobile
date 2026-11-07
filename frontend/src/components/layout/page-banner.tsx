import type { ReactNode } from 'react';
import { BackButton } from './back-button';

/**
 * En-tête des pages intérieures, façon fiche produit Apple : fond blanc, grand titre noir,
 * phrase courte en gris. Le haut passe sous l'en-tête flottant.
 */
export function PageBanner({
  title,
  subtitle,
  eyebrow,
  back = '/',
  backLabel = 'Retour',
  children,
  aside,
  compact = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  back?: string | false;
  backLabel?: string;
  /** Conservé pour compatibilité : le bandeau clair n'affiche plus de photo. */
  image?: string;
  children?: ReactNode;
  aside?: ReactNode;
  /** Bandeau réduit (fiches produit) : le contenu utile remonte au-dessus de la ligne de flottaison. */
  compact?: boolean;
}) {
  return (
    <section className="bg-surface text-ink">
      <div className={`container-page ${compact ? 'pb-6 pt-[156px] md:pb-8 md:pt-[104px]' : 'pb-10 pt-[164px] md:pb-14 md:pt-[120px]'}`}>
        {back !== false && <BackButton fallback={back} label={backLabel} tone="light" />}
        <div className={`${back !== false ? (compact ? 'mt-4' : 'mt-6') : ''} flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between`}>
          <div className="min-w-0 max-w-3xl">
            {eyebrow && <p className="eyebrow mb-2 text-promo-700">{eyebrow}</p>}
            <h1 className={`display ${compact ? 'text-[32px] sm:text-[40px] lg:text-[48px]' : 'text-[44px] sm:text-[56px] lg:text-[72px]'}`}>{title}</h1>
            {subtitle && <div className="mt-3 max-w-2xl text-[17px] leading-snug text-muted md:text-[19px]">{subtitle}</div>}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </div>
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}

/** Encadré d'information dans un en-tête de page. */
export function GlassPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-canvas p-5 ${className}`}>{children}</div>;
}
