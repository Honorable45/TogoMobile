'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ExternalLink, ImagePlus, Megaphone } from 'lucide-react';
import { useDecision } from '@/components/admin/admin-shell';
import { useSession } from '@/components/session';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Alert, Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import { siteHref } from '@/config/brand';
import { api, ClientApiError, errorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

type AdStatus = 'ACTIVE' | 'SCHEDULED' | 'ENDED' | 'DISABLED';

interface AdminAd {
  id: string;
  title: string;
  subtitle: string | null;
  advertiser: string | null;
  linkUrl: string | null;
  imageUrl: string;
  mobileImageUrl: string;
  width: number;
  height: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  sortOrder: number;
  status: AdStatus;
}

const STATUS: Record<AdStatus, { label: string; tone: 'ok' | 'brand' | 'muted' | 'warn' }> = {
  ACTIVE: { label: 'En ligne', tone: 'ok' },
  SCHEDULED: { label: 'Programmée', tone: 'brand' },
  ENDED: { label: 'Terminée', tone: 'muted' },
  DISABLED: { label: 'Désactivée', tone: 'warn' },
};

/** Valeur d'un champ datetime-local (heure du navigateur) ↔ date ISO. */
const toInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromInput = (v: FormDataEntryValue | null) => (v ? new Date(String(v)).toISOString() : '');

/** Champs communs à la création et à la modification. */
function AdFields({ ad, errors }: { ad?: AdminAd; errors: Record<string, string> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Titre" error={errors.title} hint="Affiché sur la publicité (2 à 80 caractères).">
        {(p) => <Input {...p} name="title" required minLength={2} maxLength={80} defaultValue={ad?.title} />}
      </Field>
      <Field label="Annonceur" optional error={errors.advertiser} hint="Affiché avec la mention « Publicité ».">
        {(p) => <Input {...p} name="advertiser" maxLength={80} defaultValue={ad?.advertiser ?? ''} />}
      </Field>
      <Field label="Sous-titre" optional error={errors.subtitle} className="sm:col-span-2">
        {(p) => <Input {...p} name="subtitle" maxLength={140} defaultValue={ad?.subtitle ?? ''} />}
      </Field>
      <Field label="Lien" optional error={errors.linkUrl} hint="https://… (site de l’annonceur) ou chemin du site, ex. /catalogue?brand=samsung" className="sm:col-span-2">
        {(p) => <Input {...p} name="linkUrl" maxLength={500} inputMode="url" defaultValue={ad?.linkUrl ?? ''} placeholder="https://" />}
      </Field>
      <Field label="Début" optional error={errors.startsAt} hint="Vide : immédiatement.">
        {(p) => <Input {...p} name="startsAt" type="datetime-local" defaultValue={toInput(ad?.startsAt ?? null)} />}
      </Field>
      <Field label="Fin" optional error={errors.endsAt} hint="Vide : sans fin.">
        {(p) => <Input {...p} name="endsAt" type="datetime-local" defaultValue={toInput(ad?.endsAt ?? null)} />}
      </Field>
      <Field label="Ordre d’affichage" error={errors.sortOrder} hint="Les plus petits nombres passent en premier.">
        {(p) => <Input {...p} name="sortOrder" type="number" min={0} max={999} defaultValue={ad?.sortOrder ?? 0} />}
      </Field>
    </div>
  );
}

function readFields(form: HTMLFormElement) {
  const fd = new FormData(form);
  return {
    title: String(fd.get('title') ?? '').trim(),
    subtitle: String(fd.get('subtitle') ?? '').trim(),
    advertiser: String(fd.get('advertiser') ?? '').trim(),
    linkUrl: String(fd.get('linkUrl') ?? '').trim(),
    startsAt: fromInput(fd.get('startsAt')),
    endsAt: fromInput(fd.get('endsAt')),
    sortOrder: String(fd.get('sortOrder') ?? '0'),
  };
}

function CreateAd({ onCreated }: { onCreated: () => Promise<void> }) {
  const { notify } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const pick = (f: File | null) => {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) {
      setError('Ajoutez une image (1920 × 1080 recommandé, 1200 px de large au minimum).');
      return;
    }
    const fd = new FormData();
    for (const [k, v] of Object.entries(readFields(e.currentTarget))) if (v !== '') fd.append(k, v);
    fd.append('file', file);
    setBusy(true);
    setErrors({});
    setError(undefined);
    try {
      await api('/admin/ads', { body: fd });
      notify('Publicité créée');
      formRef.current?.reset();
      pick(null);
      await onCreated();
    } catch (err) {
      if (err instanceof ClientApiError) setErrors(err.errors);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-4 rounded-card border border-line bg-surface p-4" noValidate>
      <h2 className="display text-2xl">Nouvelle publicité</h2>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <label className="relative flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-line-2 bg-paper-2 text-center text-sm text-muted hover:border-navy">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Aperçu de l’image" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-2 p-4">
              <ImagePlus className="size-7" aria-hidden />
              Choisir l’image
              <span className="text-xs">JPEG, PNG, WebP · 1920 × 1080 recommandé · 8 Mo max</span>
            </span>
          )}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} aria-label="Image de la publicité" />
        </label>
        <AdFields errors={errors} />
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" loading={busy}>
        Publier la publicité
      </Button>
    </form>
  );
}

function AdRow({ ad, reload }: { ad: AdminAd; reload: () => Promise<void> }) {
  const { notify } = useSession();
  const decide = useDecision();
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      notify(msg);
      await reload();
      return true;
    } catch (e) {
      if (e instanceof ClientApiError) setErrors(e.errors);
      notify(errorMessage(e), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = readFields(e.currentTarget);
    const body = {
      title: f.title,
      subtitle: f.subtitle,
      advertiser: f.advertiser,
      linkUrl: f.linkUrl,
      startsAt: f.startsAt || null,
      endsAt: f.endsAt || null,
      sortOrder: Number(f.sortOrder || 0),
    };
    if (await run(() => api(`/admin/ads/${ad.id}`, { method: 'PATCH', body }), 'Publicité modifiée')) setEditing(false);
  };

  const replaceImage = (file: File | undefined) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    void run(() => api(`/admin/ads/${ad.id}/image`, { body: fd }), 'Image remplacée');
  };

  const s = STATUS[ad.status];
  const href = ad.linkUrl ? (ad.linkUrl.startsWith('/') ? siteHref(ad.linkUrl) : ad.linkUrl) : null;
  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ad.mobileImageUrl} alt="" className="aspect-video w-full shrink-0 rounded-lg object-cover sm:w-48" loading="lazy" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={s.tone}>{s.label}</Badge>
            <span className="text-xs text-muted">Ordre {ad.sortOrder}</span>
          </div>
          <p className="font-semibold">{ad.title}</p>
          {ad.subtitle && <p className="text-sm text-muted">{ad.subtitle}</p>}
          <p className="text-xs text-muted">
            {ad.advertiser ? `Annonceur : ${ad.advertiser} · ` : ''}
            {ad.startsAt ? `du ${formatDateTime(ad.startsAt)} ` : 'dès maintenant '}
            {ad.endsAt ? `au ${formatDateTime(ad.endsAt)}` : 'sans fin'}
          </p>
          {href && (
            <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
              {ad.linkUrl} <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => api(`/admin/ads/${ad.id}`, { method: 'PATCH', body: { isActive: !ad.isActive } }), ad.isActive ? 'Publicité désactivée' : 'Publicité activée')}>
          {ad.isActive ? 'Désactiver' : 'Activer'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
          Modifier
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => imageInput.current?.click()}>
          Remplacer l’image
        </Button>
        <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => replaceImage(e.target.files?.[0])} />
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            const d = await decide({ title: `Supprimer « ${ad.title} » ?`, description: 'La publicité disparaît de l’accueil et son image est supprimée.', confirmLabel: 'Supprimer', danger: true, reason: 'none' });
            if (d) await run(() => api(`/admin/ads/${ad.id}`, { method: 'DELETE' }), 'Publicité supprimée');
          }}
        >
          Supprimer
        </Button>
      </div>
      {editing && (
        <form onSubmit={save} className="space-y-3 rounded-xl bg-paper-2 p-3" noValidate>
          <AdFields ad={ad} errors={errors} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={busy}>Enregistrer</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Annuler</Button>
          </div>
        </form>
      )}
    </li>
  );
}

export default function AdsAdmin() {
  const { data, error, reload } = useApi<AdminAd[]>('/admin/ads');
  const live = data?.filter((a) => a.status === 'ACTIVE').length ?? 0;
  return (
    <>
      <h1 className="display text-[30px] sm:text-[38px]">Publicités</h1>
      <p className="text-sm text-muted">
        Les publicités en ligne défilent en fond de la page d’accueil (6 au maximum, dans l’ordre choisi), avec la mention « Publicité ». Sans publicité en ligne, l’accueil affiche les promotions en cours des boutiques.
      </p>
      <CreateAd onCreated={reload} />
      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="display text-2xl">
          Publicités <span className="text-base font-normal text-muted">({live} en ligne)</span>
        </h2>
        {error && <Alert tone="danger">{error}</Alert>}
        {!data ? (
          <Skeleton className="mt-3 h-40" />
        ) : data.length === 0 ? (
          <EmptyState icon={<Megaphone className="size-6" />} title="Aucune publicité">Créez la première ci-dessus.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {data.map((ad) => (
              <AdRow key={ad.id} ad={ad} reload={reload} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
