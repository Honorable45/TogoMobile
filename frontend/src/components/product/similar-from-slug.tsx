'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import type { Page, ProductCard } from '@/lib/types';
import { ProductRow } from './product-card';

/**
 * Déduit une recherche de l'adresse d'une annonce disparue :
 * « /produits/infinix-hot-30-128-go-3p5vhh » → modèle « infinix hot 30 », marque « infinix ».
 * Le dernier segment est l'identifiant court ; « 128-go » est la capacité.
 */
export function guessFromSlug(pathname: string) {
  const slug = pathname.split('/').filter(Boolean).pop() ?? '';
  const words = slug.split('-').slice(0, -1);
  const goIndex = words.indexOf('go');
  const model = (goIndex > 0 ? words.slice(0, goIndex - 1) : words).join(' ');
  return { model, brand: words[0] ?? '' };
}

/** Suggestions affichées sur la page « annonce indisponible » : même modèle, sinon même marque. */
export function SimilarFromSlug() {
  const pathname = usePathname();
  const [state, setState] = useState<{ title: string; products: ProductCard[] } | null>(null);

  useEffect(() => {
    const { model, brand } = guessFromSlug(pathname);
    if (!brand) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const byModel = model
          ? await api<Page<ProductCard>>(`/catalog/products?q=${encodeURIComponent(model)}&pageSize=4`, { signal: ctrl.signal })
          : null;
        if (byModel?.items.length) {
          setState({ title: 'Le même modèle chez d’autres vendeurs', products: byModel.items });
          return;
        }
        const byBrand = await api<Page<ProductCard>>(`/catalog/products?brand=${encodeURIComponent(brand)}&pageSize=4`, { signal: ctrl.signal });
        if (byBrand.items.length) {
          const label = brand.charAt(0).toUpperCase() + brand.slice(1);
          setState({ title: `Autres ${label} disponibles`, products: byBrand.items });
        }
      } catch {
        /* Suggestions facultatives : en cas d'échec, la page reste utilisable. */
      }
    })();
    return () => ctrl.abort();
  }, [pathname]);

  if (!state) return null;
  return (
    <section className="mt-12 md:mt-16">
      <h2 className="display mb-6 text-[26px] sm:text-[32px]">{state.title}</h2>
      <ProductRow products={state.products} auto label={state.title} />
    </section>
  );
}
