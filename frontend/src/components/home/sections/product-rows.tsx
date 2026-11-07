import { HOME_TITLES, ROW_QUERIES } from '@/config/home-content';
import type { ProductCard } from '@/lib/types';
import { EndlessRow } from '../endless-row';
import { SectionHead } from './section-head';

/** « Promo du jour » : promotions en cours, rangée sans fin (les suivantes se chargent en faisant glisser). */
export function PromoSection({ products }: { products: ProductCard[] }) {
  if (!products.length) return null;
  return (
    <section aria-labelledby="promo" className="bg-canvas pt-16 md:pt-24">
      <SectionHead id="promo" title={HOME_TITLES.promo} />
      <EndlessRow initial={products} query={ROW_QUERIES.promo} label="Promo du jour" variant="lineup" />
    </section>
  );
}

/** « Nouveautés » : dernières annonces disponibles, rangée sans fin. */
export function NewestSection({ products }: { products: ProductCard[] }) {
  if (!products.length) return null;
  return (
    <section aria-labelledby="nouveautes" className="bg-surface pt-16 md:pt-24">
      <SectionHead id="nouveautes" title={HOME_TITLES.newest} />
      <EndlessRow initial={products} query={ROW_QUERIES.newest} label="Nouveautés" variant="lineup" canvasTiles />
    </section>
  );
}
