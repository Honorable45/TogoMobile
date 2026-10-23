'use client';

import Link from 'next/link';
import { Alert, Skeleton } from '@/components/ui/misc';
import { CONDITION_LABELS, SALE_STATUS_LABELS, SHOP_STATUS_LABELS } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Condition, SaleStatus, ShopStatus } from '@/lib/types';

interface AdminStats {
  users: number;
  activeSellers: number;
  shops: Partial<Record<ShopStatus, number>>;
  productsActive: number;
  productsByCondition: Partial<Record<Condition, number>>;
  promotions: { running: number; total: number };
  observed: { views: number; whatsappClicks: number };
  reviews: Partial<Record<string, number>>;
  sales: Partial<Record<SaleStatus, number>>;
  openReports: number;
}

function Tile({ label, value, href, hint }: { label: string; value: number | string; href?: string; hint?: string }) {
  const inner = (
    <>
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="display num mt-1 text-[32px]">{typeof value === 'number' ? value.toLocaleString('fr-FR') : value}</p>
      {hint && <p className="text-xs text-subtle">{hint}</p>}
    </>
  );
  return href ? <Link href={href} className="block lift rounded-card border border-line bg-surface p-4 hover:shadow-card">{inner}</Link> : <div className="rounded-card border border-line bg-surface p-4">{inner}</div>;
}

function Breakdown({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  const total = rows.reduce((a, [, n]) => a + n, 0);
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="mb-3 text-sm font-bold">{title}</p>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, n]) => (
            <tr key={label} className="border-t border-line first:border-0">
              <td className="py-1.5 text-muted">{label}</td>
              <td className="py-1.5 text-right font-semibold tabular-nums">{n}</td>
              <td className="w-16 py-1.5 text-right text-xs text-subtle tabular-nums">{total ? Math.round((n / total) * 100) : 0} %</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminDashboard() {
  const { data, error } = useApi<AdminStats>('/admin/stats');
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  return (
    <>
      <h1 className="display text-[30px] sm:text-[38px]">Statistiques de la plateforme</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Boutiques en attente" value={data.shops.PENDING ?? 0} href="/boutiques?status=PENDING" />
        <Tile label="Signalements ouverts" value={data.openReports} href="/signalements" />
        <Tile label="Avis en modération" value={data.reviews.PENDING ?? 0} href="/avis?status=PENDING" />
        <Tile label="Ventes à examiner" value={data.sales.PENDING_VERIFICATION ?? 0} href="/ventes?status=PENDING_VERIFICATION" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Vendeurs actifs" value={data.activeSellers} />
        <Tile label="Boutiques validées actives" value={data.shops.ACTIVE ?? 0} />
        <Tile label="Annonces disponibles" value={data.productsActive} />
        <Tile label="Promotions en cours" value={data.promotions.running} hint={`${data.promotions.total} créées au total`} />
        <Tile label="Comptes" value={data.users} />
        <Tile label="Avis publiés" value={data.reviews.PUBLISHED ?? 0} />
        <Tile label="Consultations observées" value={data.observed.views} hint="Pages vues, non dédoublonnées" />
        <Tile label="Clics WhatsApp observés" value={data.observed.whatsappClicks} hint="Ne sont pas des ventes" />
      </div>
      <Alert tone="info">
        Les consultations et clics sont des événements observés par la plateforme. Les ventes sont déclarées par les vendeurs ; « vérifiées » signifie confirmées par le client selon la procédure, sans contrôle du paiement.
      </Alert>
      <div className="grid gap-3 lg:grid-cols-3">
        <Breakdown title="Boutiques par statut" rows={(Object.keys(SHOP_STATUS_LABELS) as ShopStatus[]).map((k) => [SHOP_STATUS_LABELS[k], data.shops[k] ?? 0])} />
        <Breakdown title="Annonces listées par état" rows={(Object.keys(CONDITION_LABELS) as Condition[]).map((k) => [CONDITION_LABELS[k], data.productsByCondition[k] ?? 0])} />
        <Breakdown title="Ventes déclarées par statut" rows={(Object.keys(SALE_STATUS_LABELS) as SaleStatus[]).map((k) => [SALE_STATUS_LABELS[k], data.sales[k] ?? 0])} />
      </div>
    </>
  );
}
