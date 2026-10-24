'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, Check, ImagePlus, Loader2, Star, Trash2, Video } from 'lucide-react';
import { api, ClientApiError, errorMessage } from '@/lib/api-client';
import { AVAILABILITY_LABELS, CONDITION_LABELS, fcfa, SPEC_LABELS, storageLabel } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Availability, Brand, Category, Condition, ProductCard as Card } from '@/lib/types';
import { ProductCard } from '../product/product-card';
import { useSession } from '../session';
import { Button } from '../ui/button';
import { Field, Input, Select, Textarea } from '../ui/field';
import { Alert, Badge } from '../ui/misc';
import { useSellerShop } from './seller-shell';
import { StatusBadge, type SellerProduct } from './types';

const STEPS = ['Informations', 'Caractéristiques', 'Prix et stock', 'Photos et vidéo', 'Aperçu'] as const;
const STEP_OF_FIELD: Record<string, number> = {
  brandId: 0, categoryId: 0, model: 0, title: 0, condition: 0, color: 0, description: 0, defects: 0, accessories: 0, warranty: 0,
  storageGb: 1, ramGb: 1, specs: 1,
  price: 2, stock: 2, availability: 2,
};
const SPEC_KEYS = ['screen', 'processor', 'battery', 'batteryHealth', 'rearCamera', 'frontCamera', 'connectivity', 'sim', 'os', 'dimensions', 'weight'] as const;
const STORAGE_OPTIONS = [1, 8, 16, 32, 64, 128, 256, 512, 1024];
const RAM_OPTIONS = [1, 2, 3, 4, 6, 8, 12, 16];

interface FormState {
  brandId: string;
  categoryId: string;
  model: string;
  title: string;
  condition: Condition | '';
  color: string;
  description: string;
  defects: string;
  accessories: string;
  warranty: string;
  storageGb: string;
  ramGb: string;
  specs: Record<string, string>;
  extra: Array<{ label: string; value: string }>;
  price: string;
  stock: string;
  availability: Availability;
}

function fromProduct(p?: SellerProduct): FormState {
  const specs = (p?.specs ?? {}) as Record<string, unknown>;
  return {
    brandId: p?.brandId ?? '',
    categoryId: p?.categoryId ?? '',
    model: p?.model ?? '',
    title: p?.title ?? '',
    condition: p?.condition ?? '',
    color: p?.color ?? '',
    description: p?.description ?? '',
    defects: p?.defects ?? '',
    accessories: p?.accessories ?? '',
    warranty: p?.warranty ?? '',
    storageGb: p?.storageGb ? String(p.storageGb) : '',
    ramGb: p?.ramGb ? String(p.ramGb) : '',
    specs: Object.fromEntries(SPEC_KEYS.map((k) => [k, typeof specs[k] === 'string' ? (specs[k] as string) : ''])),
    extra: Array.isArray(specs.extra) ? (specs.extra as Array<{ label: string; value: string }>) : [],
    price: p ? String(p.price) : '',
    stock: p ? String(p.stock) : '1',
    availability: p?.availability ?? 'AVAILABLE',
  };
}

function toPayload(f: FormState, isNew: boolean) {
  const opt = (v: string) => (v.trim() ? v.trim() : isNew ? undefined : null);
  const specs: Record<string, unknown> = {};
  for (const k of SPEC_KEYS) specs[k] = f.specs[k]?.trim() || null;
  specs.extra = f.extra.filter((e) => e.label.trim() && e.value.trim());
  return {
    brandId: f.brandId,
    categoryId: opt(f.categoryId),
    model: f.model.trim(),
    title: f.title.trim() || undefined,
    condition: f.condition || undefined,
    color: opt(f.color),
    description: opt(f.description),
    defects: opt(f.defects),
    accessories: opt(f.accessories),
    warranty: opt(f.warranty),
    storageGb: f.storageGb ? Number(f.storageGb) : isNew ? undefined : null,
    ramGb: f.ramGb ? Number(f.ramGb) : isNew ? undefined : null,
    specs,
    price: f.price ? Number(f.price.replace(/\s/g, '')) : undefined,
    stock: f.stock ? Number(f.stock) : undefined,
    availability: f.availability,
  };
}

/** Réduit les photos volumineuses dans le navigateur avant envoi (économie de données mobiles). */
async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.size < 1.5 * 1024 * 1024 || typeof createImageBitmap === 'undefined') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // format non décodable par le navigateur : le serveur tranchera
  }
}

/** Envoi PUT direct vers l'URL autorisée (stockage objet ou relais local), avec progression. */
interface UploadTarget {
  url: string;
  method: 'PUT' | 'POST';
  headers: Record<string, string>;
  /** POST (Cloudinary) : champs signés du formulaire, envoyés avant le fichier. */
  fields?: Record<string, string>;
}

/** Envoi direct au stockage : corps brut (PUT, S3/R2/local) ou formulaire signé (POST, Cloudinary). */
function sendWithProgress(target: UploadTarget, blob: Blob, fileName: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.url);
    for (const [k, v] of Object.entries(target.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ClientApiError(xhr.status, xhr.status === 413 ? 'Fichier trop volumineux.' : 'Le stockage a refusé le fichier. Réessayez.'));
    xhr.onerror = () => reject(new ClientApiError(0, 'Connexion interrompue pendant l’envoi. Réessayez.'));
    if (target.method === 'POST') {
      const form = new FormData();
      for (const [k, v] of Object.entries(target.fields ?? {})) form.append(k, v);
      form.append('file', blob, fileName);
      xhr.send(form);
    } else {
      xhr.send(blob);
    }
  });
}

const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };

/**
 * Parcours d'envoi : autorisation par l'API → envoi direct au stockage (le fichier ne transite pas par l'API)
 * → finalisation (vérification du type réel) → traitement asynchrone (vignettes, vidéo).
 */
async function uploadMedia(productId: string, file: File, onProgress: (pct: number) => void): Promise<SellerProduct> {
  const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name);
  const blob = isVideo ? file : await shrinkImage(file);
  const contentType = blob.type || MIME_BY_EXT[file.name.split('.').pop()?.toLowerCase() ?? ''] || 'application/octet-stream';
  const auth = await api<UploadTarget & { uploadId: string }>(`/seller/products/${productId}/media/uploads`, {
    body: { type: isVideo ? 'VIDEO' : 'IMAGE', contentType, size: blob.size },
  });
  await sendWithProgress(auth, blob, file.name, onProgress);
  return api<SellerProduct>(`/seller/products/${productId}/media/uploads/${auth.uploadId}/complete`, { method: 'POST' });
}

function MediaManager({ product, onChange }: { product: SellerProduct; onChange: (p: SellerProduct) => void }) {
  const [upload, setUpload] = useState<{ name: string; pct: number } | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const live = product.media.filter((m) => m.status !== 'FAILED');
  const images = live.filter((m) => m.type === 'IMAGE');
  const video = live.find((m) => m.type === 'VIDEO');
  const ordered = [...product.media].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const send = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(undefined);
    for (const file of Array.from(files)) {
      try {
        setUpload({ name: file.name, pct: 0 });
        onChange(await uploadMedia(product.id, file, (pct) => setUpload({ name: file.name, pct })));
      } catch (e) {
        setError(`${file.name} : ${errorMessage(e)}`);
        break;
      } finally {
        setUpload(null);
      }
    }
  };

  const reorder = async (order: string[], primaryId?: string) => {
    setBusy(true);
    try {
      onChange(await api<SellerProduct>(`/seller/products/${product.id}/media/order`, { method: 'PUT', body: { order, primaryId } }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const move = (i: number, dir: -1 | 1) => {
    const ids = ordered.map((m) => m.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void reorder(ids);
  };

  return (
    <div className="space-y-4">
      <Alert tone="info">
        Jusqu’à <strong>3 photos</strong> et <strong>1 vidéo</strong> (facultative). Pour un appareil d’occasion, photographiez l’appareil réel : écran allumé, dos, contours et éventuels défauts.
      </Alert>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ordered.map((m, i) => (
          <div key={m.id} className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="relative aspect-square bg-canvas">
              {m.status === 'PROCESSING' ? (
                <div className="flex size-full flex-col items-center justify-center gap-2 text-xs text-muted" role="status">
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                  {m.type === 'VIDEO' ? 'Vidéo en traitement…' : 'Photo en traitement…'}
                </div>
              ) : m.status === 'FAILED' ? (
                <div className="flex size-full flex-col items-center justify-center gap-1 bg-danger-50 p-2 text-center text-xs text-danger" role="alert">
                  <strong>Échec</strong>
                  <span className="line-clamp-3">{m.error ?? 'Fichier inutilisable.'}</span>
                </div>
              ) : m.type === 'IMAGE' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.thumbUrl ?? m.url ?? undefined} alt={`Photo ${i + 1}`} width={480} height={480} className="size-full object-cover" />
              ) : (
                <video src={m.url ?? undefined} poster={m.posterUrl ?? undefined} preload="none" muted playsInline className="size-full object-cover" aria-label="Vidéo" />
              )}
              {m.isPrimary && <Badge tone="brand" className="absolute left-2 top-2">Principale</Badge>}
              {m.type === 'VIDEO' && <Badge tone="neutral" className="absolute left-2 top-2">Vidéo</Badge>}
            </div>
            <div className="flex items-center justify-between gap-1 p-1.5">
              <div className="flex">
                <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} className="inline-flex size-8 items-center justify-center rounded-md hover:bg-canvas disabled:opacity-30" aria-label="Déplacer avant">
                  <ArrowUp className="size-4 sm:-rotate-90" />
                </button>
                <button type="button" disabled={busy || i === ordered.length - 1} onClick={() => move(i, 1)} className="inline-flex size-8 items-center justify-center rounded-md hover:bg-canvas disabled:opacity-30" aria-label="Déplacer après">
                  <ArrowDown className="size-4 sm:-rotate-90" />
                </button>
              </div>
              <div className="flex">
                {m.type === 'IMAGE' && !m.isPrimary && (
                  <button type="button" disabled={busy} onClick={() => reorder(ordered.map((x) => x.id), m.id)} className="inline-flex size-8 items-center justify-center rounded-md hover:bg-canvas" aria-label="Choisir comme photo principale">
                    <Star className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm('Supprimer ce média ?')) return;
                    setBusy(true);
                    try {
                      onChange(await api<SellerProduct>(`/seller/products/${product.id}/media/${m.id}`, { method: 'DELETE' }));
                    } catch (e) {
                      setError(errorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="inline-flex size-8 items-center justify-center rounded-md text-danger hover:bg-danger-50"
                  aria-label="Supprimer"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {upload && (
          <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-card border border-dashed border-brand-200 bg-brand-50 p-3 text-center text-xs text-brand-800" role="status">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            <span className="line-clamp-1">{upload.name}</span>
            <span className="h-1.5 w-full overflow-hidden rounded-full bg-brand-100"><span className="block h-full bg-brand-600" style={{ width: `${upload.pct}%` }} /></span>
            <span>{upload.pct} %</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="sr-only" onChange={(e) => { void send(e.target.files); e.target.value = ''; }} />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { void send(e.target.files); e.target.value = ''; }} />
        <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" onChange={(e) => { void send(e.target.files); e.target.value = ''; }} />
        <Button variant="outline" disabled={images.length >= 3 || !!upload} onClick={() => photoInput.current?.click()}>
          <ImagePlus className="size-4" aria-hidden /> Ajouter des photos ({images.length}/3)
        </Button>
        <Button variant="outline" disabled={images.length >= 3 || !!upload} onClick={() => cameraInput.current?.click()}>
          <Camera className="size-4" aria-hidden /> Prendre une photo
        </Button>
        <Button variant="outline" disabled={!!video || !!upload} onClick={() => videoInput.current?.click()}>
          <Video className="size-4" aria-hidden /> {video ? 'Vidéo ajoutée (1/1)' : 'Ajouter une vidéo'}
        </Button>
      </div>
      <p className="text-xs text-muted">Photos : JPEG, PNG, WebP ou AVIF, 8 Mo maximum (réduites automatiquement). Vidéo : MP4, MOV ou WebM, 40 Mo maximum, de préférence moins d’une minute.</p>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}

export function ProductEditor({ initial }: { initial?: SellerProduct }) {
  const router = useRouter();
  const { notify } = useSession();
  const { shop } = useSellerShop();
  const brands = useApi<Brand[]>('/brands');
  const categories = useApi<Category[]>('/categories');
  const [product, setProduct] = useState<SellerProduct | undefined>(initial);
  const [form, setForm] = useState<FormState>(() => fromProduct(initial));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const isNew = !product;
  const locked = !!product?.removedAt || shop.status === 'SUSPENDED';
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  // Traitement asynchrone des médias en cours : actualisation périodique jusqu'à la fin, à toutes les étapes.
  const processing = !!product?.media.some((m) => m.status === 'PROCESSING');
  useEffect(() => {
    if (!processing || !product) return;
    const t = setInterval(async () => {
      try {
        setProduct(await api<SellerProduct>(`/seller/products/${product.id}`));
      } catch {
        /* nouvelle tentative au prochain intervalle */
      }
    }, 2500);
    return () => clearInterval(t);
  }, [processing, product]);
  const hasReadyImage = !!product?.media.some((m) => m.type === 'IMAGE' && m.status === 'READY');

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const validateLocal = (upTo: number) => {
    const e: Record<string, string> = {};
    if (upTo >= 0) {
      if (!form.brandId) e.brandId = 'Choisissez la marque.';
      if (!form.model.trim()) e.model = 'Indiquez le modèle.';
      if (!form.condition) e.condition = 'Indiquez l’état du téléphone.';
    }
    if (upTo >= 2) {
      const price = Number(form.price.replace(/\s/g, ''));
      if (!form.price || !Number.isInteger(price) || price < 100) e.price = 'Indiquez un prix en FCFA (nombre entier, 100 minimum).';
      if (form.stock === '' || Number(form.stock) < 0) e.stock = 'Indiquez la quantité disponible.';
    }
    setErrors(e);
    if (Object.keys(e).length) {
      setStep(Math.min(...Object.keys(e).map((k) => STEP_OF_FIELD[k] ?? 0)));
      return false;
    }
    return true;
  };

  /** Enregistre (création ou mise à jour) ; la saisie reste intacte en cas d'erreur. */
  const save = async () => {
    if (!validateLocal(2)) return null;
    setSaving(true);
    setError(undefined);
    try {
      const body = toPayload(form, isNew);
      const saved = isNew
        ? await api<SellerProduct>('/seller/products', { body })
        : await api<SellerProduct>(`/seller/products/${product!.id}`, { method: 'PATCH', body });
      setProduct(saved);
      setForm(fromProduct(saved));
      if (isNew) window.history.replaceState(null, '', `/vendeur/produits/${saved.id}`);
      return saved;
    } catch (e) {
      const errs = e instanceof ClientApiError ? e.errors : {};
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(errs)) flat[k.startsWith('specs.') ? 'specs' : k] = v;
      setErrors(flat);
      setError(errorMessage(e));
      const steps = Object.keys(flat).map((k) => STEP_OF_FIELD[k]).filter((s) => s !== undefined);
      if (steps.length) setStep(Math.min(...steps));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    setError(undefined);
    if (step < 2) {
      if (step === 0 && !validateLocal(0)) return;
      setStep(step + 1);
    } else if (step === 2) {
      if (await save()) setStep(3);
    } else setStep(step + 1);
  };

  const publish = async () => {
    if (!product) return;
    setSaving(true);
    setError(undefined);
    try {
      const p = await api<SellerProduct>(`/seller/products/${product.id}/publish`, { method: 'POST' });
      setProduct(p);
      notify(p.moderation === 'APPROVED' ? 'Annonce publiée' : 'Annonce envoyée pour validation : elle sera visible après approbation');
      router.push('/vendeur/produits');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const brandName = brands.data?.find((b) => b.id === form.brandId)?.name ?? '';
  const autoTitle = [brandName, form.model, storageLabel(Number(form.storageGb) || null)].filter(Boolean).join(' ');
  const primary = product?.media.find((m) => m.isPrimary);
  const preview: Card = {
    id: product?.id ?? 'apercu',
    slug: product?.slug ?? '',
    reference: product?.reference ?? '',
    title: form.title || autoTitle || 'Votre téléphone',
    model: form.model,
    brand: { name: brandName, slug: '' },
    condition: (form.condition || 'NEW') as Condition,
    availability: form.availability,
    storageGb: Number(form.storageGb) || null,
    ramGb: Number(form.ramGb) || null,
    price: Number(form.price) || 0,
    currentPrice: product?.runningPromotion?.promoPrice ?? (Number(form.price) || 0),
    promotion: product?.runningPromotion ?? null,
    image: primary?.url ? { url: primary.url, thumbUrl: primary.thumbUrl ?? primary.url, width: null, height: null } : null,
    shop: { name: shop.name, slug: shop.slug, city: shop.city, logoUrl: shop.logoUrl, identityVerified: !!shop.identityVerifiedAt },
    ratingAvg: 0,
    ratingCount: 0,
    isDemo: false,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/vendeur/produits" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden /> Produits
          </Link>
          <h1 className="display mt-2 text-[30px] sm:text-[38px]">{isNew ? 'Ajouter un téléphone' : form.title || autoTitle}</h1>
        </div>
        {product && <StatusBadge p={product} />}
      </div>

      {product?.status === 'PUBLISHED' && product.moderation === 'PENDING' && (
        <Alert tone="info" title="Annonce en attente de validation">
          L’équipe vérifie chaque nouvelle annonce avant sa mise en ligne. Elle sera visible dès son approbation.
        </Alert>
      )}
      {product?.moderation === 'REJECTED' && (
        <Alert tone="danger" title="Annonce refusée">
          {product.moderationNote ? `Motif : ${product.moderationNote}. ` : ''}Corrigez-la puis publiez-la à nouveau : elle sera réexaminée.
        </Alert>
      )}
      {product?.removedAt && (
        <Alert tone="danger" title="Annonce retirée par l’administration">
          {product.removalReason ? `Motif : ${product.removalReason}.` : ''} Elle ne peut plus être modifiée. Contactez l’administration si vous pensez qu’il s’agit d’une erreur.
        </Alert>
      )}

      <nav aria-label="Étapes" className="space-y-3">
        <div className="flex gap-1.5" aria-hidden>
          {STEPS.map((label, i) => (
            <span key={label} className={`h-1 flex-1 rounded-full transition-colors duration-200 ${i <= step ? 'bg-promo-600' : 'bg-line'}`} />
          ))}
        </div>
        <ol className="scrollbar-none flex gap-1 overflow-x-auto">
          {STEPS.map((label, i) => {
            const reachable = i <= 2 || !!product;
            return (
              <li key={label} className="shrink-0">
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => setStep(i)}
                  aria-current={step === i ? 'step' : undefined}
                  className={`flex h-10 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors disabled:opacity-40 ${step === i ? 'bg-navy text-white' : 'text-ink-2 hover:bg-white'}`}
                >
                  {i < step && <Check className="size-3.5" aria-hidden />}
                  {label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <fieldset disabled={locked || saving} key={step} className="animate-slide-up rounded-3xl border border-line bg-surface p-5 sm:p-8">
        <p className="font-mono text-xs text-muted">Étape {step + 1} sur {STEPS.length}</p>
        <h2 ref={headingRef} tabIndex={-1} className="display mb-6 mt-1 text-[28px] outline-none">
          {STEPS[step]}
        </h2>

        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Marque" error={errors.brandId}>
              {(p) => (
                <Select {...p} value={form.brandId} onChange={(e) => set('brandId', e.target.value)}>
                  <option value="">Choisir…</option>
                  {brands.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Modèle" error={errors.model} hint="Ex. : iPhone 13, Galaxy A15, Camon 20">
              {(p) => <Input {...p} value={form.model} onChange={(e) => set('model', e.target.value)} maxLength={80} />}
            </Field>
            <Field label="État" error={errors.condition}>
              {(p) => (
                <Select {...p} value={form.condition} onChange={(e) => set('condition', e.target.value as Condition)}>
                  <option value="">Choisir…</option>
                  {Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Catégorie" error={errors.categoryId} optional>
              {(p) => (
                <Select {...p} value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                  <option value="">—</option>
                  {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Titre de l’annonce" error={errors.title} optional className="sm:col-span-2" hint={autoTitle ? `Si vide : « ${autoTitle} »` : 'Généré automatiquement à partir de la marque, du modèle et du stockage.'}>
              {(p) => <Input {...p} value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={120} />}
            </Field>
            <Field label="Couleur" error={errors.color} optional>
              {(p) => <Input {...p} value={form.color} onChange={(e) => set('color', e.target.value)} maxLength={40} />}
            </Field>
            <Field label="Garantie" error={errors.warranty} optional hint="Ex. : 3 mois boutique, 12 mois constructeur">
              {(p) => <Input {...p} value={form.warranty} onChange={(e) => set('warranty', e.target.value)} maxLength={160} />}
            </Field>
            <Field label="Accessoires inclus" error={errors.accessories} optional className="sm:col-span-2">
              {(p) => <Input {...p} value={form.accessories} onChange={(e) => set('accessories', e.target.value)} placeholder="Chargeur, câble, coque…" maxLength={300} />}
            </Field>
            <Field label="Description" error={errors.description} optional className="sm:col-span-2">
              {(p) => <Textarea {...p} rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={3000} />}
            </Field>
            <Field
              label="Défauts déclarés"
              error={errors.defects}
              optional
              className="sm:col-span-2"
              hint={form.condition.startsWith('USED') ? 'Important pour un appareil d’occasion : rayures, pièces remplacées, batterie…' : 'Rayures, réparations, pièces remplacées…'}
            >
              {(p) => <Textarea {...p} rows={2} value={form.defects} onChange={(e) => set('defects', e.target.value)} maxLength={1000} />}
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Stockage" error={errors.storageGb} optional>
                {(p) => (
                  <Select {...p} value={form.storageGb} onChange={(e) => set('storageGb', e.target.value)}>
                    <option value="">Non renseigné</option>
                    {STORAGE_OPTIONS.map((s) => <option key={s} value={s}>{storageLabel(s)}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Mémoire vive (RAM)" error={errors.ramGb} optional>
                {(p) => (
                  <Select {...p} value={form.ramGb} onChange={(e) => set('ramGb', e.target.value)}>
                    <option value="">Non renseignée</option>
                    {RAM_OPTIONS.map((s) => <option key={s} value={s}>{s} Go</option>)}
                  </Select>
                )}
              </Field>
              {SPEC_KEYS.map((k) => (
                <Field key={k} label={SPEC_LABELS[k]} optional>
                  {(p) => <Input {...p} value={form.specs[k] ?? ''} onChange={(e) => set('specs', { ...form.specs, [k]: e.target.value })} maxLength={160} />}
                </Field>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Autres caractéristiques <span className="font-normal text-subtle">(facultatif)</span></p>
              {form.extra.map((e, i) => (
                <div key={i} className="flex gap-2">
                  <Input aria-label="Libellé" placeholder="Ex. : Étanchéité" value={e.label} maxLength={40} onChange={(ev) => set('extra', form.extra.map((x, j) => (j === i ? { ...x, label: ev.target.value } : x)))} />
                  <Input aria-label="Valeur" placeholder="Ex. : IP68" value={e.value} maxLength={160} onChange={(ev) => set('extra', form.extra.map((x, j) => (j === i ? { ...x, value: ev.target.value } : x)))} />
                  <Button variant="ghost" onClick={() => set('extra', form.extra.filter((_, j) => j !== i))} aria-label="Retirer cette ligne">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              {form.extra.length < 10 && (
                <Button variant="outline" size="sm" onClick={() => set('extra', [...form.extra, { label: '', value: '' }])}>
                  Ajouter une caractéristique
                </Button>
              )}
              {errors.specs && <p className="text-sm text-danger">{errors.specs}</p>}
            </div>
            <p className="text-xs text-muted">Ne remplissez que ce dont vous êtes sûr : un champ vide est affiché « Non renseigné ».</p>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Prix habituel (FCFA)" error={errors.price} hint={form.price && Number(form.price) ? fcfa(Number(form.price)) : undefined}>
              {(p) => <Input {...p} inputMode="numeric" value={form.price} onChange={(e) => set('price', e.target.value.replace(/[^\d]/g, ''))} placeholder="350000" />}
            </Field>
            <Field label="Quantité en stock" error={errors.stock}>
              {(p) => <Input {...p} type="number" min={0} inputMode="numeric" value={form.stock} onChange={(e) => set('stock', e.target.value)} />}
            </Field>
            <Field label="Disponibilité" error={errors.availability}>
              {(p) => (
                <Select {...p} value={form.availability} onChange={(e) => set('availability', e.target.value as Availability)}>
                  {Object.entries(AVAILABILITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              )}
            </Field>
            {!isNew && Number(form.price) !== product!.price && (
              <div className="sm:col-span-3">
                <Alert tone="warn">Modifier le prix habituel met fin aux promotions en cours ou programmées sur ce produit.</Alert>
              </div>
            )}
          </div>
        )}

        {step === 3 && product && <MediaManager product={product} onChange={setProduct} />}

        {step === 4 && product && (
          <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
            <div className="pointer-events-none" aria-label="Aperçu de la carte produit">
              <ProductCard product={preview} />
            </div>
            <div className="space-y-3 text-sm">
              <p className="font-semibold">Vérifiez votre annonce avant de la publier :</p>
              <ul className="space-y-1.5">
                {[
                  { ok: product.media.some((m) => m.type === 'IMAGE' && m.status === 'READY'), label: 'Au moins une photo prête' },
                  { ok: !!form.price, label: `Prix : ${form.price ? fcfa(Number(form.price)) : '—'}` },
                  { ok: !!form.condition, label: `État : ${form.condition ? CONDITION_LABELS[form.condition] : '—'}` },
                  { ok: true, label: form.defects ? 'Défauts déclarés' : 'Aucun défaut déclaré' },
                ].map((c) => (
                  <li key={c.label} className="flex items-center gap-2">
                    <Check className={`size-4 ${c.ok ? 'text-brand-600' : 'text-subtle'}`} aria-hidden />
                    {c.label}
                  </li>
                ))}
              </ul>
              {shop.status !== 'ACTIVE' && (
                <Alert tone="info">La publication sera possible dès que votre boutique sera active. Votre brouillon est enregistré.</Alert>
              )}
              {product.status === 'PUBLISHED' && (
                <Link href={`/produits/${product.slug}`} target="_blank" className="inline-block font-semibold text-brand-700 hover:underline">
                  Voir l’annonce publiée
                </Link>
              )}
            </div>
          </div>
        )}

        {error && <div className="mt-5"><Alert tone="danger">{error}</Alert></div>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
            <ArrowLeft className="size-4" aria-hidden /> Retour
          </Button>
          <div className="flex flex-wrap gap-2">
            {!isNew && step < 3 && (
              <Button variant="outline" loading={saving} onClick={async () => (await save()) && notify('Modifications enregistrées')}>
                Enregistrer
              </Button>
            )}
            {step < 4 ? (
              <Button onClick={next} loading={saving && step === 2}>
                {step === 2 ? (isNew ? 'Enregistrer et ajouter les photos' : 'Continuer') : 'Continuer'} <ArrowRight className="size-4" aria-hidden />
              </Button>
            ) : product?.status !== 'PUBLISHED' ? (
              <Button onClick={publish} loading={saving || (processing && !hasReadyImage)} disabled={shop.status !== 'ACTIVE' || !hasReadyImage}>
                {processing && !hasReadyImage ? 'Photos en traitement…' : 'Publier l’annonce'}
              </Button>
            ) : (
              <Button onClick={() => router.push('/vendeur/produits')}>Terminer</Button>
            )}
          </div>
        </div>
      </fieldset>
    </div>
  );
}
