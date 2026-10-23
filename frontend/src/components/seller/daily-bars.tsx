'use client';

import { useState } from 'react';
import { formatDate } from '@/lib/format';

/**
 * Histogramme journalier à une seule série (30 jours). Une mesure par graphique :
 * consultations et clics WhatsApp n'ont pas la même échelle, ils ne partagent donc pas d'axe.
 * Survol / focus : info-bulle ; tableau équivalent disponible pour les lecteurs d'écran.
 */
export function DailyBars({ title, data, unit }: { title: string; data: Array<{ day: string; value: number }>; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((a, d) => a + d.value, 0);
  const W = 300;
  const H = 72;
  const step = W / data.length;
  const barW = Math.max(2, step - 2); // espace de 2 px entre les barres
  const h = hover !== null ? data[hover] : null;

  return (
    <figure className="rounded-card border border-line bg-surface p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="text-xs text-muted">
          {total.toLocaleString('fr-FR')} sur 30 jours
        </span>
      </figcaption>
      <div className="relative mt-3">
        <svg viewBox={`0 0 ${W} ${H + 1}`} className="h-20 w-full" preserveAspectRatio="none" role="img" aria-label={`${title} : ${total} sur 30 jours, maximum ${max} par jour`} onMouseLeave={() => setHover(null)}>
          {data.map((d, i) => {
            const bh = d.value ? Math.max(3, (d.value / max) * H) : 0;
            const x = i * step + 1;
            return (
              <g key={d.day}>
                {/* zone de survol plus large que la barre */}
                <rect x={i * step} y={0} width={step} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
                {bh > 0 && (
                  <path
                    d={`M${x},${H} v${-(bh - 2)} q0,-2 2,-2 h${barW - 4} q2,0 2,2 v${bh - 2} z`}
                    className={hover === i ? 'fill-brand-600' : 'fill-[#3a5c9c]'}
                    pointerEvents="none"
                  />
                )}
              </g>
            );
          })}
          <line x1={0} x2={W} y1={H + 0.5} y2={H + 0.5} className="stroke-line" strokeWidth={1} />
        </svg>
        {h && (
          <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-navy px-2.5 py-1 text-xs text-white shadow-pop">
            {formatDate(h.day, { day: 'numeric', month: 'short' })} · {h.value.toLocaleString('fr-FR')} {unit}
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[0.6875rem] text-subtle" aria-hidden>
        <span>{data[0] && formatDate(data[0].day, { day: 'numeric', month: 'short' })}</span>
        <span>Aujourd’hui</span>
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">Voir les données</summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-left"><th className="font-semibold">Jour</th><th className="text-right font-semibold">{unit}</th></tr>
          </thead>
          <tbody>
            {data.filter((d) => d.value > 0).map((d) => (
              <tr key={d.day}><td>{formatDate(d.day, { day: 'numeric', month: 'short' })}</td><td className="text-right tabular-nums">{d.value}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Complète la série avec des zéros pour les jours sans activité. */
export function fillDays<T extends { day: string }>(rows: T[], pick: (r: T) => number, days = 30) {
  const map = new Map(rows.map((r) => [r.day, pick(r)]));
  const out: Array<{ day: string; value: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    out.push({ day: d, value: map.get(d) ?? 0 });
  }
  return out;
}
