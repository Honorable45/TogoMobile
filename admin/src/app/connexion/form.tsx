'use client';

import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { LogoMark } from '@/components/layout/logo';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/misc';
import { brand, siteHref } from '@/config/brand';
import { api, errorMessage } from '@/lib/api-client';
import type { Me } from '@/lib/types';

/** N'accepte que des redirections internes (évite les redirections ouvertes). */
function safeNext(next: string | null) {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || next.startsWith('/connexion')) return '/';
  return next;
}

const DENIED = 'Ce compte n’a pas accès à l’administration.';

export function AdminLoginForm() {
  const params = useSearchParams();
  const [error, setError] = useState<string | undefined>(params.get('acces') === 'refuse' ? DENIED : undefined);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    setError(undefined);
    try {
      const me = await api<Me>('/auth/login', { body: { identifier: fd.get('identifier'), password: fd.get('password') } });
      if (me.role !== 'ADMIN') {
        // Aucune session non administrateur n'est conservée sur ce domaine.
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        setError(DENIED);
        setLoading(false);
        return;
      }
      window.location.assign(safeNext(params.get('next')));
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 flex items-center justify-center gap-2">
        <LogoMark />
        <span className="display text-[24px]">{brand.name}</span>
      </div>
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <h1 className="display text-[30px]">Administration</h1>
        <p className="mt-1 text-sm text-muted">Accès réservé aux administrateurs de la plateforme.</p>
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <Field label="E-mail ou numéro de téléphone">
            {(p) => <Input {...p} name="identifier" autoComplete="username" required />}
          </Field>
          <Field label="Mot de passe">{(p) => <Input {...p} name="password" type="password" autoComplete="current-password" required />}</Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" loading={loading} className="w-full" size="lg">
            Se connecter
          </Button>
        </form>
      </div>
      <p className="mt-5 text-center text-sm text-muted">
        <a href={siteHref('/mot-de-passe-oublie')} className="hover:text-ink hover:underline">Mot de passe oublié ?</a>
      </p>
    </div>
  );
}
