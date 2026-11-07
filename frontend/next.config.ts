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
  /** Test sur téléphone en Wi-Fi : DEV_ORIGINS="192.168.1.20" autorise le rechargement à chaud depuis cette adresse. */
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean),
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
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          // Politique de contenu minimale et sans risque de casse : pas d'affichage dans un cadre d'un autre site,
          // pas de plugins, formulaires envoyés au site lui-même, balise <base> verrouillée.
          // (Une restriction des scripts demanderait des nonces sur le rendu de Next.js.)
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
