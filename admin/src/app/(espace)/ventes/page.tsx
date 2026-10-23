'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { FilterTabs, Pager, useDecision } from '@/components/admin/admin-shell';
import { useSession } from '@/components/session';
import { Button } from '@/components/ui/button';
import { Alert, Badge, EmptyState, Skeleton, Stars } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api-client';
import { fcfa, formatDate, formatDateTime, SALE_STATUS_LABELS } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Page, SaleStatus } from '@/lib/types';

interface AdminSale {
  id: string;
  internalRef: string;
  soldAt: string;
  amount: number | null;
  status: SaleStatus;
  statusNote: string | null;
  flags: Array<{ code: string; label: string; scope: string }>;
  confirmedAt: string | null;
  createdAt: string;
  buyerPhoneHint: string | null;
  isDemo: boolean;
  shop: { id: string; name: string; validatedAt: string | null };
  product: { title: string; slug: string };
  buyer: { id: string; name: string; createdAt: string } | null;
  review: { id: string; rating: number; comment: string | null; status: string; verification: string } | null;
  tokens: Array<{ status: string; failedAttempts: number; createdAt: string; usedAt: string | null }>;
}

function SalesAdmin() {
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get('status') ?? 'PENDING_VERIFICATION');
  const [page, setPage] = useState(1);
  const decide = useDecision();
  const { notify } = useSession();
  const { data, error, reload } = useApi<Page<AdminSale>>(`/admin/sales?page=${page}&pageSize=20${status ? `&status=${status}` : ''}`);

  const decideSale = async (s: AdminSale, action: 'verify' | 'dispute' | 'cancel') => {
    const conf = {
      verify: { title: 'Valider cette vente ?', description: 'L’avis associé recevra la mention « Achat vérifié » et sera publié (sauf contenu à modérer).', label: 'Valider la vente' },
      dispute: { title: 'Marquer la vente comme contestée ?', description: 'L’avis perd la mention « Achat vérifié », est masqué et retiré des notes jusqu’à décision.', label: 'Contester' },
      cancel: { title: 'Annuler la vente ?', description: 'La vente est considérée comme non avenue : l’avis associé est rejeté et le QR code désactivé.', label: 'Annuler la vente' },
    }[action];
    const r = await decide({ title: conf.title, description: conf.description, confirmLabel: conf.label, danger: action !== 'verify', reason: action === 'verify' ? 'optional' : 'required' });
    if (!r) return;
    await api(`/admin/sales/${s.id}/decision`, { body: { action, note: r.reason } }).then(() => { notify('Décision enregistrée'); void reload(); }, (e) => notify(errorMessage(e), 'error'));
  };

  return (
    <>
      <h1 className="display text-[30px] sm:text-[38px]">Ventes déclarées</h1>
      <p className="max-w-3xl text-sm text-muted">
        Les ventes sont déclarées par les vendeurs puis confirmées par les clients via le QR code. Les ventes signalées par les contrôles automatiques attendent ici votre décision. Le paiement n’est jamais constaté par la plateforme.
      </p>
      <FilterTabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[['PENDING_VERIFICATION', 'À examiner'], ['DISPUTED', 'Contestées'], ['VERIFIED', 'Vérifiées'], ['DECLARED', 'Non confirmées'], ['CANCELLED', 'Annulées'], ['', 'Toutes']]} />
      {error && <Alert tone="danger">{error}</Alert>}
      {!data ? <Skeleton className="h-64" /> : data.items.length === 0 ? <EmptyState title="Aucune vente dans cette liste" /> : (
        <ul className="space-y-3">
          {data.items.map((s) => (
            <li key={s.id} className="space-y-2 rounded-card border border-line bg-surface p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={s.status === 'VERIFIED' ? 'brand' : s.status === 'PENDING_VERIFICATION' ? 'warn' : s.status === 'DISPUTED' ? 'danger' : 'muted'}>{SALE_STATUS_LABELS[s.status]}</Badge>
                <span className="font-semibold">{s.product.title}</span>
                {s.isDemo && <Badge tone="warn">Démo</Badge>}
              </div>
              <div className="grid gap-1 text-xs text-muted sm:grid-cols-2">
                <p>Boutique : {s.shop.name}{s.shop.validatedAt ? `, validée le ${formatDate(s.shop.validatedAt)}` : ''}</p>
                <p>Réf. {s.internalRef} · vendue le {formatDateTime(s.soldAt)}{s.amount ? ` · ${fcfa(s.amount)}` : ''} · déclarée le {formatDateTime(s.createdAt)}</p>
                <p>Acheteur : {s.buyer ? `${s.buyer.name} (compte créé le ${formatDate(s.buyer.createdAt)})` : 'pas encore confirmé'}{s.buyerPhoneHint ? ` · numéro …${s.buyerPhoneHint}` : ''}</p>
                <p>QR codes : {s.tokens.map((t) => `${t.status.toLowerCase()}${t.failedAttempts ? ` (${t.failedAttempts} essai(s) erroné(s))` : ''}`).join(', ') || 'aucun'}</p>
              </div>
              {s.flags?.length > 0 && (
                <ul className="space-y-0.5 rounded-lg border border-[#fedf89] bg-warn-50 p-2.5 text-xs text-warn">
                  {s.flags.map((f) => <li key={f.code}>• {f.label}</li>)}
                </ul>
              )}
              {s.review && (
                <div className="rounded-lg bg-canvas p-3">
                  <Stars value={s.review.rating} />
                  {s.review.comment && <p className="mt-1">{s.review.comment}</p>}
                </div>
              )}
              {s.statusNote && <p className="text-xs text-muted">Note : {s.statusNote}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                {(s.status === 'PENDING_VERIFICATION' || s.status === 'DISPUTED') && <Button size="sm" onClick={() => decideSale(s, 'verify')}>Valider la vente</Button>}
                {(s.status === 'VERIFIED' || s.status === 'PENDING_VERIFICATION' || s.status === 'DECLARED') && <Button size="sm" variant="outline" onClick={() => decideSale(s, 'dispute')}>Contester</Button>}
                {s.status !== 'CANCELLED' && <Button size="sm" variant="danger" onClick={() => decideSale(s, 'cancel')}>Annuler la vente</Button>}
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
  return <Suspense><SalesAdmin /></Suspense>;
}
