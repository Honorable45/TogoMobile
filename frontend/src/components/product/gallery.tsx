'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, Maximize2, Play, X } from 'lucide-react';
import type { PublicMedia } from '@/lib/types';

function SafeImage({
  src,
  srcSet,
  sizes,
  width,
  height,
  alt,
  className,
  eager,
}: {
  src: string;
  srcSet?: string;
  sizes?: string;
  width?: number | null;
  height?: number | null;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 bg-canvas text-subtle ${className}`}>
        <ImageOff className="size-8" aria-hidden />
        <span className="text-xs">Image indisponible</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      width={width ?? undefined}
      height={height ?? undefined}
      alt={alt}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : undefined}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Galerie : défilement tactile natif (scroll-snap), vignettes, agrandissement plein écran.
 * La vidéo n'est chargée qu'au moment où l'utilisateur la lance (preload="none").
 */
export function Gallery({ media, title }: { media: PublicMedia[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const items = media.length ? media : [];

  const goTo = useCallback((i: number) => {
    const n = Math.max(0, Math.min(items.length - 1, i));
    setIndex(n);
    const el = track.current;
    if (el) el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
  }, [items.length]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (zoom && !d.open) d.showModal();
    if (!zoom && d.open) d.close();
  }, [zoom]);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(items.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom, items.length]);

  if (!items.length) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-3xl border border-line bg-paper-2 text-faint">
        <ImageOff className="size-10" aria-hidden />
      </div>
    );
  }

  const current = items[index];
  const imageCount = items.filter((m) => m.type === 'IMAGE').length;

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-paper-2">
        <div ref={track} className="scrollbar-none flex aspect-square snap-x snap-mandatory overflow-x-auto" aria-roledescription="galerie" aria-label={`Photos et vidéo de ${title}`}>
          {items.map((m, i) => (
            <div key={m.id} className="relative size-full shrink-0 snap-center" aria-label={`${i + 1} sur ${items.length}`} role="group">
              {m.type === 'IMAGE' ? (
                <button type="button" className="size-full cursor-zoom-in" onClick={() => setZoom(true)} aria-label={`Agrandir la photo ${i + 1}`}>
                  <SafeImage
                    src={m.mediumUrl ?? m.url}
                    srcSet={m.mediumUrl ? `${m.mediumUrl} 960w, ${m.url} 1600w` : undefined}
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    width={m.width}
                    height={m.height}
                    alt={`${title} — photo ${i + 1} sur ${imageCount}`}
                    className="size-full object-contain"
                    eager={i === 0}
                  />
                </button>
              ) : (
                <video
                  src={m.url}
                  controls
                  playsInline
                  preload="none"
                  poster={m.posterUrl ?? items.find((x) => x.type === 'IMAGE')?.mediumUrl ?? undefined}
                  className="size-full bg-navy object-contain"
                  aria-label={`Vidéo de ${title}`}
                >
                  Votre navigateur ne peut pas lire cette vidéo.
                </video>
              )}
            </div>
          ))}
        </div>
        {items.length > 1 && (
          <>
            <button type="button" onClick={() => goTo(index - 1)} disabled={index === 0} className="glass-light absolute left-3 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full disabled:opacity-0 sm:inline-flex" aria-label="Média précédent">
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" onClick={() => goTo(index + 1)} disabled={index === items.length - 1} className="glass-light absolute right-3 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full disabled:opacity-0 sm:inline-flex" aria-label="Média suivant">
              <ChevronRight className="size-5" />
            </button>
            <span className="glass-dark num absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-xs font-medium text-white" aria-hidden>
              {index + 1}/{items.length}
            </span>
          </>
        )}
        {current?.type === 'IMAGE' && (
          <button type="button" onClick={() => setZoom(true)} className="glass-light absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-full" aria-label="Agrandir">
            <Maximize2 className="size-4" />
          </button>
        )}
      </div>

      {items.length > 1 && (
        <div className="flex gap-2" role="tablist" aria-label="Choisir un média">
          {items.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={m.type === 'VIDEO' ? 'Vidéo' : `Photo ${i + 1}`}
              onClick={() => goTo(i)}
              className={`relative size-16 overflow-hidden rounded-xl border-2 bg-paper-2 ${i === index ? 'border-navy' : 'border-line'}`}
            >
              {m.type === 'IMAGE' ? (
                <SafeImage src={m.thumbUrl ?? m.url} alt="" width={64} height={64} className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center bg-navy text-white">
                  <Play className="size-5" aria-hidden />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <dialog ref={dialog} onClose={() => setZoom(false)} className="m-0 h-dvh max-h-none w-screen max-w-none bg-navy/95 p-0 backdrop:bg-navy/80" aria-label="Photo agrandie">
        {zoom && current && (
          <div className="relative flex size-full items-center justify-center" onClick={(e) => e.target === e.currentTarget && setZoom(false)}>
            {current.type === 'IMAGE' ? (
              <SafeImage src={current.url} alt={`${title} — photo agrandie`} className="max-h-full max-w-full object-contain" eager />
            ) : (
              <p className="text-white">Utilisez le lecteur de la page pour regarder la vidéo.</p>
            )}
            <button type="button" onClick={() => setZoom(false)} className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Fermer">
              <X className="size-6" />
            </button>
            {index > 0 && (
              <button type="button" onClick={() => setIndex(index - 1)} className="absolute left-3 inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white" aria-label="Précédent">
                <ChevronLeft className="size-6" />
              </button>
            )}
            {index < items.length - 1 && (
              <button type="button" onClick={() => setIndex(index + 1)} className="absolute right-3 inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white" aria-label="Suivant">
                <ChevronRight className="size-6" />
              </button>
            )}
          </div>
        )}
      </dialog>
    </div>
  );
}
