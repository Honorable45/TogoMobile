import { BatteryMedium, CircleCheck, TriangleAlert } from 'lucide-react';
import { CONDITION_LABELS } from '@/lib/format';
import type { ProductDetail } from '@/lib/types';

/** Ce que veut dire chaque état, en une phrase (affiché sous le nom de l'état). */
const CONDITION_TEXT: Record<ProductDetail['condition'], string> = {
  NEW: 'Jamais utilisé, dans son emballage d’origine.',
  LIKE_NEW: 'Aucune trace d’usure visible, fonctionne parfaitement.',
  REFURBISHED: 'Remis en état et contrôlé par la boutique avant la vente.',
  USED_GOOD: 'Légères traces d’usage, fonctionne parfaitement.',
  USED_FAIR: 'Traces d’usage visibles, fonctionne correctement.',
};

/** Pastille d'information (batterie, défauts…). */
function Chip({ icon, children, tone = 'neutral' }: { icon: React.ReactNode; children: React.ReactNode; tone?: 'neutral' | 'warn' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] ${tone === 'warn' ? 'bg-warn-50 text-warn' : 'bg-surface text-ink-2'}`}>
      {icon}
      {children}
    </span>
  );
}

/** « État de l'appareil » : l'état annoncé expliqué, la santé de la batterie et les défauts déclarés. */
export function ConditionPanel({ p }: { p: ProductDetail }) {
  const battery = p.specs?.batteryHealth;
  return (
    <section aria-labelledby="etat" className="rounded-3xl bg-canvas p-5">
      <h2 id="etat" className="text-[19px] font-semibold text-ink">État de l’appareil</h2>
      <p className="mt-3 text-[17px] font-medium text-ink">{CONDITION_LABELS[p.condition]}</p>
      <p className="mt-0.5 text-sm text-muted">{CONDITION_TEXT[p.condition]}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {battery && <Chip icon={<BatteryMedium className="size-4" aria-hidden />}>Batterie {battery}</Chip>}
        {p.defects ? (
          <Chip tone="warn" icon={<TriangleAlert className="size-4" aria-hidden />}>Défauts déclarés : {p.defects}</Chip>
        ) : (
          <Chip icon={<CircleCheck className="size-4 text-ok" aria-hidden />}>Aucun défaut déclaré</Chip>
        )}
      </div>
    </section>
  );
}
