import { SearchX } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { PageBanner } from '@/components/layout/page-banner';

export default function ProductNotFound() {
  return (
    <>
    <PageBanner title="Introuvable" />
    <div className="container-page py-12 md:py-16">
      <EmptyState icon={<SearchX className="size-10" />} title="Cette annonce n’est plus disponible" action={<ButtonLink href="/catalogue">Voir le catalogue</ButtonLink>}>
        Elle a peut-être été retirée par le vendeur, ou la boutique n’est plus active.
      </EmptyState>
    </div>
    </>
  );
}
