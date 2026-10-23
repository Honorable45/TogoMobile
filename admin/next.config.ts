import type { NextConfig } from 'next';

/**
 * Application d'administration, déployée sur son propre domaine (ex. admin.<domaine>).
 * Comme le site, elle relaie /api/v1/* vers l'API : le cookie de session reste « first-party » sur ce domaine.
 */
const API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Jamais indexée par les moteurs de recherche.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ];
  },
};

export default nextConfig;
