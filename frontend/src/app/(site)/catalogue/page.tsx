import type { Metadata } from 'next';
import { Search } from 'lucide-react';
import { PageBanner } from '@/components/layout/page-banner';
import { CatalogBrowser, parseFilters, type RawParams } from '@/components/product/catalog-browser';

export async function generateMetadata({ searchParams }: { searchParams: Promise<RawParams> }): Promise<Metadata> {
  const f = parseFilters(await searchParams);
  const filtered = f.q || f.brand.length || f.page > 1;
  return {
    title: f.q ? `« ${f.q} » — téléphones` : 'Catalogue des téléphones',
    description: 'Tous les téléphones proposés par les boutiques du Togo : neufs, reconditionnés et d’occasion. Filtrez par marque, prix, état et stockage.',
    alternates: { canonical: '/catalogue' },
    // Les combinaisons de filtres ne sont pas indexées (contenu dupliqué).
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function CataloguePage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const sp = await searchParams;
  const q = parseFilters(sp).q;
  return (
    <>
      <PageBanner eyebrow="Toutes les boutiques" title="Catalogue" subtitle="Neufs, reconditionnés et d’occasion, au même endroit.">
        <form action="/catalogue" role="search" className="glass flex max-w-2xl gap-2 rounded-full p-1.5">
          <label htmlFor="catalog-search" className="sr-only">
            Rechercher un téléphone
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-white/70" aria-hidden />
            <input
              id="catalog-search"
              name="q"
              type="search"
              defaultValue={q}
              enterKeyHint="search"
              placeholder="iPhone 13, Galaxy A15…"
              className="h-11 w-full rounded-full bg-white/10 pl-11 pr-3 text-[15px] text-white placeholder:text-white/60 focus:bg-white/15 focus:outline-none"
            />
          </div>
          <button type="submit" className="glass h-11 rounded-full px-5 text-sm font-medium text-white transition-[transform,background-color] hover:bg-white/25 active:scale-[.98]">
            Rechercher
          </button>
        </form>
      </PageBanner>
      <div className="container-page py-10 md:py-14">
        <CatalogBrowser searchParams={sp} basePath="/catalogue" />
      </div>
    </>
  );
}
