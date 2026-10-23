'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { History, Pencil, Plus, Tag, X } from 'lucide-react';
import { PageHeader, useSellerShop } from '@/components/seller/seller-shell';
import type { SellerProduct } from '@/components/seller/types';
import { useSession } from '@/components/session';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert, Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import { api, ClientApiError, errorMessage } from '@/lib/api-client';
import { fcfa, formatDateTime, fromLomeInput, PHASE_LABELS, toLomeInput } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Page, PromotionPhase } from '@/lib/types';

interface SellerPromotion {
  id: string;
  productId: string;
  promoPrice: number;
  referencePrice: number;
  discountPercent: number;
  startsAt: string;
  endsAt: string;
  status: string;
  statusReason: string | null;
  conditions: string | null;
  phase: PromotionPhase;
  editable: boolean;
  product: { id: string; title: string; slug: string; price: number; reference: string; imageUrl: string | null };
}

interface PromoEvent {
  id: string;
  type: string;
  createdAt: string;
  data: Record<string, unknown>;
}

const PHASE_TONE: Record<PromotionPhase, 'brand' | 'promo' | 'muted' | 'danger' | 'neutral'> = {
  RUNNING: 'promo',
  SCHEDULED: 'brand',
  ENDED: 'muted',
  DISABLED: 'neutral',
  SUSPENDED: 'danger',
};

const EVENT_LABELS: Record<string, string> = {
  CREATED: 'Création',
  UPDATED: 'Modification',
  DISABLED: 'Désactivée par le vendeur',
  AUTO_DISABLED: 'Arrêtée automatiquement (prix habituel modifié)',
  SUSPENDED: 'Suspendue par l’administration',
  REINSTATED: 'Rétablie par l’administration',
};

function PromotionForm({ products, editing, onDone }: { products: SellerProduct[]; editing?: SellerPromotion; onDone: () => void }) {
  const now = new Date();
  const [productId, setProductId] = useState(editing?.productId ?? '');
  const [promoPrice, setPromoPrice] = useState(editing ? String(editing.promoPrice) : '');
  const [startsAt, setStartsAt] = useState(editing ? toLomeInput(new Date(editing.startsAt)) : toLomeInput(now));
  const [endsAt, setEndsAt] = useState(editing ? toLomeInput(new Date(editing.endsAt)) : toLomeInput(new Date(now.getTime() + 7 * 86_400_000)));
  const [conditions, setConditions] = useState(editing?.conditions ?? '');
  const [state, setState] = useState<{ loading?: boolean; error?: string; errors?: Record<string, string> }>({});
  const product = products.find((p) => p.id === productId);
  const reference = editing?.referencePrice ?? product?.price;
  const price = Number(promoPrice);
  const pct = reference && price > 0 && price < reference ? Math.floor(((reference - price) / reference) * 100) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState({ loading: true });
    try {
      const body = { promoPrice: price, startsAt: fromLomeInput(startsAt), endsAt: fromLomeInput(endsAt), conditions: conditions.trim() || null };
      if (editing) await api(`/seller/promotions/${editing.id}`, { method: 'PATCH', body });
      else await api('/seller/promotions', { body: { ...body, productId } });
      onDone();
    } catch (err) {
      setState({ error: errorMessage(err), errors: err instanceof ClientApiError ? err.errors : {} });
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Produit" className="sm:col-span-2" error={state.errors?.productId} hint="Seules les annonces publiées et disponibles peuvent être mises en promotion.">
        {(p) => (
          <Select {...p} value={productId} onChange={(e) => setProductId(e.target.value)} disabled={!!editing} required>
            <option value="">Choisir un produit…</option>
            {products.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title} — {fcfa(x.price)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Prix promotionnel (FCFA)" error={state.errors?.promoPrice}>
        {(p) => <Input {...p} inputMode="numeric" value={promoPrice} onChange={(e) => setPromoPrice(e.target.value.replace(/[^\d]/g, ''))} required />}
      </Field>
      <div className="flex flex-col justify-end rounded-lg bg-canvas p-3 text-sm" aria-live="polite">
        {reference ? (
          <>
            <span className="text-muted">Prix habituel : {fcfa(reference)}</span>
            {pct !== null ? (
              <span className="font-bold text-promo-700">Réduction affichée : −{pct} %</span>
            ) : price > 0 ? (
              <span className="font-semibold text-danger">Le prix promotionnel doit être inférieur au prix habituel.</span>
            ) : null}
          </>
        ) : (
          <span className="text-muted">Choisissez un produit pour voir la réduction.</span>
        )}
      </div>
      <Field label="Début (heure de Lomé)" error={state.errors?.startsAt}>
        {(p) => <Input {...p} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />}
      </Field>
      <Field label="Fin (heure de Lomé)" error={state.errors?.endsAt} hint="90 jours maximum.">
        {(p) => <Input {...p} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />}
      </Field>
      <Field label="Conditions" optional className="sm:col-span-2" error={state.errors?.conditions}>
        {(p) => <Textarea {...p} rows={2} maxLength={300} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="Ex. : dans la limite du stock disponible" />}
      </Field>
      <p className="text-xs text-muted sm:col-span-2">
        Le prix barré affiché est le prix le plus bas pratiqué pour ce produit au cours des 30 derniers jours. Modifier ensuite le prix habituel mettra fin à la promotion.
      </p>
      {state.error && <div className="sm:col-span-2"><Alert tone="danger">{state.error}</Alert></div>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" loading={state.loading} disabled={!productId}>
          {editing ? 'Enregistrer' : 'Créer la promotion'}
        </Button>
        <Button variant="ghost" onClick={onDone}>Annuler</Button>
      </div>
    </form>
  );
}

export default function SellerPromotionsPage() {
  const { shop } = useSellerShop();
  const { notify } = useSession();
  const promos = useApi<Page<SellerPromotion>>('/seller/promotions?pageSize=60');
  const products = useApi<Page<SellerProduct>>('/seller/products?status=PUBLISHED&pageSize=60');
  const [mode, setMode] = useState<{ kind: 'create' } | { kind: 'edit'; promo: SellerPromotion } | null>(null);
  const [history, setHistory] = useState<{ promo: SellerPromotion; events: PromoEvent[] } | null>(null);
  const historyDialog = useRef<HTMLDialogElement>(null);
  const eligible = useMemo(() => (products.data?.items ?? []).filter((p) => p.availability === 'AVAILABLE' && !p.removedAt), [products.data]);

  const disable = async (p: SellerPromotion) => {
    if (!window.confirm(`Désactiver la promotion sur « ${p.product.title} » ? Le prix habituel sera de nouveau affiché immédiatement.`)) return;
    try {
      await api(`/seller/promotions/${p.id}/disable`, { method: 'POST' });
      notify('Promotion désactivée');
      void promos.reload();
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  };

  const openHistory = async (p: SellerPromotion) => {
    const events = await api<PromoEvent[]>(`/seller/promotions/${p.id}/history`);
    setHistory({ promo: p, events });
    historyDialog.current?.showModal();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Promotions"
        description="Des offres datées : elles démarrent et s’arrêtent automatiquement. Elles apparaissent sur votre page boutique, dans le catalogue et sur la page Promotions."
        action={
          !mode && shop.status === 'ACTIVE' ? (
            <Button onClick={() => setMode({ kind: 'create' })}>
              <Plus className="size-4" aria-hidden /> Nouvelle promotion
            </Button>
          ) : undefined
        }
      />
      {shop.status !== 'ACTIVE' && <Alert tone="info">Les promotions sont disponibles une fois votre boutique active.</Alert>}

      {mode && (
        <section className="rounded-card border border-line bg-surface p-4 sm:p-6">
          <h2 className="display mb-5 text-2xl">{mode.kind === 'edit' ? 'Modifier la promotion programmée' : 'Nouvelle promotion'}</h2>
          {mode.kind === 'create' && products.data && eligible.length === 0 ? (
            <Alert tone="warn">Aucune annonce publiée et disponible. Publiez d’abord un téléphone.</Alert>
          ) : (
            <PromotionForm
              products={mode.kind === 'edit' ? (products.data?.items ?? []) : eligible}
              editing={mode.kind === 'edit' ? mode.promo : undefined}
              onDone={() => {
                setMode(null);
                void promos.reload();
              }}
            />
          )}
        </section>
      )}

      {promos.error && <Alert tone="danger">{promos.error}</Alert>}
      {!promos.data ? (
        <Skeleton className="h-48" />
      ) : promos.data.items.length === 0 ? (
        <EmptyState icon={<Tag className="size-10" />} title="Aucune promotion pour l’instant">
          Une promotion bien choisie (durée courte, réduction réelle) attire l’attention sur votre boutique.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {promos.data.items.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={PHASE_TONE[p.phase]}>{PHASE_LABELS[p.phase]}</Badge>
                  <p className="truncate font-semibold">{p.product.title}</p>
                </div>
                <p className="text-sm">
                  <span className="font-bold">{fcfa(p.promoPrice)}</span>
                  <span className="ml-2 text-muted line-through">{fcfa(p.referencePrice)}</span>
                  <span className="ml-2 font-semibold text-promo-700">−{p.discountPercent} %</span>
                </p>
                <p className="text-xs text-muted">
                  Du {formatDateTime(p.startsAt)} au {formatDateTime(p.endsAt)}
                  {p.statusReason ? ` · ${p.statusReason}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => openHistory(p)}>
                  <History className="size-4" aria-hidden /> Historique
                </Button>
                {p.editable && (
                  <Button variant="outline" size="sm" onClick={() => setMode({ kind: 'edit', promo: p })}>
                    <Pencil className="size-4" aria-hidden /> Modifier
                  </Button>
                )}
                {(p.phase === 'RUNNING' || p.phase === 'SCHEDULED') && (
                  <Button variant="outline" size="sm" onClick={() => disable(p)}>
                    Désactiver
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <dialog ref={historyDialog} className="m-auto w-[min(30rem,calc(100%-2rem))] rounded-2xl p-0 shadow-pop backdrop:bg-ink/50" aria-label="Historique de la promotion">
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="font-bold">Historique — {history?.promo.product.title}</h2>
            <button type="button" onClick={() => historyDialog.current?.close()} className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-canvas" aria-label="Fermer">
              <X className="size-5" />
            </button>
          </div>
          <ol className="space-y-3 border-l border-line pl-4">
            {history?.events.map((e) => (
              <li key={e.id} className="text-sm">
                <p className="font-semibold">{EVENT_LABELS[e.type] ?? e.type}</p>
                <p className="text-xs text-muted">{formatDateTime(e.createdAt)}</p>
                {e.type !== 'AUTO_DISABLED' && typeof e.data?.reason === 'string' && <p className="text-xs text-muted">Motif : {e.data.reason}</p>}
              </li>
            ))}
          </ol>
        </div>
      </dialog>
    </div>
  );
}
