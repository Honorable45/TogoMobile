import Link from 'next/link';
import { CONDITION_LABELS, fcfa, storageLabel } from '@/lib/format';
import type { ProductCard } from '@/lib/types';
import { ProductImage } from '../product/product-card';

/**
 * Carte « gamme » (façon « Explore the lineup ») : grande photo arrondie, mention orange,
 * nom centré, une ligne d'accroche, prix. Toute la carte mène à la fiche.
 */
export function LineupTile({ product: p }: { product: ProductCard }) {
  const tag = p.promotion ? `Promo −${p.promotion.discountPercent} %` : p.condition === 'NEW' ? 'Neuf' : CONDITION_LABELS[p.condition];
  const line = [storageLabel(p.storageGb), p.ramGb ? `${p.ramGb} Go de RAM` : null].filter(Boolean).join(', ');
  const saving = p.promotion ? p.promotion.referencePrice - p.currentPrice : 0;

  return (
    <article className="group relative flex w-[44vw] shrink-0 flex-col text-center sm:w-[280px]">
      <div className="aspect-[4/5] overflow-hidden rounded-[18px] bg-surface sm:rounded-[22px]">
        <ProductImage
          src={p.image?.mediumUrl ?? p.image?.thumbUrl}
          alt={p.title}
          className="size-full transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] group-hover:scale-[1.03]"
        />
      </div>
      <p className={`mt-3 text-[12px] font-semibold sm:mt-5 sm:text-[13px] ${p.promotion ? 'text-promo-700' : 'text-ok'}`}>{tag}</p>
      <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-tight sm:text-[21px] tracking-tight text-ink">
        <Link href={`/produits/${p.slug}`} className="after:absolute after:inset-0 after:content-['']">
          {p.title}
        </Link>
      </h3>
      {line && <p className="mt-1 text-[12.5px] text-ink-2 sm:mt-1.5 sm:text-[15px]">{line}</p>}
      <p className="mt-auto flex flex-wrap justify-center gap-x-2 pt-3 text-[14px] text-ink sm:pt-4 sm:text-[15px]">
        <span className="num font-semibold">{fcfa(p.currentPrice)}</span>
        {p.promotion && <span className="num text-[12px] text-muted line-through sm:text-[15px]">{fcfa(p.promotion.referencePrice)}</span>}
      </p>
      {saving > 0 && <p className="num mt-0.5 text-[11.5px] text-promo-700 sm:text-[13px]">Vous économisez {fcfa(saving)}</p>}
      <p className="mt-1 truncate text-[11.5px] text-muted sm:text-[13px]">
        {p.shop.name} · {p.shop.city}
      </p>
    </article>
  );
}
