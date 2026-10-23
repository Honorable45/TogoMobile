'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { BadgeCheck, ExternalLink, Mail, Phone } from 'lucide-react';
import { FilterTabs, Pager, useDecision } from '@/components/admin/admin-shell';
import { useSession } from '@/components/session';
import { siteHref } from '@/config/brand';
import { ShopLogo } from '@/components/media';
import { Button } from '@/components/ui/button';
import { Alert, Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api-client';
import { formatDate, SHOP_STATUS_LABELS } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Page, ShopStatus } from '@/lib/types';

interface AdminShop {
  id: string;
  name: string;
  slug: string;
  city: string;
  district: string | null;
  description: string | null;
  whatsapp: string;
  phone: string | null;
  status: ShopStatus;
  statusReason: string | null;
  logoUrl: string | null;
  validatedAt: string | null;
  identityVerifiedAt: string | null;
  trustedSeller: boolean;
  pendingChanges: { name?: string; whatsapp?: string; requestedAt?: string } | null;
  socialLinks: Record<string, string>;
  createdAt: string;
  owner: { id: string; name: string; email: string | null; phone: string | null; status: string };
  _count: { products: number; sales: number };
}

function ShopsAdmin() {
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get('status') ?? 'PENDING');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const decide = useDecision();
  const { notify } = useSession();
  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(status === 'CHANGES' ? { pendingChanges: 'true' } : status ? { status } : {}), ...(q ? { q } : {}) });
  const { data, error, reload } = useApi<Page<AdminShop>>(`/admin/shops?${qs}`);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      notify(msg);
      void reload();
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  };

  const setShopStatus = async (s: AdminShop, next: 'ACTIVE' | 'SUSPENDED' | 'REJECTED' | 'CHANGES_REQUESTED') => {
    const labels = { ACTIVE: s.status === 'SUSPENDED' ? 'Réactiver' : 'Valider', SUSPENDED: 'Suspendre', REJECTED: 'Refuser', CHANGES_REQUESTED: 'Demander des corrections' };
    const r = await decide({
      title: `${labels[next]} « ${s.name} » ?`,
      description:
        next === 'ACTIVE'
          ? 'La boutique deviendra visible. Ses annonces resteront soumises à validation tant qu’elle n’est pas « vendeur de confiance ».'
          : next === 'CHANGES_REQUESTED'
            ? 'Le vendeur verra votre message ; sa demande sera réexaminée dès qu’il aura modifié sa boutique.'
            : next === 'SUSPENDED'
            ? 'Toutes ses annonces et promotions seront masquées et le vendeur ne pourra plus rien modifier.'
            : 'Le vendeur pourra corriger sa demande, qui sera alors soumise à nouveau.',
      confirmLabel: labels[next],
      danger: next !== 'ACTIVE',
      reason: next === 'ACTIVE' ? 'optional' : 'required',
    });
    if (!r) return;
    await act(() => api(`/admin/shops/${s.id}/status`, { body: { status: next, reason: r.reason } }), `Boutique : ${labels[next].toLowerCase()} — fait`);
  };

  return (
    <>
      <h1 className="display text-[30px] sm:text-[38px]">Boutiques</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[['PENDING', 'En attente'], ['CHANGES_REQUESTED', 'Corrections demandées'], ['CHANGES', 'Modifications à valider'], ['ACTIVE', 'Actives'], ['SUSPENDED', 'Suspendues'], ['CLOSED', 'Fermées'], ['REJECTED', 'Refusées'], ['', 'Toutes']]}
        />
        <form onSubmit={(e) => { e.preventDefault(); setQ(String(new FormData(e.currentTarget).get('q') ?? '')); setPage(1); }}>
          <label htmlFor="shop-search" className="sr-only">Rechercher</label>
          <input id="shop-search" name="q" placeholder="Nom ou adresse de la boutique" className="h-9 rounded-lg border border-line bg-surface px-3 text-sm" />
        </form>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {!data ? <Skeleton className="h-64" /> : data.items.length === 0 ? <EmptyState title="Aucune boutique dans cette liste" /> : (
        <ul className="space-y-3">
          {data.items.map((s) => (
            <li key={s.id} className="rounded-card border border-line bg-surface p-4">
              <div className="flex flex-col gap-4 lg:flex-row">
                <div className="flex min-w-0 flex-1 gap-3">
                  <ShopLogo src={s.logoUrl} name={s.name} />
                  <div className="min-w-0 space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{s.name}</p>
                      <Badge tone={s.status === 'ACTIVE' ? 'brand' : s.status === 'PENDING' || s.status === 'CHANGES_REQUESTED' ? 'warn' : s.status === 'SUSPENDED' || s.status === 'REJECTED' ? 'danger' : 'muted'}>{SHOP_STATUS_LABELS[s.status]}</Badge>
                      {s.identityVerifiedAt && <Badge tone="brand"><BadgeCheck className="size-3" aria-hidden /> Identité vérifiée</Badge>}
                      {s.trustedSeller && <Badge tone="ok">Vendeur de confiance</Badge>}
                    </div>
                    <p className="text-muted">{[s.district, s.city].filter(Boolean).join(', ')} · WhatsApp {s.whatsapp}{s.phone ? ` · Tél. ${s.phone}` : ''}</p>
                    <p className="text-muted">
                      Responsable : {s.owner.name}
                      {s.owner.email && <> · <Mail className="inline size-3.5" aria-hidden /> {s.owner.email}</>}
                      {s.owner.phone && <> · <Phone className="inline size-3.5" aria-hidden /> {s.owner.phone}</>}
                    </p>
                    <p className="text-xs text-subtle">Demande du {formatDate(s.createdAt)} · {s._count.products} annonces · {s._count.sales} ventes déclarées</p>
                    {s.description && <p className="line-clamp-3 pt-1">{s.description}</p>}
                    {Object.keys(s.socialLinks ?? {}).length > 0 && (
                      <p className="flex flex-wrap gap-2 pt-1 text-xs">
                        {Object.entries(s.socialLinks).map(([k, v]) => <a key={k} href={v} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-brand-700 underline">{k}</a>)}
                      </p>
                    )}
                    {s.statusReason && <p className="text-xs text-danger">Motif : {s.statusReason}</p>}
                    {s.pendingChanges && (
                      <div className="mt-2 rounded-lg border border-[#fedf89] bg-warn-50 p-2.5 text-xs">
                        <p className="font-semibold text-warn">Modification demandée</p>
                        {s.pendingChanges.name && <p>Nom : « {s.name} » → « {s.pendingChanges.name} »</p>}
                        {s.pendingChanges.whatsapp && <p>WhatsApp : {s.whatsapp} → {s.pendingChanges.whatsapp}</p>}
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" onClick={() => act(() => api(`/admin/shops/${s.id}/changes`, { body: { approve: true } }), 'Modification approuvée')}>Approuver</Button>
                          <Button size="sm" variant="outline" onClick={async () => { const r = await decide({ title: 'Refuser la modification ?', confirmLabel: 'Refuser', reason: 'optional' }); if (r) await act(() => api(`/admin/shops/${s.id}/changes`, { body: { approve: false, reason: r.reason } }), 'Modification refusée'); }}>Refuser</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap content-start gap-2 lg:w-56 lg:flex-col">
                  {(s.status === 'ACTIVE' || s.status === 'CLOSED') && (
                    <Link href={siteHref(`/boutiques/${s.slug}`)} target="_blank" className="inline-flex h-9 items-center gap-1 px-1 text-sm font-semibold text-brand-700 hover:underline">
                      Page publique <ExternalLink className="size-3.5" aria-hidden />
                    </Link>
                  )}
                  {(s.status === 'PENDING' || s.status === 'REJECTED' || s.status === 'CHANGES_REQUESTED') && <Button size="sm" onClick={() => setShopStatus(s, 'ACTIVE')}>Valider la boutique</Button>}
                  {s.status === 'PENDING' && <Button size="sm" variant="outline" onClick={() => setShopStatus(s, 'CHANGES_REQUESTED')}>Demander des corrections</Button>}
                  {(s.status === 'PENDING' || s.status === 'CHANGES_REQUESTED') && <Button size="sm" variant="outline" onClick={() => setShopStatus(s, 'REJECTED')}>Refuser</Button>}
                  {(s.status === 'ACTIVE' || s.status === 'CLOSED') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const r = await decide({
                          title: s.trustedSeller ? 'Retirer le statut « vendeur de confiance » ?' : 'Accorder le statut « vendeur de confiance » ?',
                          description: s.trustedSeller ? 'Ses prochaines annonces devront être validées.' : 'Ses prochaines annonces seront publiées sans validation préalable (contrôle a posteriori par les signalements).',
                          confirmLabel: 'Confirmer',
                          reason: 'optional',
                        });
                        if (r) await act(() => api(`/admin/shops/${s.id}/trusted`, { body: { trusted: !s.trustedSeller, note: r.reason } }), 'Statut mis à jour');
                      }}
                    >
                      {s.trustedSeller ? 'Retirer la confiance' : 'Vendeur de confiance'}
                    </Button>
                  )}
                  {(s.status === 'ACTIVE' || s.status === 'CLOSED') && <Button size="sm" variant="danger" onClick={() => setShopStatus(s, 'SUSPENDED')}>Suspendre</Button>}
                  {s.status === 'SUSPENDED' && <Button size="sm" onClick={() => setShopStatus(s, 'ACTIVE')}>Réactiver</Button>}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const verify = !s.identityVerifiedAt;
                      const r = await decide({
                        title: verify ? 'Marquer l’identité comme vérifiée ?' : 'Retirer le badge d’identité vérifiée ?',
                        description: verify ? 'À n’utiliser qu’après contrôle effectif de l’identité du responsable. Le badge sera visible publiquement.' : undefined,
                        confirmLabel: 'Confirmer',
                        reason: 'optional',
                        reasonLabel: 'Note (pièce contrôlée, date…)',
                      });
                      if (r) await act(() => api(`/admin/shops/${s.id}/identity`, { body: { verified: verify, note: r.reason } }), 'Badge mis à jour');
                    }}
                  >
                    {s.identityVerifiedAt ? 'Retirer « identité vérifiée »' : 'Identité vérifiée'}
                  </Button>
                </div>
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
  return <Suspense><ShopsAdmin /></Suspense>;
}
