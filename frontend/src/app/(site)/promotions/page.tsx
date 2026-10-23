import type { Metadata } from 'next';
import { Tag } from 'lucide-react';
import { PageBanner } from '@/components/layout/page-banner';
import { ProductGrid } from '@/components/product/product-card';
import { EmptyState, Pagination } from '@/components/ui/misc';
import { apiGet, cacheTags } from '@/lib/api-server';
import type { Page, ProductCard } from '@/lib/types';


export const metadata: Metadata = {
  title: 'Promotions sur les téléphones',
  description: 'Les promotions en cours dans les boutiques de téléphones du Togo, avec la date de fin de chaque offre.',
  alternates: { canonical: '/promotions' },
};

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const data = await apiGet<Page<ProductCard>>(`/promotions?page=${page}&pageSize=24`, { tags: [cacheTags.promotions, cacheTags.catalog] });
  return (
    <>
    <PageBanner
      eyebrow="Offres limitées"
      title="Promotions"
      subtitle="Les offres qui se terminent bientôt en premier. Prix barré : plus bas prix des 30 derniers jours."
      aside={<p className="glass num rounded-full px-4 py-2 text-sm">{data.total} en cours</p>}
    />
    <div className="container-page py-10 md:py-14">
      {data.items.length ? (
        <>
          <ProductGrid products={data.items} priorityCount={4} />
          <Pagination page={data.page} totalPages={data.totalPages} hrefFor={(p) => (p > 1 ? `/promotions?page=${p}` : '/promotions')} />
        </>
      ) : (
        <EmptyState icon={<Tag className="size-10" />} title="Aucune promotion en cours">
          Revenez bientôt : les boutiques publient régulièrement de nouvelles offres.
        </EmptyState>
      )}
    </div>
    </>
  );
}
