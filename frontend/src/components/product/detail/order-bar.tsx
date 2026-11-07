'use client';

import { useEffect, useState } from 'react';
import { CONDITION_LABELS, fcfa, storageLabel } from '@/lib/format';
import type { ProductDetail } from '@/lib/types';
import { WhatsAppOrderButton } from '../whatsapp-button';

/**
 * Barre « Commander » fixée en bas de l'écran :
 * elle apparaît dès que le bouton principal (#main-cta) sort de l'écran, pour ne jamais avoir deux boutons
 * identiques à l'écran. Sur ordinateur, elle montre aussi le résumé de l'offre (photo, état, stockage,
 * couleur), comme sur les grands sites marchands.
 */
export function OrderBar({ p }: { p: ProductDetail }) {
  const [ctaHidden, setCtaHidden] = useState(false);

  useEffect(() => {
    const cta = document.getElementById('main-cta');
    if (!cta) return;
    const io = new IntersectionObserver(([entry]) => setCtaHidden(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    io.observe(cta);
    return () => io.disconnect();
  }, []);

  const summary = [CONDITION_LABELS[p.condition], storageLabel(p.storageGb), p.color].filter(Boolean).join(' · ');
  return (
    <div
      id="order-bar"
      className={`glass-light fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-[28px] py-2 pl-4 pr-2 transition-[opacity,transform] duration-300 md:inset-x-auto md:left-1/2 md:w-[min(56rem,calc(100%-3rem))] md:-translate-x-1/2 ${
        ctaHidden ? '' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
    >
      {p.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image.thumbUrl} alt="" width={44} height={44} className="hidden size-11 shrink-0 rounded-xl object-cover md:block" />
      )}
      <div className="min-w-0 md:flex-1">
        <p className="hidden truncate text-sm font-medium text-ink md:block">{p.title}</p>
        <p className="hidden truncate text-xs text-muted md:block">{summary}</p>
      </div>
      <div className="min-w-0 shrink-0 text-right">
        <p className="num text-base font-semibold leading-tight text-ink">{fcfa(p.currentPrice)}</p>
        {p.promotion && <p className="num text-xs text-muted line-through">{fcfa(p.promotion.referencePrice)}</p>}
      </div>
      <div className="flex-1 md:w-72 md:flex-none">
        <WhatsAppOrderButton productId={p.id} orderable={p.orderable} />
      </div>
    </div>
  );
}
