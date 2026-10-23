'use client';

import { useState, type FormEvent } from 'react';
import { api, ClientApiError, errorMessage } from '@/lib/api-client';
import { Button } from '../ui/button';
import { Field, Input, Select, Textarea } from '../ui/field';
import { Alert } from '../ui/misc';

export const TOGO_CITIES = ['Lomé', 'Kara', 'Sokodé', 'Atakpamé', 'Kpalimé', 'Tsévié', 'Aného', 'Dapaong', 'Bassar', 'Mango', 'Notsé', 'Tabligbo', 'Vogan', 'Badou', 'Sotouboua'];

export interface ShopFormValues {
  name: string;
  description?: string | null;
  city: string;
  district?: string | null;
  address?: string | null;
  whatsapp: string;
  phone?: string | null;
  openingHours?: string | null;
  socialLinks?: Partial<Record<'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'website', string>>;
}

const SOCIAL_FIELDS = [
  { key: 'facebook', label: 'Facebook', placeholder: 'https://www.facebook.com/maboutique' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://www.instagram.com/maboutique' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://www.tiktok.com/@maboutique' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://www.youtube.com/@maboutique' },
  { key: 'website', label: 'Site web', placeholder: 'https://…' },
] as const;

/** Formulaire de boutique : demande d'ouverture (POST) ou modification (PATCH). */
export function ShopForm({
  initial,
  mode,
  onSaved,
  sensitiveNotice,
}: {
  initial?: Partial<ShopFormValues>;
  mode: 'create' | 'update';
  onSaved: (shop: unknown) => void;
  sensitiveNotice?: boolean;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const knownCity = !initial?.city || TOGO_CITIES.includes(initial.city);
  const [city, setCity] = useState(knownCity ? (initial?.city ?? 'Lomé') : 'Autre');

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const text = (k: string) => {
      const v = String(fd.get(k) ?? '').trim();
      return v || (mode === 'update' ? null : undefined);
    };
    const social: Record<string, string | null> = {};
    for (const s of SOCIAL_FIELDS) social[s.key] = String(fd.get(`social_${s.key}`) ?? '').trim() || null;
    const body = {
      name: fd.get('name'),
      description: text('description'),
      city: city === 'Autre' ? fd.get('cityOther') : city,
      district: text('district'),
      address: text('address'),
      whatsapp: fd.get('whatsapp'),
      phone: text('phone'),
      openingHours: text('openingHours'),
      socialLinks: mode === 'create' ? Object.fromEntries(Object.entries(social).filter(([, v]) => v)) : social,
    };
    setLoading(true);
    setErrors({});
    setError(undefined);
    setSaved(false);
    try {
      const shop = await api(mode === 'create' ? '/seller/shop' : '/seller/shop', { method: mode === 'create' ? 'POST' : 'PATCH', body });
      setSaved(true);
      onSaved(shop);
    } catch (err) {
      if (err instanceof ClientApiError) setErrors(err.errors);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-base font-bold">Votre boutique</legend>
        <Field label="Nom commercial" error={errors.name} className="sm:col-span-2" hint={sensitiveNotice ? 'Un changement de nom est vérifié par l’équipe avant d’être affiché.' : undefined}>
          {(p) => <Input {...p} name="name" defaultValue={initial?.name} required maxLength={60} />}
        </Field>
        <Field label="Présentation courte" error={errors.description} optional className="sm:col-span-2" hint="Spécialités, services (réparation, déblocage…), garanties proposées. 600 caractères maximum.">
          {(p) => <Textarea {...p} name="description" defaultValue={initial?.description ?? ''} maxLength={600} rows={3} />}
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-base font-bold">Localisation</legend>
        <Field label="Ville" error={errors.city}>
          {(p) => (
            <Select {...p} value={city} onChange={(e) => setCity(e.target.value)}>
              {TOGO_CITIES.map((c) => <option key={c}>{c}</option>)}
              <option value="Autre">Autre ville…</option>
            </Select>
          )}
        </Field>
        {city === 'Autre' ? (
          <Field label="Nom de la ville">{(p) => <Input {...p} name="cityOther" defaultValue={knownCity ? '' : initial?.city} required />}</Field>
        ) : (
          <Field label="Quartier" error={errors.district} optional>{(p) => <Input {...p} name="district" defaultValue={initial?.district ?? ''} placeholder="Déckon, Bè, Adidogomé…" />}</Field>
        )}
        {city === 'Autre' && (
          <Field label="Quartier" error={errors.district} optional>{(p) => <Input {...p} name="district" defaultValue={initial?.district ?? ''} />}</Field>
        )}
        <Field label="Adresse ou repère" error={errors.address} optional className="sm:col-span-2">
          {(p) => <Input {...p} name="address" defaultValue={initial?.address ?? ''} placeholder="Ex. : face à la pharmacie…" />}
        </Field>
        <Field label="Horaires" error={errors.openingHours} optional className="sm:col-span-2">
          {(p) => <Input {...p} name="openingHours" defaultValue={initial?.openingHours ?? ''} placeholder="Lun–Sam 8 h–19 h" />}
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-base font-bold">Contact</legend>
        <Field label="Numéro WhatsApp professionnel" error={errors.whatsapp} hint={sensitiveNotice ? 'Les clients vous contacteront sur ce numéro. Un changement est vérifié par l’équipe.' : 'Les clients vous contacteront sur ce numéro.'}>
          {(p) => <Input {...p} name="whatsapp" type="tel" inputMode="tel" defaultValue={initial?.whatsapp} placeholder="+228 90 12 34 56" required />}
        </Field>
        <Field label="Téléphone fixe ou autre" error={errors.phone} optional>
          {(p) => <Input {...p} name="phone" type="tel" inputMode="tel" defaultValue={initial?.phone ?? ''} />}
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-base font-bold">Réseaux sociaux</legend>
        <p className="text-sm text-muted sm:col-span-2">Facultatif. Collez l’adresse complète de votre page (commençant par https://).</p>
        {SOCIAL_FIELDS.map((s) => (
          <Field key={s.key} label={s.label} error={errors[`socialLinks.${s.key}`]} optional>
            {(p) => <Input {...p} name={`social_${s.key}`} type="url" inputMode="url" defaultValue={initial?.socialLinks?.[s.key] ?? ''} placeholder={s.placeholder} />}
          </Field>
        ))}
      </fieldset>

      {error && <Alert tone="danger">{error}</Alert>}
      {saved && mode === 'update' && <Alert tone="success">Modifications enregistrées.</Alert>}
      <Button type="submit" size="lg" loading={loading}>
        {mode === 'create' ? 'Envoyer ma demande' : 'Enregistrer les modifications'}
      </Button>
    </form>
  );
}
