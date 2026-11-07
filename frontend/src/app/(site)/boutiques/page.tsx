import type { Metadata } from 'next';
import { Store } from 'lucide-react';
import { PageBanner } from '@/components/layout/page-banner';
import { EmptyState } from '@/components/ui/misc';
import { InfiniteShopGrid } from '@/components/ui/infinite-list';
import { apiGet, cacheTags, toQuery } from '@/lib/api-server';
import type { Page, ShopCard as Shop } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Boutiques de téléphones',
  description: 'Les boutiques de téléphones validées au Togo : Lomé, Kara, Atakpamé, Sokodé…',
  alternates: { canonical: '/boutiques' },
};

type SP = Promise<Record<string, string | undefined>>;

export default async function ShopsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const sort = ['rating', 'name'].includes(sp.sort ?? '') ? sp.sort : 'recent';
  const path = `/shops${toQuery({ q: sp.q, sort, pageSize: 24 })}`;
  const data = await apiGet<Page<Shop>>(`${path}&page=${page}`, { tags: [cacheTags.catalog] });
  const href = (p: number) => `/boutiques${toQuery({ q: sp.q, sort: sort === 'recent' ? undefined : sort, page: p > 1 ? p : undefined })}`;

  return (
    <>
    <PageBanner back={false} eyebrow="Boutiques validées" title="Boutiques" subtitle="Chaque boutique est examinée par l’équipe avant d’apparaître ici.">
      <form className="flex max-w-2xl bg-canvas flex-wrap gap-2 rounded-3xl p-1.5 sm:flex-nowrap sm:rounded-full" action="/boutiques">
        <label htmlFor="shop-q" className="sr-only">Rechercher une boutique</label>
        <input id="shop-q" name="q" defaultValue={sp.q} placeholder="Nom de la boutique" className="h-11 w-full min-w-0 rounded-full bg-transparent px-4 sm:w-auto sm:flex-1 text-[15px] text-ink placeholder:text-faint focus:outline-none" />
        <label htmlFor="shop-sort" className="sr-only">Trier</label>
        <select id="shop-sort" name="sort" defaultValue={sort} className="h-11 min-w-0 flex-1 rounded-full bg-surface px-3 text-sm text-ink sm:flex-none">
          <option value="recent">Récemment validées</option>
          <option value="rating">Mieux notées</option>
          <option value="name">Nom (A–Z)</option>
        </select>
        <button className="h-11 rounded-full bg-navy px-5 text-sm font-medium text-white transition-[transform,background-color] hover:bg-navy-2 active:scale-[.98]">Rechercher</button>
      </form>
    </PageBanner>
    <div className="container-page py-10 md:py-14">
      {data.items.length ? (
        <>
          <InfiniteShopGrid key={path} first={data} path={path} nextHref={href(data.page + 1)} />
        </>
      ) : (
        <EmptyState icon={<Store className="size-10" />} title="Aucune boutique trouvée" />
      )}
    </div>
    </>
  );
}
