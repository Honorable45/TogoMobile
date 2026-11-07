import { ProductSkeleton } from '@/components/layout/page-skeleton';

/** Affiché dès le clic sur un téléphone, le temps que la fiche se charge. */
export default function Loading() {
  return <ProductSkeleton />;
}
