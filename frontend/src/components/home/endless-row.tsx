'use client';

import { useCallback, useRef, useState } from 'react';
import { ROW_PAGE_SIZE } from '@/config/home-content';
import type { Page, ProductCard as Card } from '@/lib/types';
import { ProductCard } from '../product/product-card';
import { LineupTile } from './lineup-tile';
import { ScrollRow } from './scroll-row';

/** Garde-fou : au-delà, la rangée ne grandit plus (le navigateur garderait trop de cartes en mémoire). */
const MAX_ITEMS = 240;

type Item = { key: string; product: Card };

/**
 * Rangée de téléphones sans fin, qu'on fait glisser de droite à gauche (rien ne bouge tout seul).
 * À l'approche du bout, les téléphones suivants sont chargés depuis le catalogue (`query`) ;
 * une fois tout le catalogue de la rangée affiché, la rangée reprend au début, à l'infini.
 * Pas de bouton « Tout voir » : on continue simplement de faire glisser.
 */
export function EndlessRow({
  initial,
  query,
  label,
  variant = 'card',
  inset = false,
  canvasTiles = false,
  exclude,
  loadedPages = 0,
}: {
  initial: Card[];
  /** Filtres du catalogue (ex. « brand=apple »), sans page ; absent = boucle sur les seuls `initial`. */
  query?: string;
  label: string;
  variant?: 'card' | 'lineup';
  inset?: boolean;
  /** Tuiles « gamme » sur fond blanc : photo sur gris clair pour qu'elle se détache. */
  canvasTiles?: boolean;
  /** Téléphone à ne jamais afficher (celui de la fiche ouverte). */
  exclude?: string;
  /** Pages du catalogue déjà contenues dans `initial` (même taille de page), pour ne pas les recharger. */
  loadedPages?: number;
}) {
  const [items, setItems] = useState<Item[]>(() => initial.map((p) => ({ key: p.id, product: p })));
  const state = useRef({ all: initial, ids: new Set([...initial.map((p) => p.id), ...(exclude ? [exclude] : [])]), page: loadedPages, done: !query, busy: false, cycle: 0 });

  const more = useCallback(async () => {
    const st = state.current;
    if (st.busy || st.all.length === 0) return;
    st.busy = true;
    try {
      let fresh: Card[] = [];
      if (!st.done) {
        st.page += 1;
        const res = await fetch(`/api/v1/catalog/products?${query}&page=${st.page}&pageSize=${ROW_PAGE_SIZE}`);
        if (res.ok) {
          const data = (await res.json()) as Page<Card>;
          fresh = data.items.filter((p) => !st.ids.has(p.id));
          fresh.forEach((p) => st.ids.add(p.id));
          st.all = [...st.all, ...fresh];
          if (data.page >= data.totalPages) st.done = true;
        } else {
          st.done = true;
        }
      }
      // Tout est affiché : la rangée repart du premier téléphone (nouvelle série de clés).
      const batch = fresh.length ? fresh.map((p) => ({ key: p.id, product: p })) : st.done ? st.all.map((p) => ({ key: `${p.id}~${st.cycle + 1}`, product: p })) : [];
      if (!fresh.length && st.done) st.cycle += 1;
      if (batch.length) setItems((cur) => (cur.length >= MAX_ITEMS ? cur : [...cur, ...batch]));
    } finally {
      st.busy = false;
    }
  }, [query]);

  return (
    <ScrollRow label={label} inset={inset} onNearEnd={more}>
      {items.map(({ key, product }) =>
        variant === 'lineup' ? (
          <div key={key} className={`flex shrink-0 ${canvasTiles ? '[&_article>div:first-child]:bg-canvas' : ''}`}>
            <LineupTile product={product} />
          </div>
        ) : (
          <div key={key} className="w-[44vw] max-w-[240px] shrink-0 sm:w-[240px]">
            <ProductCard product={product} />
          </div>
        ),
      )}
    </ScrollRow>
  );
}

/** Rangée de cartes produit (fiche produit, page boutique) : même défilement sans fin. */
export function ProductRow({ products, label = 'Produits', query, exclude }: { products: Card[]; label?: string; query?: string; exclude?: string }) {
  return <EndlessRow initial={products} query={query} label={label} exclude={exclude} inset />;
}
