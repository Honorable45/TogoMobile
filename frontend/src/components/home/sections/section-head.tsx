import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/** Titre de section de l'accueil : grande phrase à gauche, lien discret facultatif à droite. */
export function SectionHead({ id, title, href, link }: { id?: string; title: string; href?: string; link?: string }) {
  return (
    <div className="container-page mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 md:mb-10">
      <h2 id={id} className="display text-[32px] md:text-[48px]">{title}</h2>
      {href && link && (
        <Link href={href} className="inline-flex items-center gap-0.5 text-[17px] text-brand-600 hover:underline">
          {link} <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}
