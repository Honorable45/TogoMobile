import Link from 'next/link';
import { apiGet, cacheTags } from '@/lib/api-server';
import { CONDITION_LABELS, fcfa, storageLabel } from '@/lib/format';
import type { Page, ProductCard, ProductDetail } from '@/lib/types';

/**
 * « Autres offres pour ce modèle » : le même téléphone chez d'autres boutiques, dans d'autres états
 * ou d'autres capacités, avec le prix de chaque choix (comme le choix de l'état et du stockage
 * sur les grands sites de reconditionné). L'offre affichée est mise en évidence.
 */
export async function OtherOffers({ p }: { p: ProductDetail }) {
  const page = await apiGet<Page<ProductCard>>(
    `/catalog/products?q=${encodeURIComponent(p.model)}&brand=${p.brand.slug}&available=true&sort=price_asc&pageSize=24`,
    { tags: [cacheTags.catalog] },
  ).catch(() => null);
  const offers = (page?.items ?? []).filter((o) => o.model === p.model);
  if (!offers.some((o) => o.id === p.id)) offers.unshift({ ...p, image: null, shop: { ...p.shop } } as unknown as ProductCard);
  if (offers.length < 2) return null;

  // Capacités disponibles, avec le prix le plus bas pour chacune.
  const byStorage = new Map<number, ProductCard>();
  for (const o of offers) {
    const best = byStorage.get(o.storageGb ?? 0);
    if (!best || o.currentPrice < best.currentPrice) byStorage.set(o.storageGb ?? 0, o);
  }
  const storages = [...byStorage.entries()].sort(([a], [b]) => a - b);

  return (
    <section aria-labelledby="offres" className="space-y-5">
      <h2 id="offres" className="text-[19px] font-semibold text-ink">
        Autres offres pour le {p.brand.name} {p.model}
      </h2>

      {storages.length > 1 && (
        <div>
          <p className="mb-2 text-sm font-medium text-ink-2">Stockage</p>
          <div className="grid grid-cols-3 gap-2">
            {storages.map(([gb, o]) => {
              const current = (p.storageGb ?? 0) === gb;
              return (
                <Link
                  key={gb}
                  href={`/produits/${o.slug}`}
                  aria-current={current ? 'true' : undefined}
                  className={`rounded-2xl border px-3 py-3 text-center transition-colors ${current ? 'border-ink bg-canvas' : 'border-line hover:border-ink-2'}`}
                >
                  <span className="block text-[15px] font-semibold text-ink">{storageLabel(gb) ?? '—'}</span>
                  <span className="num block text-[13px] text-muted">dès {fcfa(o.currentPrice)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-ink-2">État et boutique</p>
        <ul className="space-y-2">
          {offers.map((o) => {
            const current = o.id === p.id;
            return (
              <li key={o.id}>
                <Link
                  href={`/produits/${o.slug}`}
                  aria-current={current ? 'true' : undefined}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${current ? 'border-ink bg-canvas' : 'border-line hover:border-ink-2'}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-ink">
                      {CONDITION_LABELS[o.condition]} · {storageLabel(o.storageGb)}
                    </span>
                    <span className="block truncate text-[13px] text-muted">
                      {o.shop.name} · {o.shop.city}
                    </span>
                  </span>
                  <span className="num shrink-0 text-[15px] font-semibold text-ink">{fcfa(o.currentPrice)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
