import 'server-only';

/**
 * Appels à l'API depuis le serveur Next.js (pages publiques, rendu serveur).
 *
 * Cache des données publiques :
 * - avec invalidation configurée (REVALIDATE_SECRET, l'API appelle /api/revalidate à chaque changement),
 *   les réponses sont mises en cache par étiquette (`product:<slug>`, `shop:<slug>`, `catalog`…) et
 *   invalidées immédiatement après un changement de prix, de disponibilité, de boutique ou de promotion ;
 *   une durée maximale (CACHE_MAX_SECONDS) protège contre une invalidation manquée ;
 * - sans invalidation configurée : cache d'une seconde seulement (un changement apparaît en 1 s au plus) ;
 *   « no-store » n'est pas utilisable ici car les fiches produit sont des pages mises en cache (ISR).
 */
const API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
const TAGGED_CACHE = !!process.env.REVALIDATE_SECRET;
const CACHE_MAX_SECONDS = Number(process.env.CACHE_MAX_SECONDS || 300);

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiGet<T>(path: string, opts: { revalidate?: number; tags?: string[] } = {}): Promise<T> {
  const caching =
    opts.tags?.length && TAGGED_CACHE
      ? { next: { tags: opts.tags, revalidate: opts.revalidate ?? CACHE_MAX_SECONDS } }
      : { next: { revalidate: opts.revalidate ?? 1 } };
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...caching,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(res.status, body.message ?? `Erreur ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Variante qui renvoie null sur 404 (contenu supprimé, boutique suspendue…). */
export async function apiGetOrNull<T>(path: string, opts: { revalidate?: number; tags?: string[] } = {}): Promise<T | null> {
  try {
    return await apiGet<T>(path, opts);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 410)) return null;
    throw e;
  }
}

export function toQuery(params: Record<string, string | string[] | number | boolean | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    q.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Étiquettes de cache (identiques à celles émises par l'API, voir backend/src/cache/revalidation.service.ts). */
export const cacheTags = {
  product: (slug: string) => `product:${slug}`,
  shop: (slug: string) => `shop:${slug}`,
  catalog: 'catalog',
  home: 'home',
  promotions: 'promotions',
  brands: 'brands',
};
