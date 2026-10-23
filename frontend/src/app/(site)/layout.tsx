import { Suspense } from 'react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense>
        <SiteHeader />
      </Suspense>
      <main id="contenu" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
