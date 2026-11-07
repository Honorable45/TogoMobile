import type { Metadata } from 'next';
import { Tag } from 'lucide-react';
import { PageBanner } from '@/components/layout/page-banner';
import { ProductGrid } from '@/components/product/product-card';
import { EmptyState, Pagination } from '@/components/ui/misc';
import { apiGet, cacheTags } from '@/lib/api-server';
import type { Page, ProductCard } from '@/lib/types';


export const metadata: Metadata = {
  title: 'Promo du jour',
  description: 'Les promotions du jour des boutiques du Togo : chaque offre dure 24 heures au maximum.',
  alternates: { canonical: '/promotions' },
};

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const data = await apiGet<Page<ProductCard>>(`/promotions?page=${page}&pageSize=24`, { tags: [cacheTags.promotions, cacheTags.catalog] });
  return (
    <>
    <PageBanner
      eyebrow="24 h seulement"
      title="Promo du jour"
      subtitle="Chaque offre dure 24 heures au maximum ; celles qui se terminent bientôt apparaissent en premier. Prix barré : plus bas prix des 30 derniers jours."
      aside={<p className="num rounded-full bg-canvas px-4 py-2 text-sm font-medium text-ink">{data.total} en cours</p>}
    />
    <div className="container-page py-10 md:py-14">
      {data.items.length ? (
        <>
          <ProductGrid products={data.items} priorityCount={4} />
          <Pagination page={data.page} totalPages={data.totalPages} hrefFor={(p) => (p > 1 ? `/promotions?page=${p}` : '/promotions')} />
        </>
      ) : (
        <EmptyState icon={<Tag className="size-10" />} title="Aucune promo du jour pour le moment">
          Revenez bientôt : les boutiques publient de nouvelles offres chaque jour.
        </EmptyState>
      )}
    </div>
    </>
  );
}
