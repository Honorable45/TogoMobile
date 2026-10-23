'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState, type FormEvent } from 'react';
import { Download, Plus, Printer, QrCode, Receipt, RefreshCw, X } from 'lucide-react';
import { PageHeader, useSellerShop } from '@/components/seller/seller-shell';
import type { SellerProduct } from '@/components/seller/types';
import { useSession } from '@/components/session';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Alert, Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import { api, ClientApiError, errorMessage } from '@/lib/api-client';
import { fcfa, formatDate, formatDateTime, fromLomeInput, SALE_STATUS_LABELS, toLomeInput } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Page, SaleStatus } from '@/lib/types';

interface Sale {
  id: string;
  internalRef: string;
  soldAt: string;
  amount: number | null;
  buyerPhoneHint: string | null;
  status: SaleStatus;
  statusNote: string | null;
  product: { id: string; title: string; slug: string; reference: string };
  token: { state: 'ACTIVE' | 'USED' | 'REVOKED' | 'EXPIRED' | 'NONE'; expiresAt: string; usedAt: string | null } | null;
  review: { id: string; rating: number; status: string } | null;
}

interface Qr {
  url: string;
  svg: string;
  expiresAt: string;
}

const STATUS_TONE: Record<SaleStatus, 'brand' | 'muted' | 'warn' | 'danger' | 'neutral'> = {
  DECLARED: 'neutral',
  PENDING_VERIFICATION: 'warn',
  VERIFIED: 'brand',
  DISPUTED: 'danger',
  CANCELLED: 'muted',
};

const svgDataUrl = (svg: string) => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

function QrDialog({ qr, sale, shopName, onClose }: { qr: Qr; sale: { title: string; ref: string }; shopName: string; onClose: () => void }) {
  const src = svgDataUrl(qr.svg);

  const download = async () => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 800;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 800, 800);
    ctx.drawImage(img, 0, 0, 800, 800);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `qr-avis-${sale.ref}.png`;
    a.click();
  };

  const print = () => {
    const w = window.open('', '_blank', 'width=480,height=640');
    if (!w) return;
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>QR code avis</title>
      <style>body{font-family:system-ui,sans-serif;text-align:center;padding:24px;color:#121a16}img{width:260px;height:260px}h1{font-size:18px;margin:0 0 4px}p{font-size:13px;margin:4px 0}</style></head>
      <body><h1>${shopName.replace(/[<>&]/g, '')}</h1><p>Merci pour votre achat !</p><img src="${src}" alt="QR code"/>
      <p><strong>Scannez ce code avec l’appareil photo de votre téléphone</strong><br/>pour donner votre avis sur votre achat.</p>
      <p>Valable jusqu’au ${formatDate(qr.expiresAt)}. Usage unique.</p></body></html>`);
    w.document.close();
    w.onload = () => w.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="qr-title">
      <div className="max-h-dvh w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-pop sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="qr-title" className="text-lg font-bold">QR code d’avis</h2>
            <p className="text-sm text-muted">{sale.title} · {sale.ref}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-canvas" aria-label="Fermer">
            <X className="size-5" />
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="QR code à faire scanner par le client" className="mx-auto my-4 size-64 rounded-lg border border-line" />
        <Alert tone="warn" title="Ce code ne s’affiche qu’une seule fois">
          Montrez-le au client maintenant, imprimez-le ou téléchargez-le. Si le client le perd, vous pourrez en générer un nouveau (l’ancien sera désactivé). Valable jusqu’au {formatDate(qr.expiresAt)}.
        </Alert>
        <p className="mt-3 text-xs text-muted">Le client devra saisir le numéro que vous avez enregistré pour confirmer son achat. Ne remplissez jamais l’avis à sa place.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={download}><Download className="size-4" aria-hidden /> Télécharger</Button>
          <Button variant="outline" onClick={print}><Printer className="size-4" aria-hidden /> Imprimer</Button>
        </div>
      </div>
    </div>
  );
}

function DeclareForm({ products, onCreated, onCancel }: { products: SellerProduct[]; onCreated: (sale: Sale, qr: Qr) => void; onCancel: () => void }) {
  const [state, setState] = useState<{ loading?: boolean; error?: string; errors?: Record<string, string> }>({});
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState({ loading: true });
    try {
      const r = await api<{ sale: Sale; qr: Qr }>('/seller/sales', {
        body: {
          productId: fd.get('productId'),
          soldAt: fromLomeInput(String(fd.get('soldAt'))),
          internalRef: fd.get('internalRef'),
          amount: fd.get('amount') ? Number(fd.get('amount')) : undefined,
          buyerPhone: fd.get('buyerPhone'),
        },
      });
      onCreated(r.sale, r.qr);
    } catch (err) {
      setState({ error: errorMessage(err), errors: err instanceof ClientApiError ? err.errors : {} });
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="Téléphone vendu" className="sm:col-span-2" error={state.errors?.productId}>
        {(p) => (
          <Select {...p} name="productId" required defaultValue="">
            <option value="" disabled>Choisir…</option>
            {products.map((x) => <option key={x.id} value={x.id}>{x.title} — réf. {x.reference}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Date de la vente (heure de Lomé)" error={state.errors?.soldAt}>
        {(p) => <Input {...p} name="soldAt" type="datetime-local" defaultValue={toLomeInput(new Date())} max={toLomeInput(new Date())} required />}
      </Field>
      <Field label="Référence de la transaction" error={state.errors?.internalRef} hint="Numéro de reçu ou de facture, propre à votre boutique.">
        {(p) => <Input {...p} name="internalRef" required maxLength={40} placeholder="FAC-2026-0142" />}
      </Field>
      <Field label="Numéro de l’acheteur" error={state.errors?.buyerPhone} hint="Le client devra le saisir pour confirmer son achat. Il n’est conservé que sous forme chiffrée.">
        {(p) => <Input {...p} name="buyerPhone" type="tel" inputMode="tel" required placeholder="90 12 34 56" />}
      </Field>
      <Field label="Montant convenu (FCFA)" optional error={state.errors?.amount}>
        {(p) => <Input {...p} name="amount" inputMode="numeric" pattern="[0-9]*" />}
      </Field>
      {state.error && <div className="sm:col-span-2"><Alert tone="danger">{state.error}</Alert></div>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" loading={state.loading}><QrCode className="size-4" aria-hidden /> Enregistrer et générer le QR code</Button>
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
      </div>
    </form>
  );
}

function SalesPage() {
  const { shop } = useSellerShop();
  const { notify } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const status = params.get('status') ?? '';
  const sales = useApi<Page<Sale>>(`/seller/sales?pageSize=50${status ? `&status=${status}` : ''}`);
  const products = useApi<Page<SellerProduct>>('/seller/products?pageSize=60');
  const [declaring, setDeclaring] = useState(false);
  const [qr, setQr] = useState<{ qr: Qr; title: string; ref: string } | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const sellable = (products.data?.items ?? []).filter((p) => p.status !== 'DRAFT' && !p.removedAt);

  const regenerate = async (s: Sale) => {
    if (!window.confirm('Générer un nouveau QR code ? L’ancien code ne fonctionnera plus.')) return;
    try {
      const r = await api<Qr>(`/seller/sales/${s.id}/qr`, { method: 'POST' });
      setQr({ qr: r, title: s.product.title, ref: s.internalRef });
      void sales.reload();
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  };

  const cancel = async (s: Sale) => {
    if (!window.confirm('Annuler cette vente ? Le QR code associé sera désactivé.')) return;
    try {
      await api(`/seller/sales/${s.id}/cancel`, { method: 'POST' });
      notify('Vente annulée');
      void sales.reload();
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  };

  return (
    <div className="space-y-5" ref={top}>
      <PageHeader
        title="Ventes et QR codes"
        description="Enregistrez une vente conclue avec un client pour lui remettre un QR code d’avis. Une vente n’est « vérifiée » qu’après confirmation par le client et les contrôles de la plateforme."
        action={!declaring && shop.status === 'ACTIVE' ? <Button onClick={() => setDeclaring(true)}><Plus className="size-4" aria-hidden /> Enregistrer une vente</Button> : undefined}
      />
      {shop.status !== 'ACTIVE' && <Alert tone="info">L’enregistrement des ventes est disponible une fois votre boutique active.</Alert>}

      {declaring && (
        <section className="rounded-card border border-line bg-surface p-4 sm:p-6">
          <h2 className="display mb-5 text-2xl">Enregistrer une vente</h2>
          {products.data && sellable.length === 0 ? (
            <Alert tone="warn">Aucune annonce publiée. Les ventes portent sur vos annonces publiées (ou retirées après la vente).</Alert>
          ) : (
            <DeclareForm
              products={sellable}
              onCancel={() => setDeclaring(false)}
              onCreated={(sale, code) => {
                setDeclaring(false);
                setQr({ qr: code, title: sale.product.title, ref: sale.internalRef });
                void sales.reload();
              }}
            />
          )}
        </section>
      )}

      <div className="scrollbar-none flex gap-1 overflow-x-auto" role="tablist">
        {[['', 'Toutes'], ['DECLARED', 'En attente du client'], ['PENDING_VERIFICATION', 'En vérification'], ['VERIFIED', 'Vérifiées'], ['DISPUTED', 'Contestées'], ['CANCELLED', 'Annulées']].map(([v, l]) => (
          <button key={v} role="tab" aria-selected={status === v} onClick={() => router.push(v ? `/vendeur/ventes?status=${v}` : '/vendeur/ventes')} className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium ${status === v ? 'bg-navy text-white' : 'bg-surface text-ink-2 hover:bg-white'}`}>
            {l}
          </button>
        ))}
      </div>

      {sales.error && <Alert tone="danger">{sales.error}</Alert>}
      {!sales.data ? (
        <Skeleton className="h-48" />
      ) : sales.data.items.length === 0 ? (
        <EmptyState icon={<Receipt className="size-10" />} title="Aucune vente enregistrée">
          Après chaque vente, enregistrez-la ici et remettez le QR code au client : c’est la seule façon d’obtenir des avis « Achat vérifié ».
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {sales.data.items.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONE[s.status]}>{SALE_STATUS_LABELS[s.status]}</Badge>
                  <p className="truncate font-semibold">{s.product.title}</p>
                </div>
                <p className="text-xs text-muted">
                  {s.internalRef} · {formatDateTime(s.soldAt)}
                  {s.amount ? ` · ${fcfa(s.amount)}` : ''}
                  {s.buyerPhoneHint ? ` · acheteur …${s.buyerPhoneHint}` : ''}
                </p>
                <p className="text-xs text-muted">
                  {s.review
                    ? `Avis reçu : ${s.review.rating}/5`
                    : s.token?.state === 'ACTIVE'
                      ? `QR code actif jusqu’au ${formatDate(s.token.expiresAt)}`
                      : s.token?.state === 'EXPIRED'
                        ? 'QR code expiré'
                        : s.token?.state === 'REVOKED'
                          ? 'QR code désactivé'
                          : ''}
                  {s.statusNote ? ` · ${s.statusNote}` : ''}
                </p>
              </div>
              {s.status === 'DECLARED' && (
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={() => regenerate(s)}><RefreshCw className="size-4" aria-hidden /> Nouveau QR code</Button>
                  <Button variant="ghost" size="sm" onClick={() => cancel(s)}>Annuler</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {qr && <QrDialog qr={qr.qr} sale={{ title: qr.title, ref: qr.ref }} shopName={shop.name} onClose={() => setQr(null)} />}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <SalesPage />
    </Suspense>
  );
}
