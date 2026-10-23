'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { fcfa, formatDate } from '@/lib/format';
import type { ProductCard } from '@/lib/types';
import { ProductImage } from '../product/product-card';

const INTERVAL_MS = 5000;
const RESUME_AFTER_MS = 12000;

/**
 * Carrousel des promotions d'une boutique.
 * - défilement automatique toutes les 5 s, uniquement s'il y a plusieurs offres ;
 * - pause au survol, au focus clavier, au toucher et sur demande (bouton pause) ;
 * - reprise automatique après une période d'inactivité, sauf si l'utilisateur a choisi la pause ;
 * - aucun mouvement automatique si le navigateur demande de réduire les animations.
 */
export function PromoCarousel({ promotions }: { promotions: ProductCard[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [interactedAt, setInteractedAt] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);
  const [scrollable, setScrollable] = useState(false);
  const multiple = promotions.length > 1;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const on = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const cardWidth = () => {
    const el = track.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return 0;
    const gap = parseFloat(getComputedStyle(el).columnGap || '0') || 0;
    return first.offsetWidth + gap;
  };

  const updateEdges = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    setScrollable(el.scrollWidth > el.clientWidth + 4);
    const w = cardWidth();
    if (w) setIndex(Math.round(el.scrollLeft / w));
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    updateEdges();
    el.addEventListener('scroll', updateEdges, { passive: true });
    window.addEventListener('resize', updateEdges);
    return () => {
      el.removeEventListener('scroll', updateEdges);
      window.removeEventListener('resize', updateEdges);
    };
  }, [updateEdges]);

  const scrollByCards = useCallback((dir: 1 | -1, wrap = false) => {
    const el = track.current;
    if (!el) return;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    if (dir === 1 && atEnd && wrap) el.scrollTo({ left: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    else el.scrollBy({ left: dir * cardWidth(), behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [reducedMotion]);

  const markInteraction = () => setInteractedAt(Date.now());

  // Lecture automatique
  const autoplay = multiple && scrollable && !reducedMotion && !userPaused && !hovered && !focused;
  useEffect(() => {
    if (!autoplay) return;
    const id = setInterval(() => {
      if (Date.now() - interactedAt < RESUME_AFTER_MS) return;
      if (document.visibilityState !== 'visible') return;
      scrollByCards(1, true);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoplay, interactedAt, scrollByCards]);

  if (!promotions.length) return null;

  return (
    <section
      aria-roledescription="carrousel"
      aria-label="Promotions en cours"
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setFocused(false)}
      onTouchStart={markInteraction}
      onPointerDown={markInteraction}
      onWheel={markInteraction}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="display text-[26px] sm:text-[36px]">Promotions en cours</h2>
        {multiple && scrollable && (
          <div className="flex items-center gap-1">
            {!reducedMotion && (
              <button
                type="button"
                onClick={() => setUserPaused((p) => !p)}
                className="glass-light inline-flex size-11 items-center justify-center rounded-full"
                aria-label={userPaused ? 'Reprendre le défilement automatique' : 'Mettre en pause le défilement automatique'}
              >
                {userPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                markInteraction();
                scrollByCards(-1);
              }}
              disabled={!canPrev}
              className="glass-light hidden size-11 items-center justify-center rounded-full disabled:opacity-40 sm:inline-flex"
              aria-label="Promotion précédente"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                markInteraction();
                scrollByCards(1);
              }}
              disabled={!canNext}
              className="glass-light hidden size-11 items-center justify-center rounded-full disabled:opacity-40 sm:inline-flex"
              aria-label="Promotion suivante"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>

      <div
        ref={track}
        className="scrollbar-none relative -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 sm:mx-0 sm:scroll-px-0 sm:px-0"
        aria-live={autoplay ? 'off' : 'polite'}
      >
        {promotions.map((p, i) => (
          <article
            key={p.id}
            aria-roledescription="diapositive"
            aria-label={`${i + 1} sur ${promotions.length} : ${p.title}`}
            className={`flex shrink-0 snap-start gap-3 rounded-card border border-line bg-surface p-3 ${
              multiple ? 'w-[86%] sm:w-[calc(50%-0.375rem)] lg:w-[calc(33.333%-0.5rem)]' : 'w-full sm:max-w-md'
            }`}
          >
            <div className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-canvas sm:size-28">
              <ProductImage src={p.image?.thumbUrl} alt={p.title} className="size-full" />
              <span className="absolute left-1.5 top-1.5 rounded-[4px] bg-promo-600 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white">−{p.promotion!.discountPercent} %</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <h3 className="line-clamp-2 text-[14.5px] font-medium leading-snug">{p.title}</h3>
              <p className="num mt-1 text-base font-semibold text-brand-600">{fcfa(p.promotion!.promoPrice)}</p>
              <p className="num text-xs text-muted">
                <span className="sr-only">Prix habituel : </span>
                <span className="line-through">{fcfa(p.promotion!.referencePrice)}</span>
              </p>
              <p className="mt-auto pt-1 text-xs font-medium text-promo-700">Jusqu’au {formatDate(p.promotion!.endsAt, { day: 'numeric', month: 'long' })}</p>
              <Link href={`/produits/${p.slug}`} className="glass-dark mt-2 inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-white transition-transform active:scale-[.98]">
                Voir l’offre
              </Link>
            </div>
          </article>
        ))}
      </div>

      {multiple && (
        <div className="mt-2 flex justify-center gap-1.5 sm:hidden" aria-hidden>
          {promotions.map((p, i) => (
            <span key={p.id} className={`h-1 rounded-full transition-all ${i === index ? 'w-5 bg-promo-600' : 'w-2 bg-line-2'}`} />
          ))}
        </div>
      )}
    </section>
  );
}
