'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api-client';
import type { Page, ProductCard as Card, ShopCard as Shop } from '@/lib/types';
import { ProductCard } from '../product/product-card';
import { ShopCard } from '../shop/shop-card';

/**
 * Défilement infini : la page suivante est chargée quand le bas de la liste approche de l'écran.
 * `path` est le chemin de l'API sans le paramètre `page` (ex. /catalog/products?sort=recent&pageSize=24).
 * Sans JavaScript, un lien « Page suivante » reste disponible (et sert aux moteurs de recherche).
 */
function useInfinite<T extends { id: string }>(first: Page<T>, path: string) {
  const [items, setItems] = useState(first.items);
  const [page, setPage] = useState(first.page);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const done = page >= first.totalPages;

  const loadMore = useCallback(async () => {
    if (busy.current || done) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      const next = await api<Page<T>>(`${path}${path.includes('?') ? '&' : '?'}page=${page + 1}`);
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...next.items.filter((x) => !seen.has(x.id))];
      });
      // Une page vide signifie que la liste est épuisée (ou plafonnée par l'API).
      setPage(next.items.length ? next.page : first.totalPages);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [done, page, path, first.totalPages]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || done || error) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, done, error]);

  return { items, page, loading, error, done, loadMore, sentinel };
}

interface InfiniteState {
  items: unknown[];
  loading: boolean;
  error: string | null;
  done: boolean;
  loadMore: () => void;
  sentinel: React.RefObject<HTMLDivElement | null>;
}

function Footer({ state, total, nextHref }: { state: InfiniteState; total: number; nextHref?: string }) {
  return (
    <>
      <div ref={state.sentinel} className="flex min-h-16 flex-col items-center justify-center gap-2 py-6 text-sm text-muted" aria-live="polite">
        {state.loading && (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Chargement…
          </span>
        )}
        {state.error && (
          <>
            <span className="text-danger">{state.error}</span>
            <button type="button" onClick={state.loadMore} className="inline-flex h-11 items-center rounded-full border border-line-2 bg-surface px-5 font-medium text-ink">
              Réessayer
            </button>
          </>
        )}
        {state.done && state.items.length > 24 && <span>Vous avez tout vu ({total}).</span>}
      </div>
      {nextHref && !state.done && (
        <noscript>
          <p className="text-center">
            <a href={nextHref} className="font-medium text-brand-600 underline">
              Page suivante
            </a>
          </p>
        </noscript>
      )}
    </>
  );
}

/** Grille de produits à défilement infini (accueil, catalogue, pages boutique). */
export function InfiniteProductGrid({ first, path, nextHref, priorityCount = 0 }: { first: Page<Card>; path: string; nextHref?: string; priorityCount?: number }) {
  const state = useInfinite(first, path);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 lg:gap-5">
        {state.items.map((p, i) => (
          <ProductCard key={p.id} product={p} priority={i < priorityCount} />
        ))}
      </div>
      <Footer state={state} total={first.total} nextHref={nextHref} />
    </>
  );
}

/** Liste de boutiques à défilement infini. */
export function InfiniteShopGrid({ first, path, nextHref }: { first: Page<Shop>; path: string; nextHref?: string }) {
  const state = useInfinite(first, path);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {state.items.map((s) => (
          <ShopCard key={s.id} shop={s} />
        ))}
      </div>
      <Footer state={state} total={first.total} nextHref={nextHref} />
    </>
  );
}
