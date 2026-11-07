import { PackageX } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { PageBanner } from '@/components/layout/page-banner';
import { SimilarFromSlug } from '@/components/product/similar-from-slug';

export default function ProductNotFound() {
  return (
    <>
    <PageBanner title="Cette annonce est terminée" back="/catalogue" backLabel="Catalogue" />
    <div className="container-page py-12 md:py-16">
      <EmptyState icon={<PackageX className="size-10" />} title="Ce téléphone n’est plus en vente" action={<ButtonLink href="/catalogue">Voir tout le catalogue</ButtonLink>}>
        Il a peut-être déjà trouvé preneur, ou le vendeur a retiré son annonce. Voici des téléphones proches encore disponibles.
      </EmptyState>
      <SimilarFromSlug />
    </div>
    </>
  );
}
