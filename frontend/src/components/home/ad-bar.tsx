'use client';

import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { HeroSlide } from './hero-slides';

/**
 * Publicités transmises par la page d'accueil à l'en-tête (qui est dans la mise en page commune).
 * Petit magasin partagé : l'accueil les déclare, l'en-tête les affiche ; vide sur les autres pages.
 */
let current: HeroSlide[] = [];
const listeners = new Set<() => void>();
const EMPTY: HeroSlide[] = [];
function setAdSlides(slides: HeroSlide[]) {
  current = slides;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** À placer dans la page d'accueil : déclare les publicités à afficher dans l'en-tête mobile. */
export function AdBar({ slides }: { slides: HeroSlide[] }) {
  useEffect(() => {
    setAdSlides(slides);
    return () => setAdSlides(EMPTY);
  }, [slides]);
  return null;
}

function SlideLink({ slide, className, children }: { slide: HeroSlide; className: string; children: React.ReactNode }) {
  if (!slide.href) return <div className={className}>{children}</div>;
  // Lien externe d'annonceur : nouvel onglet, sans transmettre la page d'origine, marqué « sponsored ».
  if (/^https:\/\//.test(slide.href)) {
    return (
      <a href={slide.href} target="_blank" rel="noopener noreferrer sponsored" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={slide.href} className={className}>
      {children}
    </Link>
  );
}

/**
 * Barre de publicités de l'accueil mobile, affichée dans l'en-tête au-dessus de la recherche.
 * Défilement au doigt (une annonce par écran, points d'indication) ; elle se replie dès qu'on
 * descend dans la page pour laisser la place au contenu, et réapparaît en haut de page.
 */
export function HeaderAdBar() {
  const slides = useSyncExternalStore(subscribe, () => current, () => EMPTY);
  const [collapsed, setCollapsed] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const onScroll = () => setCollapsed(window.scrollY > 60);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!slides.length) return null;
  return (
    <div className={`grid transition-[grid-template-rows,opacity] duration-300 ${collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`} aria-hidden={collapsed || undefined}>
      <div className="overflow-hidden">
        <div className="px-2 pb-1.5">
          <div
            role="region"
            aria-label="Publicités"
            onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
            className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto rounded-2xl"
          >
            {slides.map((s, i) => (
              <SlideLink
                key={s.id}
                slide={s}
                className="relative isolate flex h-[76px] w-full shrink-0 snap-center items-center overflow-hidden bg-navy px-4 text-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.mobileImage || s.image} alt="" loading={i === 0 ? 'eager' : 'lazy'} className="absolute inset-0 -z-20 size-full object-cover" />
                <div className="absolute inset-0 -z-10 bg-gradient-to-r from-navy/85 via-navy/55 to-navy/10" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/75">
                    {s.kind}
                    {s.source ? ` · ${s.source}` : ''}
                  </p>
                  <p className="truncate text-[15px] font-semibold leading-tight">{s.title}</p>
                  {s.subtitle && <p className="truncate text-xs text-white/80">{s.subtitle}</p>}
                </div>
              </SlideLink>
            ))}
          </div>
          {slides.length > 1 && (
            <div className="mt-1 flex justify-center gap-1" aria-hidden>
              {slides.map((s, i) => (
                <span key={s.id} className={`h-1 rounded-full transition-all ${i === index ? 'w-4 bg-navy' : 'w-1 bg-line-2'}`} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
