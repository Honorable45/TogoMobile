'use client';

import Link from 'next/link';
import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { HeroSlide } from './hero-slides';

const DELAY = 6000;

/**
 * Grandes cartes vedettes qui défilent seules (façon apple.com/iphone) :
 * titre et accroche en haut à gauche, boutons en haut à droite, photo en bas.
 * Pastilles et bouton pause sous la rangée ; l'animation s'arrête si l'utilisateur préfère moins de mouvement.
 */
export function FeatureCarousel({ slides }: { slides: HeroSlide[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(false);
  }, []);

  // Index courant d'après la position de défilement (glisser au doigt compris).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const card = el.firstElementChild as HTMLElement | null;
      if (!card) return;
      const step = card.offsetWidth + 20;
      setIndex(Math.min(slides.length - 1, Math.round(el.scrollLeft / step)));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [slides.length]);

  const goTo = (i: number) => {
    const el = ref.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (!el || !card) return;
    el.scrollTo({ left: card.offsetLeft - el.offsetLeft - parseFloat(getComputedStyle(el).paddingLeft), behavior: 'smooth' });
  };

  useEffect(() => {
    if (!playing || slides.length < 2) return;
    const t = setTimeout(() => goTo((index + 1) % slides.length), DELAY);
    return () => clearTimeout(t);
  }, [playing, index, slides.length]);

  if (!slides.length) return null;

  return (
    <section aria-roledescription="carrousel" aria-label="À la une">
      <div
        ref={ref}
        className="scroller gap-5 pl-[max(1rem,calc((100vw-76rem)/2+1.5rem))] pr-4 scroll-pl-[max(1rem,calc((100vw-76rem)/2+1.5rem))] sm:pl-[max(1.5rem,calc((100vw-76rem)/2+1.5rem))]"
        onPointerDown={() => setPlaying(false)}
      >
        {slides.map((s, i) => {
          const dark = i % 3 === 1;
          return (
            <article
              key={s.id}
              aria-roledescription="diapositive"
              aria-label={`${i + 1} sur ${slides.length}`}
              className={`relative flex h-[520px] w-[88vw] max-w-[73rem] shrink-0 flex-col overflow-hidden rounded-[28px] md:h-[600px] ${
                dark ? 'bg-ink text-white' : 'bg-canvas text-ink'
              }`}
            >
              <div className="flex flex-col gap-4 p-7 md:flex-row md:items-start md:justify-between md:p-12">
                <div className="min-w-0">
                  <p className={`text-[13px] font-semibold ${dark ? 'text-promo-100' : 'text-promo-700'}`}>
                    {s.kind}
                    {s.source ? ` · ${s.source}` : ''}
                  </p>
                  <h3 className="display mt-1 line-clamp-2 text-[32px] md:text-[48px]">{s.title}</h3>
                  {s.subtitle && <p className={`mt-1 text-[17px] md:text-[21px] ${dark ? 'text-white/80' : 'text-ink-2'}`}>{s.subtitle}</p>}
                </div>
                {s.href && (
                  <div className="flex shrink-0 gap-3">
                    <Link
                      href="/promotions"
                      className={`inline-flex h-11 items-center rounded-full border px-5 text-[15px] font-medium transition-colors ${
                        dark ? 'border-white/70 text-white hover:bg-white/10' : 'border-navy text-navy hover:bg-white'
                      }`}
                    >
                      Toutes les offres
                    </Link>
                    <Link href={s.href} className="inline-flex h-11 items-center rounded-full bg-navy px-5 text-[15px] font-medium text-white transition-colors hover:bg-navy-2">
                      Voir l’offre
                    </Link>
                  </div>
                )}
              </div>
              <div className="relative min-h-0 flex-1">
                <picture>
                  <source media="(max-width: 767px)" srcSet={s.mobileImage} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.image}
                    alt=""
                    loading={i === 0 ? 'eager' : 'lazy'}
                    className="absolute inset-x-0 bottom-0 mx-auto h-full w-auto max-w-full bg-transparent object-contain object-bottom"
                  />
                </picture>
              </div>
            </article>
          );
        })}
      </div>

      {slides.length > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <div className="flex h-11 items-center gap-2.5 rounded-full bg-paper-2 px-5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setPlaying(false);
                  goTo(i);
                }}
                aria-label={`Afficher la diapositive ${i + 1}`}
                aria-current={i === index ? 'true' : undefined}
                className={`h-2 rounded-full transition-all duration-300 ${i === index ? 'w-10 bg-ink-2' : 'w-2 bg-faint hover:bg-muted'}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Mettre en pause' : 'Lire'}
            className="inline-flex size-11 items-center justify-center rounded-full bg-paper-2 text-ink-2 transition-colors hover:bg-paper-3"
          >
            {playing ? <Pause className="size-4 fill-current" aria-hidden /> : <Play className="size-4 fill-current" aria-hidden />}
          </button>
        </div>
      )}
    </section>
  );
}
