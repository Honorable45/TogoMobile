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
    <article className="group relative w-[72vw] max-w-[300px] shrink-0 text-center sm:w-[300px]">
      <div className="aspect-[4/5] overflow-hidden rounded-[22px] bg-surface">
        <ProductImage
          src={p.image?.mediumUrl ?? p.image?.thumbUrl}
          alt={p.title}
          className="size-full transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] group-hover:scale-[1.03]"
        />
      </div>
      <p className={`mt-5 text-[13px] font-semibold ${p.promotion ? 'text-promo-700' : 'text-ok'}`}>{tag}</p>
      <h3 className="mt-1 text-[21px] font-semibold leading-tight tracking-tight text-ink">
        <Link href={`/produits/${p.slug}`} className="after:absolute after:inset-0 after:content-['']">
          {p.title}
        </Link>
      </h3>
      {line && <p className="mt-1.5 text-[15px] text-ink-2">{line}</p>}
      <p className="mt-4 text-[15px] text-ink">
        <span className="num font-semibold">{fcfa(p.currentPrice)}</span>
        {p.promotion && <span className="num ml-2 text-muted line-through">{fcfa(p.promotion.referencePrice)}</span>}
      </p>
      {saving > 0 && <p className="num mt-0.5 text-[13px] text-promo-700">Vous économisez {fcfa(saving)}</p>}
      <p className="mt-1 truncate text-[13px] text-muted">
        {p.shop.name} · {p.shop.city}
      </p>
    </article>
  );
}
