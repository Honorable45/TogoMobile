'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FilterTabs, Pager, useDecision } from '@/components/admin/admin-shell';
import { useSession } from '@/components/session';
import { siteHref } from '@/config/brand';
import { Button } from '@/components/ui/button';
import { Alert, Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api-client';
import { fcfa, formatDateTime, PHASE_LABELS } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Page, PromotionPhase } from '@/lib/types';

interface AdminPromotion {
  id: string;
  promoPrice: number;
  referencePrice: number;
  discountPercent: number;
  startsAt: string;
  endsAt: string;
  status: string;
  statusReason: string | null;
  phase: PromotionPhase;
  product: { id: string; title: string; slug: string; price: number };
  shop: { id: string; name: string };
  _count: { events: number };
}

export default function PromotionsAdmin() {
  const [status, setStatus] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  const decide = useDecision();
  const { notify } = useSession();
  const { data, error, reload } = useApi<Page<AdminPromotion>>(`/admin/promotions?page=${page}&pageSize=25${status ? `&status=${status}` : ''}`);

  const suspend = async (p: AdminPromotion) => {
    const r = await decide({ title: `Suspendre la promotion sur « ${p.product.title} » ?`, description: 'Le prix habituel sera de nouveau affiché partout. Le vendeur ne pourra pas la réactiver.', confirmLabel: 'Suspendre', danger: true, reason: 'required' });
    if (!r) return;
    await api(`/admin/promotions/${p.id}/suspend`, { body: { reason: r.reason } }).then(() => { notify('Promotion suspendue'); void reload(); }, (e) => notify(errorMessage(e), 'error'));
  };
  const reinstate = async (p: AdminPromotion) => {
    const r = await decide({ title: 'Rétablir cette promotion ?', confirmLabel: 'Rétablir', reason: 'none' });
    if (!r) return;
    await api(`/admin/promotions/${p.id}/reinstate`, { method: 'POST' }).then(() => { notify('Promotion rétablie'); void reload(); }, (e) => notify(errorMessage(e), 'error'));
  };

  return (
    <>
      <h1 className="display text-[30px] sm:text-[38px]">Promotions</h1>
      <p className="text-sm text-muted">Contrôlez la cohérence entre prix promotionnel et prix de référence. Le prix de référence est calculé automatiquement (plus bas prix des 30 derniers jours).</p>
      <FilterTabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[['ACTIVE', 'Activées'], ['SUSPENDED', 'Suspendues'], ['DISABLED', 'Désactivées'], ['', 'Toutes']]} />
      {error && <Alert tone="danger">{error}</Alert>}
      {!data ? <Skeleton className="h-64" /> : data.items.length === 0 ? <EmptyState title="Aucune promotion" /> : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {data.items.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={p.phase === 'RUNNING' ? 'promo' : p.phase === 'SUSPENDED' ? 'danger' : 'muted'}>{PHASE_LABELS[p.phase]}</Badge>
                  <Link href={siteHref(`/produits/${p.product.slug}`)} target="_blank" className="truncate font-semibold hover:underline">{p.product.title}</Link>
                </div>
                <p>
                  <strong>{fcfa(p.promoPrice)}</strong> au lieu de {fcfa(p.referencePrice)} (−{p.discountPercent} %) · prix actuel du produit : {fcfa(p.product.price)}
                </p>
                <p className="text-xs text-muted">{p.shop.name} · du {formatDateTime(p.startsAt)} au {formatDateTime(p.endsAt)} · {p._count.events} événement(s){p.statusReason ? ` · ${p.statusReason}` : ''}</p>
              </div>
              <div className="shrink-0">
                {p.status === 'SUSPENDED' ? <Button size="sm" variant="outline" onClick={() => reinstate(p)}>Rétablir</Button> : p.phase === 'RUNNING' || p.phase === 'SCHEDULED' ? <Button size="sm" variant="danger" onClick={() => suspend(p)}>Suspendre</Button> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && <Pager page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </>
  );
}
