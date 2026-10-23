import type { ReactNode } from 'react';
import { brand } from '@/config/brand';
import { BackButton } from './back-button';

/**
 * Bandeau des pages intérieures : aplat bleu nuit (photo facultative sous un voile à 70 %),
 * bouton « Retour », titre serif, phrase courte et contenu dans des panneaux de verre.
 * Le haut du bandeau passe sous l'en-tête flottant.
 */
export function PageBanner({
  title,
  subtitle,
  eyebrow,
  back = '/',
  backLabel = 'Retour',
  image = brand.bannerImage,
  children,
  aside,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  back?: string | false;
  backLabel?: string;
  image?: string;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-navy text-white">
      {image && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
          <div className="absolute inset-0 -z-10 bg-navy/70" aria-hidden />
        </>
      )}
      <div className="container-page pb-10 pt-[148px] md:pb-14 md:pt-[116px]">
        {back !== false && <BackButton fallback={back} label={backLabel} />}
        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            {eyebrow && <p className="eyebrow mb-3 text-white/70">{eyebrow}</p>}
            <h1 className="display text-[40px] sm:text-[48px] lg:text-[56px]">{title}</h1>
            {subtitle && <div className="mt-3 max-w-2xl text-[15px] text-white/80">{subtitle}</div>}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </div>
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}

/** Panneau de verre pour le contenu des bandeaux. */
export function GlassPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-3xl p-5 ${className}`}>{children}</div>;
}
