'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Rangée de cartes qui défile horizontalement, avec flèches en bas à droite (façon apple.com).
 * Les cartes s'alignent sur la marge du contenu et la dernière visible dépasse pour inviter à faire défiler.
 */
export function ScrollRow({ children, label, className = '' }: { children: ReactNode; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);

  const go = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const arrow =
    'inline-flex size-9 items-center justify-center rounded-full bg-paper-2 text-ink-2 transition-colors hover:bg-paper-3 disabled:cursor-default disabled:opacity-35';

  return (
    <div className={className}>
      <div
        ref={ref}
        onScroll={update}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="scroller gap-4 pb-6 pl-[max(1rem,calc((100vw-76rem)/2+1.5rem))] pr-4 scroll-pl-[max(1rem,calc((100vw-76rem)/2+1.5rem))] sm:pl-[max(1.5rem,calc((100vw-76rem)/2+1.5rem))] md:gap-5"
      >
        {children}
      </div>
      {!(edges.start && edges.end) && (
        <div className="container-page flex justify-end gap-3">
          <button type="button" className={arrow} onClick={() => go(-1)} disabled={edges.start} aria-label="Précédent">
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button type="button" className={arrow} onClick={() => go(1)} disabled={edges.end} aria-label="Suivant">
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
