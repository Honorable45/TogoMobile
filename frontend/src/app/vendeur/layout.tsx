import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HeaderSpacer, SiteHeader } from '@/components/layout/site-header';
import { SellerShell } from '@/components/seller/seller-shell';

export const metadata: Metadata = { title: 'Espace vendeur', robots: { index: false, follow: false } };

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense>
        <SiteHeader />
      </Suspense>
      <HeaderSpacer />
      <main id="contenu">
        <SellerShell>{children}</SellerShell>
      </main>
    </>
  );
}
