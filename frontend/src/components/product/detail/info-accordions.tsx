import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDate, SPEC_LABELS } from '@/lib/format';
import type { ProductDetail } from '@/lib/types';

/** Bloc repliable (élément <details> du navigateur : marche même sans JavaScript). */
function Fold({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16px] font-medium text-ink [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="pb-5 text-[15px] leading-relaxed text-ink-2">{children}</div>
    </details>
  );
}

/** Ligne « libellé : valeur » des caractéristiques. */
function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(8rem,40%)_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

/** Questions fréquentes : ce que la plateforme garantit vraiment (elle n'encaisse rien). */
const FAQ = [
  { q: 'Comment commander ?', a: 'Touchez « Commander sur WhatsApp » : un message est préparé avec le nom du téléphone, sa référence et son prix. Vous l’envoyez vous-même à la boutique.' },
  { q: 'Comment payer ?', a: 'Directement à la boutique, de préférence au moment où vous récupérez l’appareil. Méfiez-vous de toute demande de paiement à l’avance sans garantie.' },
  { q: 'Livraison ou retrait ?', a: 'À convenir avec la boutique : retrait sur place ou livraison, selon ce qu’elle propose.' },
  { q: 'Que vérifier avant de payer ?', a: 'L’IMEI (composez *#06#), l’état de la batterie, l’écran, les caméras et que l’appareil n’est lié à aucun compte (iCloud, Google). Demandez un reçu avec le modèle, le prix et la garantie.' },
];

/** Bas de la colonne d'informations : caractéristiques, description, contenu de la boîte, questions. */
export function InfoAccordions({ p }: { p: ProductDetail }) {
  const specs = (p.specs ?? {}) as Record<string, string | null | undefined>;
  const rows = [
    { label: 'Marque', value: p.brand.name },
    { label: 'Modèle', value: p.model },
    { label: 'Couleur', value: p.color },
    { label: 'Mémoire vive', value: p.ramGb ? `${p.ramGb} Go` : null },
    ...Object.entries(SPEC_LABELS).map(([k, label]) => ({ label, value: specs[k] })),
    ...(p.specs?.extra ?? []),
    { label: 'Référence de l’annonce', value: p.reference },
  ].filter((r): r is { label: string; value: string } => !!r.value);

  return (
    <div className="border-t border-line">
      <Fold title="Caractéristiques techniques">
        <dl className="divide-y divide-line">
          {rows.map((r) => (
            <Spec key={r.label} label={r.label} value={r.value} />
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted">Informations fournies par la boutique, mises à jour le {formatDate(p.updatedAt)}.</p>
      </Fold>
      <Fold title="Description de la boutique">
        <p className="whitespace-pre-line">{p.description || 'La boutique n’a pas ajouté de description.'}</p>
      </Fold>
      <Fold title="Dans la boîte">
        <p>{p.accessories || 'Non précisé : demandez à la boutique ce qui est fourni (chargeur, câble, boîte…).'}</p>
      </Fold>
      <Fold title="Questions fréquentes">
        <dl className="space-y-3">
          {FAQ.map(({ q, a }) => (
            <div key={q}>
              <dt className="font-medium text-ink">{q}</dt>
              <dd>{a}</dd>
            </div>
          ))}
        </dl>
      </Fold>
    </div>
  );
}
