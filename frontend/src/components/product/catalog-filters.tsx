'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { CONDITION_LABELS } from '@/lib/format';
import type { Brand, Condition } from '@/lib/types';
import { Button } from '../ui/button';

export interface FilterValues {
  q?: string;
  brand: string[];
  condition: string[];
  storage: string[];
  ram: string[];
  minPrice?: string;
  maxPrice?: string;
  available?: boolean;
  promo?: boolean;
  minRating?: string;
  sort: string;
}

const STORAGE = [32, 64, 128, 256, 512, 1024];
const RAM = [2, 3, 4, 6, 8, 12];
export const SORT_OPTIONS = [
  { value: 'recent', label: 'Plus récents' },
  { value: 'price_asc', label: 'Prix croissant' },
  { value: 'price_desc', label: 'Prix décroissant' },
  { value: 'discount', label: 'Meilleures réductions' },
  { value: 'rating', label: 'Mieux notés' },
  { value: 'popular', label: 'Plus consultés' },
];

/** Pastille de filtre : vraie case à cocher (ou bouton radio), stylée en pilule. */
function Pill({ type = 'checkbox', name, value, checked, label }: { type?: 'checkbox' | 'radio'; name: string; value: string; checked: boolean; label: string }) {
  return (
    <label className="cursor-pointer">
      <input type={type} name={name} value={value} defaultChecked={checked} className="peer sr-only" />
      <span className="inline-flex min-h-11 items-center rounded-full border border-line-2 bg-surface px-3.5 text-[13px] font-medium text-ink-2 transition-colors peer-checked:border-navy peer-checked:bg-navy peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 hover:border-muted">
        {label}
      </span>
    </label>
  );
}

/** Construit la requête à partir du formulaire : les cases cochées d'un même groupe sont jointes par des virgules. */
function toSearch(form: HTMLFormElement) {
  const fd = new FormData(form);
  const out = new URLSearchParams();
  for (const key of ['q', 'brand', 'condition', 'storage', 'ram', 'minPrice', 'maxPrice', 'available', 'promo', 'minRating', 'sort']) {
    const values = fd.getAll(key).map(String).filter(Boolean);
    if (!values.length) continue;
    if (key === 'sort' && values[0] === 'recent') continue;
    out.set(key, values.join(','));
  }
  return out.toString();
}

export function CatalogFilters({ values, brands, showBrand = true, total }: { values: FilterValues; brands: Brand[]; showBrand?: boolean; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  const apply = (e?: FormEvent) => {
    e?.preventDefault();
    if (!formRef.current) return;
    const qs = toSearch(formRef.current);
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  // Sur grand écran, chaque changement s'applique immédiatement ; sur mobile, au clic sur « Afficher ».
  const onChange = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) apply();
  };

  const group = 'border-t border-line pt-4';
  const title = 'eyebrow mb-2.5';
  const pills = 'flex flex-wrap gap-1.5';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-line-2 bg-surface px-4 text-sm font-medium lg:hidden"
        aria-expanded={open}
        aria-controls="filters-panel"
      >
        <SlidersHorizontal className="size-4" aria-hidden /> Filtres
      </button>

      {open && <div className="fixed inset-0 z-40 bg-navy/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <form
        id="filters-panel"
        ref={formRef}
        method="get"
        onSubmit={(e) => {
          apply(e);
          setOpen(false);
        }}
        onChange={onChange}
        aria-label="Filtres du catalogue"
        className={`${
          open ? 'fixed inset-y-2 right-2 z-50 flex w-[88%] max-w-sm animate-slide-up flex-col overflow-hidden rounded-3xl bg-canvas shadow-pop' : 'hidden'
        } lg:static lg:z-auto lg:flex lg:w-auto lg:max-w-none lg:flex-col lg:bg-transparent lg:shadow-none`}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3 lg:hidden">
          <p className="display text-2xl">Filtres</p>
          <button type="button" onClick={() => setOpen(false)} className="inline-flex size-11 items-center justify-center rounded-full hover:bg-paper-2" aria-label="Fermer les filtres">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 lg:overflow-visible lg:p-0">
          {values.q && <input type="hidden" name="q" value={values.q} />}
          <input type="hidden" name="sort" value={values.sort} />

          <div className={pills}>
            <Pill name="available" value="true" checked={!!values.available} label="Disponibles" />
            <Pill name="promo" value="true" checked={!!values.promo} label="En promotion" />
          </div>

          {showBrand && brands.length > 0 && (
            <fieldset className={group}>
              <legend className={title}>Marque</legend>
              <div className={pills}>
                {brands.map((b) => (
                  <Pill key={b.id} name="brand" value={b.slug} checked={values.brand.includes(b.slug)} label={b.name} />
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className={group}>
            <legend className={title}>Prix (FCFA)</legend>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="minPrice">Prix minimum</label>
              <input id="minPrice" name="minPrice" type="number" inputMode="numeric" min={0} step={1000} placeholder="Min" defaultValue={values.minPrice} className="num h-11 w-full rounded-xl border border-line-2 bg-surface px-3 text-sm" />
              <span className="text-subtle" aria-hidden>–</span>
              <label className="sr-only" htmlFor="maxPrice">Prix maximum</label>
              <input id="maxPrice" name="maxPrice" type="number" inputMode="numeric" min={0} step={1000} placeholder="Max" defaultValue={values.maxPrice} className="num h-11 w-full rounded-xl border border-line-2 bg-surface px-3 text-sm" />
            </div>
          </fieldset>

          <fieldset className={group}>
            <legend className={title}>État</legend>
            <div className={pills}>
              {(Object.keys(CONDITION_LABELS) as Condition[]).map((c) => (
                <Pill key={c} name="condition" value={c} checked={values.condition.includes(c)} label={CONDITION_LABELS[c]} />
              ))}
            </div>
          </fieldset>

          <fieldset className={group}>
            <legend className={title}>Stockage</legend>
            <div className={pills}>
              {STORAGE.map((s) => (
                <Pill key={s} name="storage" value={String(s)} checked={values.storage.includes(String(s))} label={s >= 1024 ? '1 To' : `${s} Go`} />
              ))}
            </div>
          </fieldset>

          <fieldset className={group}>
            <legend className={title}>Mémoire vive</legend>
            <div className={pills}>
              {RAM.map((r) => (
                <Pill key={r} name="ram" value={String(r)} checked={values.ram.includes(String(r))} label={`${r} Go`} />
              ))}
            </div>
          </fieldset>

          <fieldset className={group}>
            <legend className={title}>Note minimale</legend>
            <div className={pills}>
              <Pill type="radio" name="minRating" value="" checked={!values.minRating} label="Toutes" />
              <Pill type="radio" name="minRating" value="4" checked={values.minRating === '4'} label="4 ★ et plus" />
              <Pill type="radio" name="minRating" value="3" checked={values.minRating === '3'} label="3 ★ et plus" />
            </div>
          </fieldset>

          <noscript>
            <Button type="submit">Appliquer</Button>
          </noscript>
        </div>

        <div className="flex gap-2 border-t border-line p-4 lg:mt-4 lg:border-0 lg:p-0">
          <button
            type="button"
            onClick={() => {
              router.push(values.q ? `${pathname}?q=${encodeURIComponent(values.q)}` : pathname, { scroll: false });
              setOpen(false);
            }}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-brand-600 underline underline-offset-4"
          >
            <RotateCcw className="size-4" aria-hidden /> Réinitialiser
          </button>
          <Button type="submit" className="flex-1 lg:hidden">
            Afficher {total > 0 ? `(${total})` : ''}
          </Button>
        </div>
      </form>
    </>
  );
}

export function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-muted sm:inline">Trier par</span>
      <select
        aria-label="Trier les résultats"
        value={value}
        onChange={(e) => {
          const params = new URLSearchParams(window.location.search);
          if (e.target.value === 'recent') params.delete('sort');
          else params.set('sort', e.target.value);
          params.delete('page');
          const qs = params.toString();
          router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }}
        className="h-11 rounded-full border border-line-2 bg-surface px-4 text-sm font-medium"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
