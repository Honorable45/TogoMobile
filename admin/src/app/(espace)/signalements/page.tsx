'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FilterTabs, Pager, useDecision } from '@/components/admin/admin-shell';
import { useSession } from '@/components/session';
import { siteHref } from '@/config/brand';
import { Button } from '@/components/ui/button';
import { Alert, Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Page } from '@/lib/types';

interface AdminReport {
  id: string;
  targetType: 'PRODUCT' | 'SHOP' | 'REVIEW' | 'PROMOTION';
  targetId: string;
  reason: string;
  details: string | null;
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
  decision: string | null;
  createdAt: string;
  handledAt: string | null;
  author: { name: string };
  handledBy: { name: string } | null;
  target: { label: string; href?: string; excerpt?: string | null } | null;
}

const TARGET = { PRODUCT: 'Annonce', SHOP: 'Boutique', REVIEW: 'Avis', PROMOTION: 'Promotion' };
const REASONS: Record<string, string> = {
  FRAUD: 'Fraude suspectée', MISLEADING: 'Information trompeuse', COUNTERFEIT: 'Contrefaçon / interdit', STOLEN: 'Appareil possiblement volé',
  FAKE_REVIEW: 'Faux avis', ABUSIVE: 'Contenu inapproprié', NOT_RECEIVED: 'Vente contestée', OTHER: 'Autre',
};
const WHERE: Record<AdminReport['targetType'], string> = { PRODUCT: '/produits', SHOP: '/boutiques', REVIEW: '/avis', PROMOTION: '/promotions' };

export default function ReportsAdmin() {
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);
  const decide = useDecision();
  const { notify } = useSession();
  const { data, error, reload } = useApi<Page<AdminReport>>(`/admin/reports?page=${page}&pageSize=20${status ? `&status=${status}` : ''}`);

  const resolve = async (r: AdminReport, outcome: 'RESOLVED' | 'DISMISSED') => {
    const d = await decide({
      title: outcome === 'RESOLVED' ? 'Clore le signalement (action prise)' : 'Classer sans suite',
      description: outcome === 'RESOLVED' ? `Effectuez l’action nécessaire depuis la page « ${TARGET[r.targetType]} » puis décrivez-la ici.` : undefined,
      confirmLabel: 'Enregistrer la décision',
      reason: 'required',
      reasonLabel: 'Décision',
    });
    if (!d) return;
    await api(`/admin/reports/${r.id}/resolve`, { body: { status: outcome, decision: d.reason } }).then(() => { notify('Signalement traité'); void reload(); }, (e) => notify(errorMessage(e), 'error'));
  };

  return (
    <>
      <h1 className="display text-[30px] sm:text-[38px]">Signalements</h1>
      <FilterTabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[['OPEN', 'À traiter'], ['RESOLVED', 'Traités'], ['DISMISSED', 'Classés sans suite'], ['', 'Tous']]} />
      {error && <Alert tone="danger">{error}</Alert>}
      {!data ? <Skeleton className="h-64" /> : data.items.length === 0 ? <EmptyState title="Aucun signalement" /> : (
        <ul className="space-y-3">
          {data.items.map((r) => (
            <li key={r.id} className="space-y-2 rounded-card border border-line bg-surface p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{TARGET[r.targetType]}</Badge>
                <Badge tone="danger">{REASONS[r.reason] ?? r.reason}</Badge>
                <span className="text-xs text-muted">par {r.author.name}, le {formatDateTime(r.createdAt)}</span>
              </div>
              <p className="font-semibold">
                {r.target?.href ? <Link href={siteHref(r.target.href)} target="_blank" className="hover:underline">{r.target.label}</Link> : (r.target?.label ?? 'Contenu supprimé')}
              </p>
              {r.target?.excerpt && <p className="rounded-lg bg-canvas p-2 text-muted">« {r.target.excerpt} »</p>}
              {r.details && <p className="whitespace-pre-line">{r.details}</p>}
              {r.decision && <p className="text-xs text-muted">Décision ({r.handledBy?.name}, {r.handledAt && formatDateTime(r.handledAt)}) : {r.decision}</p>}
              {r.status === 'OPEN' && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link href={WHERE[r.targetType]} className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-sm font-semibold hover:bg-canvas">Ouvrir la modération</Link>
                  <Button size="sm" onClick={() => resolve(r, 'RESOLVED')}>Action prise</Button>
                  <Button size="sm" variant="ghost" onClick={() => resolve(r, 'DISMISSED')}>Classer sans suite</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {data && <Pager page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </>
  );
}
