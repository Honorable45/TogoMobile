'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BadgeCheck, MessageSquareText } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatDate, plural, rating } from '@/lib/format';
import type { ReviewsPage } from '@/lib/types';
import { ReportButton } from './report-button';
import { Button } from './ui/button';
import { DemoBadge, EmptyState, Stars } from './ui/misc';

export function ReviewsSection({ initial, endpoint, showProduct }: { initial: ReviewsPage; endpoint: string; showProduct?: boolean }) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const { summary } = initial;

  const more = async () => {
    setLoading(true);
    try {
      const next = await api<ReviewsPage>(`${endpoint}?page=${data.page + 1}&pageSize=${data.pageSize}`);
      setData({ ...next, items: [...data.items, ...next.items] });
    } finally {
      setLoading(false);
    }
  };

  if (!summary.count) {
    return (
      <EmptyState icon={<MessageSquareText className="size-9" />} title="Pas encore d’avis">
        Les avis sont réservés aux clients dont l’achat a été enregistré par le vendeur et confirmé par le client, via le QR code remis lors de la vente.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-8 md:grid-cols-[16rem_1fr]">
      <div>
        <div className="flex items-end gap-2">
          <span className="display num text-[56px]">{rating(summary.average)}</span>
          <span className="pb-1 text-sm text-muted">/ 5</span>
        </div>
        <Stars value={summary.average} size={18} />
        <p className="mt-1 text-sm text-muted">{plural(summary.count, 'avis vérifié', 'avis vérifiés')}</p>
        <ul className="mt-4 space-y-1.5" aria-label="Répartition des notes">
          {summary.distribution.map((d) => (
            <li key={d.rating} className="flex items-center gap-2 text-xs">
              <span className="w-12 text-muted">{d.rating} étoile{d.rating > 1 ? 's' : ''}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                <span className="block h-full rounded-full bg-promo-600" style={{ width: `${summary.count ? (d.count / summary.count) * 100 : 0}%` }} />
              </span>
              <span className="w-6 text-right tabular-nums text-muted">{d.count}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-muted">
          « Achat vérifié » : vente déclarée par le vendeur et confirmée par le client selon la procédure de la plateforme. Le paiement, conclu hors plateforme, n’est pas contrôlé.{' '}
          <Link href="/moderation" className="underline">En savoir plus</Link>
        </p>
      </div>
      <div>
        <ul className="divide-y divide-line rounded-card border border-line bg-surface px-5">
          {data.items.map((r) => (
            <li key={r.id} className="py-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Stars value={r.rating} />
                <span className="text-sm font-medium">{r.authorName}</span>
                {r.verifiedPurchase && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-ok">
                    <BadgeCheck className="size-3.5" aria-hidden /> Achat vérifié
                  </span>
                )}
                {r.isDemo && <DemoBadge />}
                <span className="text-xs text-muted">{formatDate(r.createdAt)}</span>
              </div>
              {showProduct && r.product && (
                <Link href={`/produits/${r.product.slug}`} className="mt-1 block text-xs font-semibold text-muted hover:underline">
                  {r.product.title}
                </Link>
              )}
              {r.comment && <p className="mt-2 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink">{r.comment}</p>}
              <div className="mt-2">
                <ReportButton targetType="REVIEW" targetId={r.id} label="Signaler cet avis" compact />
              </div>
            </li>
          ))}
        </ul>
        {data.page < data.totalPages && (
          <Button variant="outline" onClick={more} loading={loading} className="mt-4">
            Afficher plus d’avis
          </Button>
        )}
      </div>
    </div>
  );
}
