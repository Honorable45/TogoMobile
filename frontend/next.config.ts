import type { NextConfig } from 'next';

/**
 * Le navigateur appelle toujours /api/v1/* sur le domaine du site : Next.js relaie vers l'API.
 * Les cookies de session restent ainsi « first-party », même si l'API est hébergée ailleurs (Render…).
 */
const API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
/** L'administration est une application séparée (dossier admin/) : les anciennes adresses /admin y renvoient. */
const ADMIN_URL = (process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:3001').replace(/\/$/, '');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async redirects() {
    return [
      { source: '/admin', destination: `${ADMIN_URL}/`, permanent: false },
      { source: '/admin/:path*', destination: `${ADMIN_URL}/:path*`, permanent: false },
    ];
  },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
