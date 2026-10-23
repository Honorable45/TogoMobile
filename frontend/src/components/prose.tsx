import type { ReactNode } from 'react';
import { PageBanner } from './layout/page-banner';

/** Mise en page des pages d'information (textes longs, lisibilité sur mobile). */
export function ProsePage({ title, intro, updated, children }: { title: string; intro?: string; updated?: string; children: ReactNode }) {
  return (
    <>
      <PageBanner title={title} subtitle={intro} eyebrow={updated ? `Mise à jour : ${updated}` : undefined} />
      <div className="container-page py-12 md:py-16">
        <article className="mx-auto max-w-2xl space-y-4 text-[15px] leading-relaxed text-ink-2 [&_a]:font-medium [&_a]:text-brand-600 [&_a]:underline [&_a]:underline-offset-4 [&_h2]:display [&_h2]:mt-10 [&_h2]:text-[26px] [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_strong]:text-ink [&_ul]:space-y-2">
          {children}
        </article>
      </div>
    </>
  );
}
