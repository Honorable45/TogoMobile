import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { ErrorReporter } from '@/components/error-reporter';
import { SessionProvider } from '@/components/session';
import { brand } from '@/config/brand';
import './globals.css';

// Polices auto-hébergées, identiques au site public.
const newsreader = localFont({
  src: [
    { path: '../../node_modules/@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2', style: 'normal' },
    { path: '../../node_modules/@fontsource-variable/newsreader/files/newsreader-latin-opsz-italic.woff2', style: 'italic' },
  ],
  variable: '--font-newsreader',
  weight: '200 800',
  display: 'swap',
});
const plexSans = localFont({
  src: '../../node_modules/@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2',
  variable: '--font-plex-sans',
  weight: '100 700',
  display: 'swap',
});
const plexMono = localFont({
  src: [
    { path: '../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2', weight: '400' },
    { path: '../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2', weight: '500' },
  ],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: `Administration · ${brand.name}`, template: `%s · Administration ${brand.name}` },
  applicationName: `${brand.name} Administration`,
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: '#0f2147', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh">
        <a href="#contenu" className="sr-only z-50 rounded-full bg-navy px-5 py-2.5 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          Aller au contenu
        </a>
        <ErrorReporter />
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
