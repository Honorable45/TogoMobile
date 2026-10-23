import type { Metadata } from 'next';
import { Store } from 'lucide-react';
import { PageBanner } from '@/components/layout/page-banner';
import { ShopCard } from '@/components/shop/shop-card';
import { EmptyState, Pagination } from '@/components/ui/misc';
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
  const data = await apiGet<Page<Shop>>(`/shops${toQuery({ q: sp.q, sort, page, pageSize: 24 })}`, { tags: [cacheTags.catalog] });
  const href = (p: number) => `/boutiques${toQuery({ q: sp.q, sort: sort === 'recent' ? undefined : sort, page: p > 1 ? p : undefined })}`;

  return (
    <>
    <PageBanner eyebrow="Vendeurs validés" title="Boutiques" subtitle="Chaque boutique est examinée par l’équipe avant d’apparaître ici.">
      <form className="glass flex max-w-2xl flex-wrap gap-2 rounded-3xl p-1.5 sm:flex-nowrap sm:rounded-full" action="/boutiques">
        <label htmlFor="shop-q" className="sr-only">Rechercher une boutique</label>
        <input id="shop-q" name="q" defaultValue={sp.q} placeholder="Nom de la boutique" className="h-11 min-w-0 flex-1 rounded-full bg-white/10 px-4 text-[15px] text-white placeholder:text-white/60 focus:bg-white/15 focus:outline-none" />
        <label htmlFor="shop-sort" className="sr-only">Trier</label>
        <select id="shop-sort" name="sort" defaultValue={sort} className="h-11 rounded-full bg-white/10 px-3 text-sm text-white [&>option]:text-ink">
          <option value="recent">Récemment validées</option>
          <option value="rating">Mieux notées</option>
          <option value="name">Nom (A–Z)</option>
        </select>
        <button className="glass h-11 rounded-full px-5 text-sm font-medium text-white transition-[transform,background-color] hover:bg-white/25 active:scale-[.98]">Rechercher</button>
      </form>
    </PageBanner>
    <div className="container-page py-10 md:py-14">
      {data.items.length ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((s) => (
              <ShopCard key={s.id} shop={s} />
            ))}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} hrefFor={href} />
        </>
      ) : (
        <EmptyState icon={<Store className="size-10" />} title="Aucune boutique trouvée" />
      )}
    </div>
    </>
  );
}
