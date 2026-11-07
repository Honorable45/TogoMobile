import { fcfa, promoEnds } from '@/lib/format';
import type { ProductDetail } from '@/lib/types';

/**
 * Prix de la fiche : grand prix, prix habituel barré, badge vert « Vous économisez »,
 * puis la fin de la promotion dite clairement (« Se termine ce soir à 23:55 »).
 */
export function PriceBlock({ p }: { p: ProductDetail }) {
  const promo = p.promotion;
  const saving = promo ? promo.referencePrice - p.currentPrice : 0;
  return (
    <div>
      <p className="num text-[34px] font-semibold leading-none tracking-tight text-ink">{fcfa(p.currentPrice)}</p>
      {promo && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="num text-muted line-through">
            <span className="sr-only">Prix habituel : </span>
            {fcfa(promo.referencePrice)}
          </span>
          <span className="num rounded-md bg-ok-50 px-2 py-0.5 font-semibold text-ok">Vous économisez {fcfa(saving)}</span>
        </p>
      )}
      {promo && (
        <p className="mt-2 text-sm text-promo-700">
          {promoEnds(promo.endsAt)}
          {promo.conditions ? ` · ${promo.conditions}` : ''}
          <span className="block text-xs text-muted">Prix barré : le plus bas pratiqué par la boutique ces 30 derniers jours.</span>
        </p>
      )}
    </div>
  );
}
