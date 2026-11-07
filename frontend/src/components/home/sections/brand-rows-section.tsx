import Link from 'next/link';
import { ChevronRight, SearchX } from 'lucide-react';
import { BRAND_DISPLAY_NAMES, HOME_TITLES, ROW_QUERIES } from '@/config/home-content';
import type { HomeData, Page, ProductCard } from '@/lib/types';
import { ButtonLink } from '../../ui/button';
import { EmptyState } from '../../ui/misc';
import { EndlessRow } from '../endless-row';

export type BrandRow = { brand: HomeData['brands'][number]; page: Page<ProductCard> };

/** « Choisissez votre marque » : une rangée sans fin par marque mise en avant par l'administration. */
export function BrandRowsSection({ rows }: { rows: BrandRow[] }) {
  return (
    <section aria-labelledby="par-marque" className="bg-canvas pt-16 md:pt-24">
      <div className="container-page mb-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h2 id="par-marque" className="display text-[32px] md:text-[48px]">{HOME_TITLES.brands}</h2>
        <Link href="/catalogue" className="inline-flex items-center gap-0.5 text-[17px] text-brand-600 hover:underline">
          Rechercher et filtrer <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
      {rows.length ? (
        rows.map(({ brand: b, page }) => (
          <div key={b.id} className="pt-8 md:pt-12">
            <div className="container-page mb-5">
              <h3 className="display text-[24px] md:text-[28px]">{BRAND_DISPLAY_NAMES[b.name] ?? b.name}.</h3>
            </div>
            {/* La 1re page est déjà chargée par la page d'accueil : la rangée reprend à la page 2. */}
            <EndlessRow initial={page.items} query={ROW_QUERIES.brand(b.slug)} loadedPages={1} label={`Téléphones ${b.name}`} />
          </div>
        ))
      ) : (
        <div className="container-page pb-4 pt-8">
          <EmptyState icon={<SearchX className="size-10" />} title="Aucun téléphone pour le moment" action={<ButtonLink href="/catalogue">Voir le catalogue</ButtonLink>}>
            Les boutiques ajoutent leurs premiers articles.
          </EmptyState>
        </div>
      )}
      <div className="container-page pb-16 pt-6 md:pb-24">
        <ButtonLink href="/catalogue" variant="outline" size="lg">
          Voir tout le catalogue
        </ButtonLink>
      </div>
    </section>
  );
}
