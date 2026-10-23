import { SearchX } from 'lucide-react';
import { apiGet, cacheTags, toQuery } from '@/lib/api-server';
import { plural } from '@/lib/format';
import type { Brand, Page, ProductCard } from '@/lib/types';
import { EmptyState, Pagination } from '../ui/misc';
import { ButtonLink } from '../ui/button';
import { CatalogFilters, SortSelect, type FilterValues } from './catalog-filters';
import { ProductGrid } from './product-card';

export type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const list = (v: string | string[] | undefined) => (first(v) ? first(v)!.split(',').filter(Boolean) : []);

export function parseFilters(sp: RawParams): FilterValues & { page: number } {
  return {
    q: first(sp.q)?.slice(0, 100) || undefined,
    brand: list(sp.brand),
    condition: list(sp.condition),
    storage: list(sp.storage),
    ram: list(sp.ram),
    minPrice: first(sp.minPrice),
    maxPrice: first(sp.maxPrice),
    available: first(sp.available) === 'true',
    promo: first(sp.promo) === 'true',
    minRating: first(sp.minRating),
    sort: first(sp.sort) || 'recent',
    page: Math.max(1, Number(first(sp.page)) || 1),
  };
}

/** Catalogue filtrable et paginé, partagé par le catalogue général et les pages boutique. */
export async function CatalogBrowser({ searchParams, basePath, shop }: { searchParams: RawParams; basePath: string; shop?: string }) {
  const f = parseFilters(searchParams);
  const [result, brands] = await Promise.all([
    apiGet<Page<ProductCard>>(
      `/catalog/products${toQuery({
        q: f.q,
        brand: f.brand,
        condition: f.condition,
        storage: f.storage,
        ram: f.ram,
        minPrice: f.minPrice,
        maxPrice: f.maxPrice,
        available: f.available,
        promo: f.promo,
        minRating: f.minRating,
        sort: f.sort,
        shop,
        page: f.page,
        pageSize: 24,
      })}`,
      { tags: [cacheTags.catalog, ...(shop ? [cacheTags.shop(shop)] : [])] },
    ),
    shop ? Promise.resolve([] as Brand[]) : apiGet<Brand[]>('/brands', { revalidate: 300, tags: [cacheTags.brands] }),
  ]);

  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (k !== 'page' && first(v)) params.set(k, first(v)!);
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const hasFilters = f.brand.length || f.condition.length || f.storage.length || f.ram.length || f.minPrice || f.maxPrice || f.available || f.promo || f.minRating;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
      <aside className="-mb-2 lg:mb-0">
        <CatalogFilters values={f} brands={brands.filter((b) => (b.productCount ?? 0) > 0)} showBrand={!shop} total={result.total} />
      </aside>
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted" aria-live="polite">
            <span className="font-bold text-ink">{plural(result.total, 'téléphone', 'téléphones')}</span>
            {f.q && (
              <>
                {' '}pour « <span className="font-semibold text-ink">{f.q}</span> »
              </>
            )}
          </p>
          <SortSelect value={f.sort} />
        </div>
        {result.items.length ? (
          <>
            <ProductGrid products={result.items} priorityCount={4} />
            <Pagination page={result.page} totalPages={result.totalPages} hrefFor={hrefFor} />
          </>
        ) : (
          <EmptyState
            icon={<SearchX className="size-10" />}
            title="Aucun téléphone ne correspond à votre recherche"
            action={hasFilters || f.q ? <ButtonLink href={basePath} variant="outline">Effacer la recherche et les filtres</ButtonLink> : undefined}
          >
            Essayez une autre orthographe, une marque différente ou élargissez la fourchette de prix.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
