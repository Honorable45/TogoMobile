'use client';

import { useState } from 'react';
import { FilterTabs, Pager, useDecision } from '@/components/admin/admin-shell';
import { useSession } from '@/components/session';
import { Button } from '@/components/ui/button';
import { Alert, Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api-client';
import { formatDate, SHOP_STATUS_LABELS } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Page, Role, ShopStatus } from '@/lib/types';

interface AdminUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  isDemo: boolean;
  shop: { id: string; name: string; status: ShopStatus } | null;
}

const ROLE: Record<Role, string> = { CUSTOMER: 'Client', SELLER: 'Vendeur', ADMIN: 'Administrateur' };

export default function UsersAdmin() {
  const { user: me, notify } = useSession();
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const decide = useDecision();
  const qs = new URLSearchParams({ page: String(page), pageSize: '25', ...(role ? { role } : {}), ...(q ? { q } : {}) });
  const { data, error, reload } = useApi<Page<AdminUser>>(`/admin/users?${qs}`);

  const setStatus = async (u: AdminUser, status: 'ACTIVE' | 'SUSPENDED') => {
    const d = await decide({
      title: status === 'SUSPENDED' ? `Suspendre le compte de ${u.name} ?` : `Réactiver le compte de ${u.name} ?`,
      description: status === 'SUSPENDED' ? `Toutes ses sessions seront fermées.${u.shop ? ' Sa boutique sera également suspendue.' : ''}` : u.shop ? 'Pensez à réactiver aussi sa boutique si nécessaire.' : undefined,
      confirmLabel: status === 'SUSPENDED' ? 'Suspendre' : 'Réactiver',
      danger: status === 'SUSPENDED',
      reason: status === 'SUSPENDED' ? 'required' : 'optional',
    });
    if (!d) return;
    await api(`/admin/users/${u.id}/status`, { body: { status, reason: d.reason } }).then(() => { notify('Compte mis à jour'); void reload(); }, (e) => notify(errorMessage(e), 'error'));
  };

  return (
    <>
      <h1 className="display text-[30px] sm:text-[38px]">Comptes</h1>
      <p className="text-sm text-muted">Les comptes administrateurs se créent uniquement en ligne de commande sur le serveur (voir la documentation de déploiement).</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs value={role} onChange={(v) => { setRole(v); setPage(1); }} options={[['', 'Tous'], ['CUSTOMER', 'Clients'], ['SELLER', 'Vendeurs'], ['ADMIN', 'Administrateurs']]} />
        <form onSubmit={(e) => { e.preventDefault(); setQ(String(new FormData(e.currentTarget).get('q') ?? '')); setPage(1); }}>
          <label htmlFor="u-search" className="sr-only">Rechercher</label>
          <input id="u-search" name="q" placeholder="Nom, e-mail ou téléphone" className="h-9 rounded-lg border border-line bg-surface px-3 text-sm" />
        </form>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {!data ? <Skeleton className="h-64" /> : data.items.length === 0 ? <EmptyState title="Aucun compte" /> : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[42rem] text-sm">
            <thead className="bg-canvas text-left text-xs text-muted">
              <tr><th className="px-3 py-2 font-semibold">Nom</th><th className="px-3 py-2 font-semibold">Contact</th><th className="px-3 py-2 font-semibold">Rôle</th><th className="px-3 py-2 font-semibold">Inscription</th><th className="px-3 py-2 font-semibold">Statut</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2.5 font-semibold">{u.name} {u.isDemo && <Badge tone="warn">Démo</Badge>}</td>
                  <td className="px-3 py-2.5 text-muted">{[u.email, u.phone].filter(Boolean).join(' · ')}</td>
                  <td className="px-3 py-2.5">{ROLE[u.role]}{u.shop && <span className="block text-xs text-muted">{u.shop.name} — {SHOP_STATUS_LABELS[u.shop.status]}</span>}</td>
                  <td className="px-3 py-2.5 text-muted">{formatDate(u.createdAt)}</td>
                  <td className="px-3 py-2.5"><Badge tone={u.status === 'ACTIVE' ? 'brand' : 'danger'}>{u.status === 'ACTIVE' ? 'Actif' : 'Suspendu'}</Badge></td>
                  <td className="px-3 py-2.5 text-right">
                    {u.role !== 'ADMIN' && u.id !== me?.id && (
                      u.status === 'ACTIVE'
                        ? <Button size="sm" variant="outline" onClick={() => setStatus(u, 'SUSPENDED')}>Suspendre</Button>
                        : <Button size="sm" variant="outline" onClick={() => setStatus(u, 'ACTIVE')}>Réactiver</Button>
                    )}
                  </td>
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
