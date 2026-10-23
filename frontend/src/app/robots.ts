import type { MetadataRoute } from 'next';
import { brand } from '@/config/brand';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/vendeur', '/admin', '/compte', '/favoris', '/avis', '/api/', '/connexion', '/inscription'] }],
    sitemap: `${brand.siteUrl}/sitemap.xml`,
  };
}
