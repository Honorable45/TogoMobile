/**
 * Pages « squelette » : affichées dès le clic, pendant que la vraie page se charge.
 * Sans elles, rien ne bouge à l'écran pendant le chargement et on croit que le clic n'a pas marché.
 * Utilisées par les fichiers loading.tsx (Next.js les affiche automatiquement).
 */

/** Bloc gris arrondi qui pulse doucement. */
function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-paper-2 ${className}`} />;
}

/** Haut de page commun : place de l'en-tête flottant, puis titre et sous-titre. */
function Heading() {
  return (
    <div className="bg-surface">
      <div className="container-page pb-8 pt-[156px] md:pt-[104px]">
        <Bone className="h-4 w-32" />
        <Bone className="mt-4 h-10 w-3/4 max-w-xl" />
        <Bone className="mt-3 h-4 w-1/2 max-w-sm" />
      </div>
    </div>
  );
}

/** Fiche produit : grande photo, puis encadré du prix et bouton Commander. */
export function ProductSkeleton() {
  return (
    <div role="status" aria-label="Chargement de la fiche">
      <Heading />
      <div className="container-page grid gap-8 py-8 lg:grid-cols-2">
        <Bone className="aspect-square w-full" />
        <div className="space-y-4">
          <Bone className="h-36 w-full" />
          <Bone className="h-12 w-full rounded-full" />
          <Bone className="h-12 w-full rounded-full" />
          <Bone className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}

/** Liste (catalogue, boutiques, promos) : titre puis grille de cartes. */
export function ListSkeleton() {
  return (
    <div role="status" aria-label="Chargement">
      <Heading />
      <div className="container-page grid grid-cols-2 gap-3 py-8 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Bone key={i} className="h-72 w-full" />
        ))}
      </div>
    </div>
  );
}
