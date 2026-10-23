'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { FilterTabs, Pager, useDecision } from '@/components/admin/admin-shell';
import { useSession } from '@/components/session';
import { siteHref } from '@/config/brand';
import { Button } from '@/components/ui/button';
import { Alert, Badge, EmptyState, Skeleton, Stars } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api-client';
import { formatDate, formatDateTime, REVIEW_STATUS_LABELS, SALE_STATUS_LABELS } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Page, ReviewStatus, ReviewVerification, SaleStatus } from '@/lib/types';

interface AdminReview {
  id: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  verification: ReviewVerification;
  moderationNote: string | null;
  isDemo: boolean;
  createdAt: string;
  reports: number;
  author: { id: string; name: string; email: string | null; createdAt: string };
  product: { title: string; slug: string };
  shop: { name: string; slug: string };
  sale: { id: string; status: SaleStatus; internalRef: string; soldAt: string; confirmedAt: string | null; flags: Array<{ code: string; label: string; scope: string }> };
}

const VERIF: Record<ReviewVerification, string> = { VERIFIED_PURCHASE: 'Achat vérifié', PENDING: 'Vente en examen', REVOKED: 'Vérification retirée' };

function ReviewsAdmin() {
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get('status') ?? 'PENDING');
  const [page, setPage] = useState(1);
  const decide = useDecision();
  const { notify } = useSession();
  const { data, error, reload } = useApi<Page<AdminReview>>(`/admin/reviews?page=${page}&pageSize=20${status ? `&status=${status}` : ''}`);

  const moderate = async (r: AdminReview, action: 'publish' | 'hide' | 'reject') => {
    const labels = { publish: 'Publier', hide: 'Masquer', reject: 'Rejeter' };
    const d = await decide({
      title: `${labels[action]} cet avis ?`,
      description: action === 'publish' ? 'L’avis sera visible et comptera dans les notes.' : 'L’avis ne sera plus visible ni compté dans les notes.',
      confirmLabel: labels[action],
      danger: action !== 'publish',
      reason: action === 'publish' ? 'optional' : 'required',
    });
    if (!d) return;
    await api(`/admin/reviews/${r.id}/moderate`, { body: { action, note: d.reason } }).then(() => { notify('Décision enregistrée'); void reload(); }, (e) => notify(errorMessage(e), 'error'));
  };

  return (
    <>
      <h1 className="display text-[30px] sm:text-[38px]">Modération des avis</h1>
      <FilterTabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[['PENDING', 'À modérer'], ['PUBLISHED', 'Publiés'], ['HIDDEN', 'Masqués'], ['REJECTED', 'Rejetés'], ['', 'Tous']]} />
      {error && <Alert tone="danger">{error}</Alert>}
      {!data ? <Skeleton className="h-64" /> : data.items.length === 0 ? <EmptyState title="Aucun avis dans cette liste" /> : (
        <ul className="space-y-3">
          {data.items.map((r) => (
            <li key={r.id} className="space-y-2 rounded-card border border-line bg-surface p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Stars value={r.rating} />
                <Badge tone={r.status === 'PUBLISHED' ? 'brand' : r.status === 'PENDING' ? 'warn' : 'muted'}>{REVIEW_STATUS_LABELS[r.status]}</Badge>
                <Badge tone={r.verification === 'VERIFIED_PURCHASE' ? 'brand' : 'neutral'}>{VERIF[r.verification]}</Badge>
                {r.reports > 0 && <Badge tone="danger">{r.reports} signalement(s)</Badge>}
                {r.isDemo && <Badge tone="warn">Démo</Badge>}
              </div>
              <p className="text-muted">
                <Link href={siteHref(`/produits/${r.product.slug}`)} target="_blank" className="font-semibold text-ink hover:underline">{r.product.title}</Link> · {r.shop.name} · {formatDateTime(r.createdAt)}
              </p>
              {r.comment ? <p className="whitespace-pre-line rounded-lg bg-canvas p-3 text-[0.9375rem]">{r.comment}</p> : <p className="text-subtle">Sans commentaire</p>}
              <div className="grid gap-1 text-xs text-muted sm:grid-cols-2">
                <p>Auteur : {r.author.name} ({r.author.email ?? 'sans e-mail'}), compte créé le {formatDate(r.author.createdAt)}</p>
                <p>Vente {r.sale.internalRef} du {formatDate(r.sale.soldAt)} — <strong>{SALE_STATUS_LABELS[r.sale.status]}</strong></p>
              </div>
              {r.sale.flags?.length > 0 && (
                <ul className="space-y-0.5 rounded-lg border border-[#fedf89] bg-warn-50 p-2.5 text-xs text-warn">
                  {r.sale.flags.map((f) => <li key={f.code}>• {f.label}</li>)}
                </ul>
              )}
              {r.moderationNote && <p className="text-xs text-muted">Note de modération : {r.moderationNote}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                {r.status !== 'PUBLISHED' && (
                  <Button size="sm" disabled={r.sale.status !== 'VERIFIED'} title={r.sale.status !== 'VERIFIED' ? 'Vérifiez d’abord la vente associée' : undefined} onClick={() => moderate(r, 'publish')}>Publier</Button>
                )}
                {r.status !== 'HIDDEN' && <Button size="sm" variant="outline" onClick={() => moderate(r, 'hide')}>Masquer</Button>}
                {r.status !== 'REJECTED' && <Button size="sm" variant="danger" onClick={() => moderate(r, 'reject')}>Rejeter</Button>}
                {r.sale.status !== 'VERIFIED' && <Link href="/ventes?status=PENDING_VERIFICATION" className="inline-flex h-9 items-center px-2 text-sm font-semibold text-brand-700 hover:underline">Examiner la vente</Link>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && <Pager page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </>
  );
}

export default function Page() {
  return <Suspense><ReviewsAdmin /></Suspense>;
}
