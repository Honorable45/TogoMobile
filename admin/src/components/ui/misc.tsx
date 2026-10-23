import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Info, Star } from 'lucide-react';
import { fcfa, rating as fmtRating } from '@/lib/format';

type Tone = 'neutral' | 'brand' | 'promo' | 'ok' | 'warn' | 'danger' | 'muted' | 'navy';
const tones: Record<Tone, string> = {
  neutral: 'bg-paper-2 text-ink-2',
  brand: 'bg-brand-50 text-brand-700',
  navy: 'bg-navy text-white',
  promo: 'bg-promo-600 text-white',
  ok: 'bg-ok-50 text-ok',
  warn: 'bg-warn-50 text-warn',
  danger: 'bg-danger-50 text-danger',
  muted: 'bg-surface text-muted ring-1 ring-line',
};

/** Badge en petites capitales, coins presque droits. */
export function Badge({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[10.5px] font-semibold uppercase leading-4 tracking-[0.08em] ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** Étoiles en lecture seule ; la note est aussi donnée en texte (pas uniquement par la couleur). */
export function Stars({ value, size = 14, label = true }: { value: number; size?: number; label?: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Note : ${fmtRating(value)} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }} aria-hidden>
            <Star className="absolute inset-0 text-line-2" style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="text-star" style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        );
      })}
      {label && <span className="sr-only">{fmtRating(value)} sur 5</span>}
    </span>
  );
}

export function RatingInline({ avg, count }: { avg: number; count: number }) {
  if (!count) return <span className="text-xs text-muted">Pas encore d’avis</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <Stars value={avg} size={12} />
      <span className="num font-medium text-ink">{fmtRating(avg)}</span>
      <span className="num">({count})</span>
    </span>
  );
}

/** Prix en accent, chiffres tabulaires ; prix de référence barré en discret. */
export function PriceTag({ current, reference, size = 'md' }: { current: number; reference?: number | null; size?: 'md' | 'lg' }) {
  const big = size === 'lg';
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span className={`num font-semibold text-brand-600 ${big ? 'text-[28px] leading-tight' : 'text-base'}`}>{fcfa(current)}</span>
      {reference && reference > current && (
        <span className={`num text-muted line-through ${big ? 'text-base' : 'text-xs'}`}>
          <span className="sr-only">Prix de référence : </span>
          {fcfa(reference)}
        </span>
      )}
    </span>
  );
}

/** Encadré d'information (verre clair) ; succès avec filet gauche. */
export function Alert({ tone = 'info', title, children }: { tone?: 'info' | 'success' | 'warn' | 'danger'; title?: string; children?: ReactNode }) {
  const map = {
    info: { cls: 'glass-light text-ink-2', Icon: Info, icon: 'text-brand-600' },
    success: { cls: 'border-l-2 border-ok bg-ok-50 text-ok', Icon: CheckCircle2, icon: '' },
    warn: { cls: 'bg-warn-50 text-warn', Icon: AlertCircle, icon: '' },
    danger: { cls: 'bg-danger-50 text-danger', Icon: AlertCircle, icon: '' },
  }[tone];
  return (
    <div className={`flex gap-3 rounded-2xl p-4 text-sm ${map.cls}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <map.Icon className={`mt-0.5 size-4 shrink-0 ${map.icon}`} aria-hidden />
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="glass-light flex flex-col items-center rounded-3xl px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="display text-2xl text-ink">{title}</p>
      {children && <div className="mt-2 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-line bg-surface ${className}`}>{children}</div>;
}

export function SectionTitle({ title, href, linkLabel = 'Tout voir', eyebrow }: { title: string; href?: string; linkLabel?: string; eyebrow?: string; subtitle?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="display text-[26px] text-ink sm:text-[36px]">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-brand-600 underline decoration-brand-200 underline-offset-4 hover:decoration-brand-600">
          {linkLabel}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** Pagination par liens : conserve tous les paramètres (filtres, tri) de l'URL. */
export function Pagination({ page, totalPages, hrefFor }: { page: number; totalPages: number; hrefFor: (p: number) => string }) {
  if (totalPages <= 1) return null;
  const pages = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages));
  const list = [...pages].sort((a, b) => a - b);
  const item = 'num inline-flex size-11 items-center justify-center rounded-full text-sm font-medium';
  return (
    <nav className="mt-10 flex items-center justify-center gap-1" aria-label="Pagination">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={`${item} hover:bg-surface`} aria-label="Page précédente" rel="prev">
          <ChevronLeft className="size-5" />
        </Link>
      ) : (
        <span className={`${item} text-faint`} aria-hidden>
          <ChevronLeft className="size-5" />
        </span>
      )}
      {list.map((p, i) => (
        <span key={p} className="flex items-center">
          {i > 0 && list[i - 1] !== p - 1 && <span className="px-1 text-muted">…</span>}
          <Link href={hrefFor(p)} aria-current={p === page ? 'page' : undefined} className={`${item} ${p === page ? 'bg-navy text-white' : 'hover:bg-surface'}`}>
            {p}
          </Link>
        </span>
      ))}
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} className={`${item} hover:bg-surface`} aria-label="Page suivante" rel="next">
          <ChevronRight className="size-5" />
        </Link>
      ) : (
        <span className={`${item} text-faint`} aria-hidden>
          <ChevronRight className="size-5" />
        </span>
      )}
    </nav>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-paper-2 ${className}`} aria-hidden />;
}

export function DemoBadge() {
  return <Badge tone="warn">Démo</Badge>;
}
