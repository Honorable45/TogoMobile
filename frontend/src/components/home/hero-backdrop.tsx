'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Pause, Play } from 'lucide-react';
import type { HeroSlide } from './hero-slides';

const INTERVAL_MS = 5000;

function SlideLink({ href, children }: { href: string; children: React.ReactNode }) {
  const cls = 'mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-white underline-offset-4 hover:underline';
  // Lien externe d'annonceur : nouvel onglet, sans transmettre la page d'origine, marqué « sponsored ».
  if (/^https:\/\//.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer sponsored" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

/**
 * Fond défilant de la section d'accueil.
 * - fondu toutes les 5 s, image légèrement zoomée puis stabilisée ;
 * - pause au survol ou au focus de la légende, sur demande (bouton) et quand l'onglet est masqué ;
 * - aucun mouvement si le navigateur demande de réduire les animations (navigation par les points) ;
 * - les images suivantes ne sont chargées qu'au moment d'être affichées ;
 * - chaque diapositive porte la mention « Publicité » ou « Promotion ».
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
    // Charge la diapositive affichée et précharge la suivante.
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
  const current = slides[index];
  const fade = reducedMotion ? '' : 'transition-[opacity,transform] duration-[1200ms] ease-out';

  return (
    <>
      <div className="absolute inset-0 -z-20" aria-hidden>
        {slides.map((s, i) =>
          mounted.has(i) ? (
            <picture key={s.id}>
              <source media="(max-width: 767px)" srcSet={s.mobileImage} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.image}
                alt=""
                decoding="async"
                fetchPriority={i === 0 ? 'high' : 'low'}
                className={`absolute inset-0 size-full object-cover ${fade} ${i === index ? 'scale-100 opacity-100' : 'scale-105 opacity-0'}`}
              />
            </picture>
          ) : null,
        )}
      </div>
      {/* Voile pour garder le texte lisible quelle que soit l'image. */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-navy/70 via-navy/50 to-navy/85" aria-hidden />

      <div
        className="absolute inset-x-0 bottom-5 z-10 sm:bottom-8"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
      >
        <div className="container-page flex items-end justify-between gap-3">
          <div className="glass-dark max-w-md rounded-3xl px-5 py-4 text-left" aria-live={autoplay ? 'off' : 'polite'}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
              {current.kind}
              {current.source ? ` · ${current.source}` : ''}
            </p>
            <p className="mt-1 text-base font-semibold leading-snug text-white sm:text-lg">{current.title}</p>
            {current.subtitle && <p className="mt-0.5 text-sm text-white/80">{current.subtitle}</p>}
            {current.href && (
              <SlideLink href={current.href}>
                {current.kind === 'Publicité' ? 'Découvrir' : 'Voir l’offre'} <ArrowRight className="size-4" aria-hidden />
              </SlideLink>
            )}
          </div>

          {multiple && (
            <div className="glass-dark flex shrink-0 items-center gap-1 rounded-full p-1">
              <button
                type="button"
                onClick={() => setUserPaused((p) => !p)}
                aria-label={userPaused || reducedMotion ? 'Lancer le défilement' : 'Mettre en pause'}
                aria-pressed={userPaused}
                disabled={reducedMotion}
                className="inline-flex size-11 items-center justify-center rounded-full text-white hover:bg-white/10 disabled:opacity-50"
              >
                {userPaused || reducedMotion ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
              </button>
              <div className="hidden items-center sm:flex">
                {slides.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => go(i)}
                    aria-label={`${s.kind} ${i + 1} sur ${slides.length}`}
                    aria-current={i === index ? 'true' : undefined}
                    className="group inline-flex size-11 items-center justify-center"
                  >
                    <span className={`block h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/50 group-hover:bg-white/80'}`} />
                  </button>
                ))}
              </div>
              <span className="px-2 text-xs tabular-nums text-white/80 sm:hidden" aria-hidden>
                {index + 1}/{slides.length}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
