'use client';

import { useState } from 'react';
import { FilterTabs, Pager } from '@/components/admin/admin-shell';
import { Alert, EmptyState, Skeleton } from '@/components/ui/misc';
import { formatDateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Page } from '@/lib/types';

interface AuditRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  actor: { name: string; role: string } | null;
}

export default function AuditLogPage() {
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const { data, error } = useApi<Page<AuditRow>>(`/admin/audit-logs?page=${page}&pageSize=50${type ? `&targetType=${type}` : ''}`);
  return (
    <>
      <h1 className="display text-[30px] sm:text-[38px]">Journal d’audit</h1>
      <p className="text-sm text-muted">Trace des actions sensibles. Aucune donnée secrète (mot de passe, jeton, numéro d’acheteur) n’y est enregistrée.</p>
      <FilterTabs value={type} onChange={(v) => { setType(v); setPage(1); }} options={[['', 'Tout'], ['Shop', 'Boutiques'], ['Product', 'Annonces'], ['Promotion', 'Promotions'], ['Review', 'Avis'], ['Sale', 'Ventes'], ['User', 'Comptes'], ['Report', 'Signalements']]} />
      {error && <Alert tone="danger">{error}</Alert>}
      {!data ? <Skeleton className="h-64" /> : data.items.length === 0 ? <EmptyState title="Aucune entrée" /> : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-canvas text-left text-xs text-muted">
              <tr><th className="px-3 py-2 font-semibold">Date</th><th className="px-3 py-2 font-semibold">Acteur</th><th className="px-3 py-2 font-semibold">Action</th><th className="px-3 py-2 font-semibold">Objet</th><th className="px-3 py-2 font-semibold">Détails</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDateTime(l.createdAt)}</td>
                  <td className="px-3 py-2">{l.actor ? `${l.actor.name} (${l.actor.role.toLowerCase()})` : 'Système'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.action}</td>
                  <td className="px-3 py-2 text-xs text-muted">{l.targetType} {l.targetId?.slice(-8)}</td>
                  <td className="max-w-xs break-words px-3 py-2 text-xs text-muted">{Object.keys(l.metadata ?? {}).length ? JSON.stringify(l.metadata) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </>
  );
}
