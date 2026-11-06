'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

const INTERVAL_MS = 3500;

/**
 * Rangée horizontale qui avance d'une carte toutes les 3,5 s, puis revient au début.
 * Reste utilisable au doigt ; se met en pause au survol, au toucher, au focus clavier,
 * quand l'onglet est masqué, et ne bouge pas si le navigateur demande de réduire les animations.
 */
export function AutoScrollRow({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const resume = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el || paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      const card = el.firstElementChild as HTMLElement | null;
      if (!card) return;
      const step = card.offsetWidth + parseFloat(getComputedStyle(el).columnGap || '0');
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + step, behavior: 'smooth' });
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [paused]);

  // Après une interaction tactile, l'animation reprend au bout de quelques secondes.
  const pauseThenResume = () => {
    setPaused(true);
    clearTimeout(resume.current);
    resume.current = setTimeout(() => setPaused(false), 6000);
  };
  useEffect(() => () => clearTimeout(resume.current), []);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={pauseThenResume}
      className="scrollbar-none relative -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 md:mx-0 md:gap-4 md:px-0 lg:gap-5"
    >
      {children}
    </div>
  );
}
