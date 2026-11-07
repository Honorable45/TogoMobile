'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import type { HeroSlide } from './hero-slides';

const INTERVAL_MS = 5000;

function PosterLink({ slide, active, className, children }: { slide: HeroSlide; active: boolean; className: string; children: React.ReactNode }) {
  // Aucun texte visible : le nom de l'annonceur et le titre servent d'intitulé aux lecteurs d'écran.
  const label = `${slide.kind}${slide.source ? ` ${slide.source}` : ''} : ${slide.title}`;
  const common = { className, 'aria-label': label, 'aria-hidden': !active || undefined, tabIndex: active ? undefined : -1 };
  if (!slide.href) return <div {...common} role="img">{children}</div>;
  // Lien externe d'annonceur : nouvel onglet, sans transmettre la page d'origine, marqué « sponsored ».
  if (/^https:\/\//.test(slide.href)) {
    return (
      <a href={slide.href} target="_blank" rel="noopener noreferrer sponsored" {...common}>
        {children}
      </a>
    );
  }
  return (
    <Link href={slide.href} {...common}>
      {children}
    </Link>
  );
}

/**
 * Bannière d'affiches publicitaires de l'accueil (ordinateur) : images seules, sans texte.
 * - fondu toutes les 5 s, chaque affiche entière est cliquable ;
 * - pause au survol, au focus, sur demande et quand l'onglet est masqué ;
 * - aucun mouvement si le navigateur demande de réduire les animations ;
 * - les affiches suivantes ne sont chargées qu'au moment d'être affichées.
 * Les affiches d'annonceurs (format 1920 × 720) remplissent la bannière ; à défaut, les photos
 * de produits en promotion sont affichées entières sur fond blanc.
 */
export function HeroBackdrop({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [mounted, setMounted] = useState<Set<number>>(() => new Set([0, 1]));
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const multiple = slides.length > 1;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const on = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const go = (i: number) => {
    const next = (i + slides.length) % slides.length;
    setIndex(next);
    // Charge l'affiche montrée et précharge la suivante.
    setMounted((m) => (m.has(next) && m.has((next + 1) % slides.length) ? m : new Set([...m, next, (next + 1) % slides.length])));
  };

  const autoplay = multiple && !reducedMotion && !userPaused && !hovered;
  useEffect(() => {
    if (!autoplay) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') go(index + 1);
    }, INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, index]);

  if (!slides.length) return null;
  const fade = reducedMotion ? '' : 'transition-opacity duration-700 ease-out';
  const control = 'glass-dark inline-flex size-11 items-center justify-center rounded-full text-white transition-opacity hover:bg-navy/80';

  return (
    <div
      role="region"
      aria-roledescription="carrousel"
      aria-label="Publicités"
      className="group relative aspect-[8/3] overflow-hidden rounded-[32px] bg-navy shadow-[0_24px_60px_-30px_rgb(15_23_42/.45)]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={() => setHovered(false)}
    >
      {slides.map((s, i) =>
        mounted.has(i) ? (
          <PosterLink
            key={s.id}
            slide={s}
            active={i === index}
            className={`absolute inset-0 block ${s.kind === 'Promotion' ? 'bg-white' : ''} ${fade} ${i === index ? 'z-[1] opacity-100' : 'pointer-events-none opacity-0'}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.image}
              alt=""
              decoding="async"
              fetchPriority={i === 0 ? 'high' : 'low'}
              className={`absolute inset-0 size-full ${s.kind === 'Promotion' ? 'object-contain py-6' : 'object-cover'}`}
            />
          </PosterLink>
        ) : null,
      )}

      {multiple && (
        <>
          <button type="button" onClick={() => go(index - 1)} aria-label="Affiche précédente" className={`${control} absolute left-4 top-1/2 z-10 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}>
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button type="button" onClick={() => go(index + 1)} aria-label="Affiche suivante" className={`${control} absolute right-4 top-1/2 z-10 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}>
            <ChevronRight className="size-5" aria-hidden />
          </button>
          <div className="glass-dark absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center rounded-full p-1">
            <button
              type="button"
              onClick={() => setUserPaused((p) => !p)}
              aria-label={userPaused || reducedMotion ? 'Lancer le défilement' : 'Mettre en pause'}
              aria-pressed={userPaused}
              disabled={reducedMotion}
              className="inline-flex size-9 items-center justify-center rounded-full text-white hover:bg-white/10 disabled:opacity-50"
            >
              {userPaused || reducedMotion ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
            </button>
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Affiche ${i + 1} sur ${slides.length}`}
                aria-current={i === index ? 'true' : undefined}
                className="group/dot inline-flex size-9 items-center justify-center"
              >
                <span className={`block h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/50 group-hover/dot:bg-white/80'}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
