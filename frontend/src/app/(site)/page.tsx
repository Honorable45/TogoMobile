import { BrandRowsSection, type BrandRow } from '@/components/home/sections/brand-rows-section';
import { HomeHero } from '@/components/home/sections/home-hero';
import { NewestSection, PromoSection } from '@/components/home/sections/product-rows';
import { ReasonsSection } from '@/components/home/sections/reasons-section';
import { SellSection } from '@/components/home/sections/sell-section';
import { ShopsSection } from '@/components/home/sections/shops-section';
import { ROW_PAGE_SIZE, ROW_QUERIES } from '@/config/home-content';
import { apiGet, cacheTags } from '@/lib/api-server';
import type { HomeData, Page, ProductCard } from '@/lib/types';

/**
 * Page d'accueil. Ce fichier ne fait que deux choses : charger les données, puis empiler les sections.
 * - Changer un texte : config/home-content.ts
 * - Changer une section : components/home/sections/<section>.tsx
 * - Déplacer ou retirer une section : réordonner les lignes ci-dessous.
 */
const EMPTY_HOME: HomeData = { heroAds: [], brands: [], newest: [], popular: [], promotions: [], shops: [] };
const EMPTY_PAGE: Page<ProductCard> = { items: [], page: 1, pageSize: ROW_PAGE_SIZE, total: 0, totalPages: 0 };

export default async function HomePage() {
  // Repli si l'API est momentanément injoignable (y compris pendant le build).
  const data = await apiGet<HomeData>('/home', { tags: [cacheTags.home, cacheTags.catalog] }).catch(() => EMPTY_HOME);

  // Une rangée par marque mise en avant (ordre choisi par l'administration), 1re page déjà chargée.
  const pages = await Promise.all(
    data.brands.map((b) =>
      apiGet<Page<ProductCard>>(`/catalog/products?${ROW_QUERIES.brand(b.slug)}&pageSize=${ROW_PAGE_SIZE}`, { tags: [cacheTags.catalog] }).catch(() => EMPTY_PAGE),
    ),
  );
  const brandRows: BrandRow[] = data.brands.map((b, i) => ({ brand: b, page: pages[i] })).filter((r) => r.page.items.length > 0);

  return (
    <>
      <HomeHero data={data} />
      <PromoSection products={data.promotions} />
      <ReasonsSection />
      <NewestSection products={data.newest} />
      <ShopsSection shops={data.shops} />
      <BrandRowsSection rows={brandRows} />
      <SellSection />
    </>
  );
}
