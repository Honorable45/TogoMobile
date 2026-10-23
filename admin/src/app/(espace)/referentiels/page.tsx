'use client';

import { useState, type FormEvent } from 'react';
import { useDecision } from '@/components/admin/admin-shell';
import { useSession } from '@/components/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Alert, Skeleton } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api-client';
import { useApi } from '@/lib/hooks';
import type { Brand, Category } from '@/lib/types';

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-brand-600" />
      {label}
    </label>
  );
}

export default function ReferentialsAdmin() {
  const brands = useApi<Brand[]>('/admin/brands');
  const categories = useApi<Category[]>('/admin/categories');
  const { notify } = useSession();
  const decide = useDecision();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, reload: () => Promise<void>, msg = 'Enregistré') => {
    setBusy(true);
    try {
      await fn();
      notify(msg);
      await reload();
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const addBrand = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get('name') ?? '').trim();
    if (!name) return;
    void run(() => api('/admin/brands', { body: { name } }), brands.reload, 'Marque ajoutée').then(() => form.reset());
  };
  const addCategory = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get('name') ?? '').trim();
    if (!name) return;
    void run(() => api('/admin/categories', { body: { name, parentId: fd.get('parentId') || null } }), categories.reload, 'Catégorie ajoutée').then(() => form.reset());
  };

  return (
    <>
      <h1 className="display text-[30px] sm:text-[38px]">Marques et catégories</h1>
      <p className="text-sm text-muted">Les marques « en vitrine » apparaissent sur la page d’accueil, dans l’ordre indiqué. Une marque ou catégorie désactivée n’est plus proposée aux vendeurs.</p>

      <section className="space-y-3 rounded-card border border-line bg-surface p-4">
        <h2 className="display text-2xl">Marques</h2>
        {brands.error && <Alert tone="danger">{brands.error}</Alert>}
        {!brands.data ? <Skeleton className="h-40" /> : (
          <ul className="divide-y divide-line">
            {brands.data.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="min-w-32 flex-1 font-semibold">{b.name} <span className="font-normal text-subtle">({b.productCount} annonces)</span></span>
                <Toggle checked={!!b.isActive} label="Active" onChange={(v) => run(() => api(`/admin/brands/${b.id}`, { method: 'PATCH', body: { isActive: v } }), brands.reload)} />
                <Toggle checked={!!b.featured} label="En vitrine" onChange={(v) => run(() => api(`/admin/brands/${b.id}`, { method: 'PATCH', body: { featured: v } }), brands.reload)} />
                <label className="inline-flex items-center gap-1.5 text-xs">
                  Ordre
                  <input type="number" min={0} max={1000} defaultValue={b.sortOrder} onBlur={(e) => Number(e.target.value) !== b.sortOrder && run(() => api(`/admin/brands/${b.id}`, { method: 'PATCH', body: { sortOrder: Number(e.target.value) } }), brands.reload)} className="h-8 w-16 rounded-md border border-line px-2" />
                </label>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addBrand} className="flex gap-2">
          <Input name="name" placeholder="Nouvelle marque" aria-label="Nom de la nouvelle marque" maxLength={40} className="max-w-xs" />
          <Button type="submit" variant="outline" disabled={busy}>Ajouter</Button>
        </form>
      </section>

      <section className="space-y-3 rounded-card border border-line bg-surface p-4">
        <h2 className="display text-2xl">Catégories</h2>
        {!categories.data ? <Skeleton className="h-32" /> : (
          <ul className="divide-y divide-line">
            {categories.data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="min-w-32 flex-1 font-semibold">
                  {c.name}
                  {c.parentId && <span className="font-normal text-subtle"> — sous-catégorie de {categories.data!.find((p) => p.id === c.parentId)?.name}</span>}
                </span>
                <Toggle checked={c.isActive} label="Active" onChange={(v) => run(() => api(`/admin/categories/${c.id}`, { method: 'PATCH', body: { isActive: v } }), categories.reload)} />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const d = await decide({ title: `Supprimer « ${c.name} » ?`, description: 'Impossible si des annonces l’utilisent : désactivez-la plutôt.', confirmLabel: 'Supprimer', danger: true, reason: 'none' });
                    if (d) await run(() => api(`/admin/categories/${c.id}`, { method: 'DELETE' }), categories.reload, 'Catégorie supprimée');
                  }}
                >
                  Supprimer
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addCategory} className="flex flex-wrap gap-2">
          <Input name="name" placeholder="Nouvelle catégorie" aria-label="Nom de la nouvelle catégorie" maxLength={60} className="max-w-xs" />
          <select name="parentId" aria-label="Catégorie parente" className="h-11 rounded-lg border border-line bg-surface px-2 text-sm">
            <option value="">Sans parent</option>
            {categories.data?.filter((c) => !c.parentId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button type="submit" variant="outline" disabled={busy}>Ajouter</Button>
        </form>
      </section>
    </>
  );
}
