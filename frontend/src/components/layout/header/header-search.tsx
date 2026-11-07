'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';

/** Barre de recherche de l'en-tête mobile : renvoie vers le catalogue. */
export function HeaderSearch() {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname.startsWith('/catalogue') ? (params.get('q') ?? '') : '';
  // Le catalogue a sa propre grande barre de recherche : pas de deuxième barre dans l'en-tête.
  if (pathname.startsWith('/catalogue')) return null;
  return (
    <form action="/catalogue" role="search" className="border-t border-white/80 px-2 py-1.5 md:hidden">
      <label htmlFor="header-search" className="sr-only">
        Rechercher un produit
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted" aria-hidden />
        <input
          key={current}
          id="header-search"
          name="q"
          type="search"
          defaultValue={current}
          enterKeyHint="search"
          placeholder="Rechercher un téléphone, une marque…"
          className="h-10 w-full rounded-full border border-line-2 bg-surface pl-11 pr-4 text-[15px] placeholder:text-faint focus:border-brand-600 focus:outline-none"
        />
      </div>
    </form>
  );
}
