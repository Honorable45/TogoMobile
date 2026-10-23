'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Heart, Store } from 'lucide-react';
import { PageBanner } from '@/components/layout/page-banner';
import { ProductCard } from '@/components/product/product-card';
import { ShopCard } from '@/components/shop/shop-card';
import { ButtonLink } from '@/components/ui/button';
import { Alert, Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import { useApi, useRequireUser } from '@/lib/hooks';
import type { Page, ProductCard as Card, ShopCard as Shop } from '@/lib/types';

type FavProduct = Card & { listed: boolean; addedAt: string };

export default function FavoritesPage() {
  const { ready } = useRequireUser();
  const [tab, setTab] = useState<'products' | 'shops'>('products');
  const products = useApi<Page<FavProduct>>(ready ? '/me/favorites/products?pageSize=60' : null);
  const shops = useApi<Page<Shop & { addedAt: string }>>(ready ? '/me/favorites/shops?pageSize=60' : null);
  const current = tab === 'products' ? products : shops;

  return (
    <>
    <PageBanner title="Mes favoris" subtitle="Les téléphones et boutiques que vous suivez." />
    <div className="container-page py-10 md:py-14">
      <div role="tablist" aria-label="Type de favoris" className="glass-light inline-flex gap-1 rounded-full p-1">
        {(['products', 'shops'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`num h-10 rounded-full px-4 text-sm font-medium transition-colors ${tab === t ? 'bg-navy text-white' : 'text-ink-2 hover:bg-white'}`}
          >
            {t === 'products' ? 'Téléphones' : 'Boutiques suivies'}
            {t === 'products' && products.data ? ` (${products.data.total})` : ''}
            {t === 'shops' && shops.data ? ` (${shops.data.total})` : ''}
          </button>
        ))}
      </div>

      <div className="mt-8" role="tabpanel">
        {(!ready || current.loading) && !current.data ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="aspect-[3/4.4]" />)}
          </div>
        ) : current.error ? (
          <Alert tone="danger">{current.error}</Alert>
        ) : tab === 'products' ? (
          products.data?.items.length ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 lg:gap-5">
              {products.data.items.map((p) =>
                p.listed ? (
                  <ProductCard key={p.id} product={p} />
                ) : (
                  <div key={p.id} className="flex flex-col justify-between rounded-card border border-dashed border-line-2 bg-surface p-4 text-sm">
                    <div>
                      <Badge tone="muted">Plus disponible</Badge>
                      <p className="mt-2 font-semibold">{p.title}</p>
                      <p className="mt-1 text-muted">Cette annonce a été retirée ou la boutique n’est plus active.</p>
                    </div>
                    <Link href={`/catalogue?q=${encodeURIComponent(p.model)}`} className="mt-3 font-medium text-brand-600 underline underline-offset-4">
                      Chercher un modèle similaire
                    </Link>
                  </div>
                ),
              )}
            </div>
          ) : (
            <EmptyState icon={<Heart className="size-10" />} title="Aucun téléphone en favori" action={<ButtonLink href="/catalogue">Parcourir le catalogue</ButtonLink>}>
              Touchez le cœur sur une annonce pour la retrouver ici.
            </EmptyState>
          )
        ) : shops.data?.items.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shops.data.items.map((s) => <ShopCard key={s.id} shop={s} />)}
          </div>
        ) : (
          <EmptyState icon={<Store className="size-10" />} title="Vous ne suivez aucune boutique" action={<ButtonLink href="/boutiques">Découvrir les boutiques</ButtonLink>} />
        )}
      </div>
    </div>
    </>
  );
}
