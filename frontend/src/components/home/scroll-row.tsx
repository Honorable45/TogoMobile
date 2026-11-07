'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Rangée de cartes qu'on fait glisser au doigt (ou avec les flèches), façon apple.com.
 * Rien ne bouge tout seul : c'est la personne qui fait défiler.
 *
 * Par défaut, la rangée occupe toute la largeur de l'écran : la première carte s'aligne sur la marge
 * du contenu et la dernière visible dépasse à droite, pour inviter à faire glisser.
 * `inset` : rangée placée dans un bloc déjà centré (fiche produit, par exemple).
 */
export function ScrollRow({ children, label, inset = false, className = '' }: { children: ReactNode; label: string; inset?: boolean; className?: string }) {
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

  // Une flèche avance d'environ un écran de cartes, en s'arrêtant sur une carte entière (scroll-snap).
  const go = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const arrow =
    'inline-flex size-9 items-center justify-center rounded-full bg-paper-2 text-ink-2 transition-colors hover:bg-paper-3 disabled:cursor-default disabled:opacity-35';
  const bleed =
    'pl-[max(1rem,calc((100vw-76rem)/2+1.5rem))] pr-4 scroll-pl-[max(1rem,calc((100vw-76rem)/2+1.5rem))] sm:pl-[max(1.5rem,calc((100vw-76rem)/2+1.5rem))]';
  // Dans un bloc centré : la rangée déborde jusqu'aux bords de l'écran sur mobile, reste dans la colonne au-delà.
  const insetPad = '-mx-4 px-4 scroll-pl-4 sm:-mx-6 sm:px-6 sm:scroll-pl-6 lg:mx-0 lg:px-0 lg:scroll-pl-0';

  return (
    <div className={className}>
      <div
        ref={ref}
        onScroll={update}
        role="region"
        aria-label={label}
        tabIndex={0}
        className={`scroller gap-4 pb-6 md:gap-5 ${inset ? insetPad : bleed}`}
      >
        {children}
      </div>
      {!(edges.start && edges.end) && (
        <div className={`flex justify-end gap-3 ${inset ? '' : 'container-page'}`}>
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
