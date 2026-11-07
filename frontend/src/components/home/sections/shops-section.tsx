import { HOME_TITLES } from '@/config/home-content';
import type { HomeData } from '@/lib/types';
import { ShopCard } from '../../shop/shop-card';
import { ScrollRow } from '../scroll-row';
import { SectionHead } from './section-head';

/** « Des boutiques validées » : les dernières boutiques acceptées par l'équipe. */
export function ShopsSection({ shops }: { shops: HomeData['shops'] }) {
  if (!shops.length) return null;
  return (
    <section aria-labelledby="boutiques" className="bg-surface py-16 md:py-24">
      <SectionHead id="boutiques" title={HOME_TITLES.shops} href="/boutiques" link="Toutes les boutiques" />
      <ScrollRow label="Boutiques">
        {shops.map((s) => (
          <div key={s.id} className="w-[78vw] max-w-[320px] shrink-0 sm:w-[320px]">
            <ShopCard shop={s} />
          </div>
        ))}
      </ScrollRow>
    </section>
  );
}
