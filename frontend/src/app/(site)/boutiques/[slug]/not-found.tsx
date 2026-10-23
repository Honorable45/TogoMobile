import { Store } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { PageBanner } from '@/components/layout/page-banner';

export default function ShopNotFound() {
  return (
    <>
    <PageBanner title="Introuvable" />
    <div className="container-page py-12 md:py-16">
      <EmptyState icon={<Store className="size-10" />} title="Cette boutique n’est pas disponible" action={<ButtonLink href="/boutiques">Voir les boutiques</ButtonLink>}>
        Elle n’existe pas, n’a pas encore été validée ou a été suspendue.
      </EmptyState>
    </div>
    </>
  );
}
