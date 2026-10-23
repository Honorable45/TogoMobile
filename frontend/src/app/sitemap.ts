import type { MetadataRoute } from 'next';
import { brand } from '@/config/brand';
import { apiGet } from '@/lib/api-server';

export const revalidate = 3600;

/** Plan du site : pages publiques, boutiques actives et annonces listées (jamais les contenus retirés). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = brand.siteUrl;
  const statics = ['', '/catalogue', '/boutiques', '/promotions', '/comment-ca-marche', '/devenir-vendeur', '/moderation', '/conditions', '/confidentialite', '/contact'].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: 'daily' as const,
  }));
  try {
    const data = await apiGet<{ shops: Array<{ slug: string; updatedAt: string }>; products: Array<{ slug: string; updatedAt: string }> }>('/sitemap', { revalidate: 3600 });
    return [
      ...statics,
      ...data.shops.map((s) => ({ url: `${base}/boutiques/${s.slug}`, lastModified: s.updatedAt })),
      ...data.products.map((p) => ({ url: `${base}/produits/${p.slug}`, lastModified: p.updatedAt })),
    ];
  } catch {
    return statics;
  }
}
