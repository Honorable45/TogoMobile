'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { FilterTabs, Pager, useDecision } from '@/components/admin/admin-shell';
import { ProductImage } from '@/components/media';
import { useSession } from '@/components/session';
import { siteHref } from '@/config/brand';
import { Button } from '@/components/ui/button';
import { Alert, Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api-client';
import { AVAILABILITY_LABELS, CONDITION_LABELS, fcfa, formatDate } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Availability, Condition, Page, PublicationStatus } from '@/lib/types';

interface AdminProduct {
  id: string;
  title: string;
  slug: string;
  reference: string;
  price: number;
  condition: Condition;
  availability: Availability;
  status: PublicationStatus;
  moderation: 'PENDING' | 'APPROVED' | 'REJECTED';
  moderationNote: string | null;
  removedAt: string | null;
  removalReason: string | null;
  imageUrl: string | null;
  updatedAt: string;
  shop: { id: string; name: string; slug: string; status: string };
  brand: { name: string };
}

export default function ProductsAdmin() {
  const [filter, setFilter] = useState('moderation');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const decide = useDecision();
  const { notify } = useSession();
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: '25',
    ...(filter === 'moderation' ? { moderation: 'PENDING' } : filter ? { removed: filter } : {}),
    ...(q ? { q } : {}),
  });

  const moderate = async (p: AdminProduct, approve: boolean) => {
    const r = await decide({
      title: approve ? `Approuver « ${p.title} » ?` : `Refuser « ${p.title} » ?`,
      description: approve ? 'L’annonce devient visible dans le catalogue.' : 'Le vendeur verra le motif et pourra corriger puis republier.',
      confirmLabel: approve ? 'Approuver' : 'Refuser',
      danger: !approve,
      reason: approve ? 'none' : 'required',
      reasonLabel: 'Ce que le vendeur doit corriger',
    });
    if (!r) return;
    await api(`/admin/products/${p.id}/moderate`, { body: { approve, note: r.reason } }).then(() => {
      notify(approve ? 'Annonce approuvée' : 'Annonce refusée');
      void reload();
    }, (e) => notify(errorMessage(e), 'error'));
  };
  const { data, error, reload } = useApi<Page<AdminProduct>>(`/admin/products?${qs}`);

  const remove = async (p: AdminProduct) => {
    const r = await decide({
      title: `Retirer « ${p.title} » ?`,
      description: 'L’annonce disparaît immédiatement du site et le vendeur ne peut plus la modifier. Le motif lui est affiché.',
      confirmLabel: 'Retirer l’annonce',
      danger: true,
      reason: 'required',
    });
    if (!r) return;
    try {
      await api(`/admin/products/${p.id}/remove`, { body: { reason: r.reason } });
      notify('Annonce retirée');
      void reload();
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  };

  const restore = async (p: AdminProduct) => {
    const r = await decide({ title: `Rétablir « ${p.title} » ?`, confirmLabel: 'Rétablir', reason: 'none' });
    if (!r) return;
    await api(`/admin/products/${p.id}/restore`, { method: 'POST' }).then(() => { notify('Annonce rétablie'); void reload(); }, (e) => notify(errorMessage(e), 'error'));
  };

  return (
    <>
      <h1 className="display text-[30px] sm:text-[38px]">Annonces</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs value={filter} onChange={(v) => { setFilter(v); setPage(1); }} options={[['moderation', 'À valider'], ['', 'Toutes'], ['false', 'En ligne ou brouillon'], ['true', 'Retirées par l’administration']]} />
        <form onSubmit={(e) => { e.preventDefault(); setQ(String(new FormData(e.currentTarget).get('q') ?? '')); setPage(1); }}>
          <label htmlFor="p-search" className="sr-only">Rechercher</label>
          <input id="p-search" name="q" placeholder="Titre ou référence (TM-…)" className="h-9 rounded-lg border border-line bg-surface px-3 text-sm" />
        </form>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {!data ? <Skeleton className="h-64" /> : data.items.length === 0 ? <EmptyState title="Aucune annonce" /> : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {data.items.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 gap-3">
                <ProductImage src={p.imageUrl} alt={p.title} className="size-14 shrink-0 rounded-lg" />
                <div className="min-w-0 text-sm">
                  <p className="truncate font-semibold">{p.title}</p>
                  <p className="text-xs text-muted">{p.reference} · {fcfa(p.price)} · {CONDITION_LABELS[p.condition]} · {AVAILABILITY_LABELS[p.availability]}</p>
                  <p className="text-xs text-muted">{p.shop.name} · mise à jour {formatDate(p.updatedAt)}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge tone={p.status === 'PUBLISHED' ? 'brand' : 'muted'}>{p.status === 'PUBLISHED' ? 'Publiée' : p.status === 'DRAFT' ? 'Brouillon' : 'Retirée par le vendeur'}</Badge>
                    {p.removedAt && <Badge tone="danger">Retirée par l’administration{p.removalReason ? ` : ${p.removalReason}` : ''}</Badge>}
                    {p.status === 'PUBLISHED' && p.moderation !== 'APPROVED' && (
                      <Badge tone={p.moderation === 'PENDING' ? 'warn' : 'danger'}>{p.moderation === 'PENDING' ? 'À valider' : 'Refusée'}</Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {p.status === 'PUBLISHED' && p.moderation === 'APPROVED' && !p.removedAt && (
                  <Link href={siteHref(`/produits/${p.slug}`)} target="_blank" className="inline-flex h-9 items-center gap-1 px-2 text-sm font-semibold text-brand-700"><ExternalLink className="size-4" aria-hidden /> Voir</Link>
                )}
                {p.status === 'PUBLISHED' && p.moderation === 'PENDING' && !p.removedAt && (
                  <>
                    <Button size="sm" onClick={() => moderate(p, true)}>Approuver</Button>
                    <Button size="sm" variant="outline" onClick={() => moderate(p, false)}>Refuser</Button>
                  </>
                )}
                {p.removedAt ? <Button size="sm" variant="outline" onClick={() => restore(p)}>Rétablir</Button> : <Button size="sm" variant="danger" onClick={() => remove(p)}>Retirer</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && <Pager page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </>
  );
}
