'use client';

import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

const INTERVAL_MS = 4000;
const RESUME_AFTER_TOUCH_MS = 8000;

/**
 * Rangée de cartes qui défile horizontalement, avec flèches en bas à droite (façon apple.com).
 * Les cartes s'alignent sur la marge du contenu et la dernière visible dépasse pour inviter à faire défiler.
 *
 * `auto` : avance d'une carte toutes les 4 s (de droite à gauche), puis revient au début.
 * Pas de défilement continu : une carte qui bouge sans arrêt ne se lit pas et ne se touche pas.
 * Pause au survol, au toucher (reprise après 8 s), au focus clavier, hors de l'écran, onglet masqué,
 * et aucune animation si le système demande de réduire les mouvements. Bouton pause pour l'arrêter.
 */
export function ScrollRow({ children, label, auto = false, className = '' }: { children: ReactNode; label: string; auto?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const [stopped, setStopped] = useState(false); // choix explicite de la personne (bouton)
  const [hold, setHold] = useState(false); // survol, toucher, focus
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const resume = useRef<ReturnType<typeof setTimeout>>(undefined);

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
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.4 });
    io.observe(el);
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    return () => {
      ro.disconnect();
      io.disconnect();
      clearTimeout(resume.current);
    };
  }, [update]);

  const step = () => {
    const el = ref.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return el ? el.clientWidth * 0.8 : 0;
    return card.offsetWidth + parseFloat(getComputedStyle(el).columnGap || '0');
  };

  const playing = auto && !reduced && !stopped && !hold && visible;

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const el = ref.current;
      if (!el || document.hidden) return;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + step(), behavior: 'smooth' });
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [playing]);

  const go = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    setStopped(true); // la personne a pris la main : on ne lui reprend pas
    el.scrollBy({ left: dir * Math.max(step(), el.clientWidth * 0.8), behavior: 'smooth' });
  };

  const holdThenResume = () => {
    setHold(true);
    clearTimeout(resume.current);
    resume.current = setTimeout(() => setHold(false), RESUME_AFTER_TOUCH_MS);
  };

  const button =
    'inline-flex size-9 items-center justify-center rounded-full bg-paper-2 text-ink-2 transition-colors hover:bg-paper-3 disabled:cursor-default disabled:opacity-35';

  return (
    <div className={className}>
      <div
        ref={ref}
        onScroll={update}
        role="region"
        aria-label={label}
        aria-roledescription={auto ? 'carrousel' : undefined}
        tabIndex={0}
        onMouseEnter={() => setHold(true)}
        onMouseLeave={() => setHold(false)}
        onFocusCapture={() => setHold(true)}
        onBlurCapture={() => setHold(false)}
        onTouchStart={holdThenResume}
        className="scroller gap-4 pb-6 pl-[max(1rem,calc((100vw-76rem)/2+1.5rem))] pr-4 scroll-pl-[max(1rem,calc((100vw-76rem)/2+1.5rem))] sm:pl-[max(1.5rem,calc((100vw-76rem)/2+1.5rem))] md:gap-5"
      >
        {children}
      </div>
      {!(edges.start && edges.end) && (
        <div className="container-page flex justify-end gap-3">
          {auto && !reduced && (
            <button
              type="button"
              className={button}
              onClick={() => setStopped((s) => !s)}
              aria-label={stopped ? `Reprendre le défilement : ${label}` : `Mettre en pause : ${label}`}
            >
              {stopped ? <Play className="size-4 fill-current" aria-hidden /> : <Pause className="size-4 fill-current" aria-hidden />}
            </button>
          )}
          <button type="button" className={button} onClick={() => go(-1)} disabled={edges.start} aria-label="Précédent">
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button type="button" className={button} onClick={() => go(1)} disabled={edges.end} aria-label="Suivant">
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
