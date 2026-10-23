'use client';

import { useState, type FormEvent } from 'react';
import { LogOut, MonitorSmartphone } from 'lucide-react';
import { PageBanner } from '@/components/layout/page-banner';
import { useSession } from '@/components/session';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Alert, Card, Skeleton } from '@/components/ui/misc';
import { api, ClientApiError, errorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useApi, useRequireUser } from '@/lib/hooks';

interface SessionRow {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

function device(ua: string | null) {
  if (!ua) return 'Appareil inconnu';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone / iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Autre';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
  return `${browser} sur ${os}`;
}

export default function AccountPage() {
  const { ready } = useRequireUser();
  const { user, refresh, logout } = useSession();
  const sessions = useApi<SessionRow[]>(ready ? '/auth/sessions' : null);
  const [profile, setProfile] = useState<{ loading?: boolean; ok?: boolean; error?: string; errors?: Record<string, string> }>({});
  const [pwd, setPwd] = useState<{ loading?: boolean; ok?: boolean; error?: string }>({});

  if (!ready || !user) {
    return (
      <div className="container-page max-w-3xl space-y-4 pb-8 pt-40">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const saveProfile = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setProfile({ loading: true });
    try {
      await api('/auth/me', { method: 'PATCH', body: { name: fd.get('name'), email: fd.get('email') || undefined, phone: fd.get('phone') || undefined } });
      await refresh();
      setProfile({ ok: true });
    } catch (err) {
      setProfile({ error: errorMessage(err), errors: err instanceof ClientApiError ? err.errors : {} });
    }
  };

  const changePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (fd.get('newPassword') !== fd.get('confirm')) return setPwd({ error: 'Les deux nouveaux mots de passe ne correspondent pas.' });
    setPwd({ loading: true });
    try {
      await api('/auth/password/change', { body: { currentPassword: fd.get('currentPassword'), newPassword: fd.get('newPassword') } });
      form.reset();
      setPwd({ ok: true });
      void sessions.reload();
    } catch (err) {
      setPwd({ error: errorMessage(err) });
    }
  };

  return (
    <>
    <PageBanner title="Mon compte" subtitle={user.email ?? user.phone ?? undefined} />
    <div className="container-page max-w-3xl space-y-6 py-10 md:py-14">

      <Card className="rounded-3xl p-6 sm:p-8">
        <h2 className="display mb-5 text-2xl">Informations personnelles</h2>
        <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom complet" error={profile.errors?.name} className="sm:col-span-2">
            {(p) => <Input {...p} name="name" defaultValue={user.name} required />}
          </Field>
          <Field label="E-mail" error={profile.errors?.email} optional>
            {(p) => <Input {...p} name="email" type="email" defaultValue={user.email ?? ''} />}
          </Field>
          <Field label="Téléphone" error={profile.errors?.phone} optional>
            {(p) => <Input {...p} name="phone" type="tel" defaultValue={user.phone ?? ''} />}
          </Field>
          <div className="space-y-3 sm:col-span-2">
            {profile.ok && <Alert tone="success">Informations enregistrées.</Alert>}
            {profile.error && !Object.keys(profile.errors ?? {}).length && <Alert tone="danger">{profile.error}</Alert>}
            <Button type="submit" loading={profile.loading}>Enregistrer</Button>
          </div>
        </form>
      </Card>

      <Card className="rounded-3xl p-6 sm:p-8">
        <h2 className="display mb-5 text-2xl">Mot de passe</h2>
        <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-2">
          <Field label="Mot de passe actuel" className="sm:col-span-2">
            {(p) => <Input {...p} name="currentPassword" type="password" autoComplete="current-password" required />}
          </Field>
          <Field label="Nouveau mot de passe" hint="8 caractères minimum, dont une lettre et un chiffre.">
            {(p) => <Input {...p} name="newPassword" type="password" autoComplete="new-password" required />}
          </Field>
          <Field label="Confirmation">{(p) => <Input {...p} name="confirm" type="password" autoComplete="new-password" required />}</Field>
          <div className="space-y-3 sm:col-span-2">
            {pwd.ok && <Alert tone="success">Mot de passe modifié. Vos autres appareils ont été déconnectés.</Alert>}
            {pwd.error && <Alert tone="danger">{pwd.error}</Alert>}
            <Button type="submit" loading={pwd.loading}>Changer le mot de passe</Button>
          </div>
        </form>
      </Card>

      <Card className="rounded-3xl p-6 sm:p-8">
        <h2 className="display mb-2 text-2xl">Appareils connectés</h2>
        <p className="mb-4 text-sm text-muted">Déconnectez un appareil que vous ne reconnaissez pas, puis changez votre mot de passe.</p>
        {sessions.error && <Alert tone="danger">{sessions.error}</Alert>}
        <ul className="divide-y divide-line">
          {sessions.data?.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              <MonitorSmartphone className="size-5 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">
                  {device(s.userAgent)} {s.current && <span className="font-normal text-brand-700">· cet appareil</span>}
                </p>
                <p className="text-xs text-muted">Dernière activité : {formatDateTime(s.lastUsedAt)}</p>
              </div>
              {!s.current && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await api(`/auth/sessions/${s.id}`, { method: 'DELETE' });
                    void sessions.reload();
                  }}
                >
                  Déconnecter
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Button
        variant="ghost"
        onClick={async () => {
          await logout();
          window.location.href = '/';
        }}
      >
        <LogOut className="size-4" aria-hidden /> Se déconnecter
      </Button>
    </div>
    </>
  );
}
