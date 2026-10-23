'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Eye, Pencil, Plus, Smartphone } from 'lucide-react';
import { ProductImage } from '@/components/product/product-card';
import { PageHeader } from '@/components/seller/seller-shell';
import { useSession } from '@/components/session';
import { Button, ButtonLink } from '@/components/ui/button';
import { Alert, EmptyState, Skeleton } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api-client';
import { AVAILABILITY_LABELS, CONDITION_LABELS, fcfa } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Page } from '@/lib/types';
import { StatusBadge, type SellerProduct } from '@/components/seller/types';

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Toutes' },
  { value: 'PUBLISHED', label: 'Publiées' },
  { value: 'DRAFT', label: 'Brouillons' },
  { value: 'ARCHIVED', label: 'Retirées' },
];

function ProductsList() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? 1);
  const { notify } = useSession();
  const { data, error, loading, reload } = useApi<Page<SellerProduct>>(`/seller/products?pageSize=20&page=${page}${status ? `&status=${status}` : ''}`);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (p: SellerProduct) => {
    setBusy(p.id);
    try {
      const r = await api<SellerProduct>(`/seller/products/${p.id}/${p.status === 'PUBLISHED' ? 'unpublish' : 'publish'}`, { method: 'POST' });
      notify(p.status === 'PUBLISHED' ? 'Annonce retirée' : r.moderation === 'APPROVED' ? 'Annonce publiée' : 'Annonce envoyée pour validation');
      await reload();
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Produits"
        description="Toutes vos annonces. Une annonce retirée n’est plus visible mais reste disponible pour vos ventes et statistiques."
        action={<ButtonLink href="/vendeur/produits/nouveau"><Plus className="size-4" aria-hidden /> Ajouter un téléphone</ButtonLink>}
      />
      <div role="tablist" className="scrollbar-none flex gap-1 overflow-x-auto">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={status === t.value}
            onClick={() => router.push(t.value ? `${pathname}?status=${t.value}` : pathname)}
            className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium ${status === t.value ? 'bg-navy text-white' : 'bg-surface text-ink-2 hover:bg-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {loading && !data ? (
        <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : data && data.items.length === 0 ? (
        <EmptyState icon={<Smartphone className="size-10" />} title="Aucune annonce ici" action={<ButtonLink href="/vendeur/produits/nouveau">Ajouter mon premier téléphone</ButtonLink>}>
          Ajoutez un téléphone en quelques étapes : informations, caractéristiques, prix, photos.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {data?.items.map((p) => {
            const img = p.media.find((m) => m.isPrimary) ?? p.media.find((m) => m.type === 'IMAGE');
            return (
              <li key={p.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 gap-3">
                  <ProductImage src={img?.thumbUrl} alt={p.title} className="size-16 shrink-0 rounded-lg" />
                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-semibold">{p.title}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <StatusBadge p={p} />
                      <span>{CONDITION_LABELS[p.condition]}</span>
                      <span aria-hidden>·</span>
                      <span className={p.availability === 'AVAILABLE' ? '' : 'font-semibold text-warn'}>{AVAILABILITY_LABELS[p.availability]}</span>
                      <span aria-hidden>·</span>
                      <span>Stock : {p.stock}</span>
                    </div>
                    <p className="text-sm">
                      <span className="font-bold">{fcfa(p.runningPromotion?.promoPrice ?? p.price)}</span>
                      {p.runningPromotion && <span className="ml-2 text-xs text-promo-700">Promotion −{p.runningPromotion.discountPercent} %</span>}
                      <span className="ml-2 text-xs text-subtle">Réf. {p.reference}</span>
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {p.status === 'PUBLISHED' && !p.removedAt && (
                    <ButtonLink href={`/produits/${p.slug}`} target="_blank" variant="ghost" size="sm" aria-label={`Voir l’annonce ${p.title}`}>
                      <Eye className="size-4" aria-hidden />
                    </ButtonLink>
                  )}
                  <ButtonLink href={`/vendeur/produits/${p.id}`} variant="outline" size="sm">
                    <Pencil className="size-4" aria-hidden /> Modifier
                  </ButtonLink>
                  {!p.removedAt && (
                    <Button variant={p.status === 'PUBLISHED' ? 'outline' : 'primary'} size="sm" loading={busy === p.id} onClick={() => toggle(p)}>
                      {p.status === 'PUBLISHED' ? 'Retirer' : 'Publier'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {data && data.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && <Link className="text-sm font-semibold text-brand-700" href={`${pathname}?${new URLSearchParams({ ...(status ? { status } : {}), page: String(page - 1) })}`}>← Précédent</Link>}
          <span className="text-sm text-muted">Page {page} / {data.totalPages}</span>
          {page < data.totalPages && <Link className="text-sm font-semibold text-brand-700" href={`${pathname}?${new URLSearchParams({ ...(status ? { status } : {}), page: String(page + 1) })}`}>Suivant →</Link>}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ProductsList />
    </Suspense>
  );
}
