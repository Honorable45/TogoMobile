'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { api, ClientApiError, errorMessage } from '@/lib/api-client';
import { brand } from '@/config/brand';
import type { Me } from '@/lib/types';
import { Button } from './ui/button';
import { Field, Input } from './ui/field';
import { Alert } from './ui/misc';
import { PageBanner } from './layout/page-banner';

/** N'accepte que des redirections internes (évite les redirections ouvertes). */
export function safeNext(next: string | null, fallback = '/') {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <PageBanner title={title} subtitle={subtitle} />
      <div className="container-page flex justify-center py-10 md:py-14">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">{children}</div>
          {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
        </div>
      </div>
    </>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className="pr-11" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-1 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-ink"
        aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function redirectAfterAuth(me: Me, next: string | null) {
  if (next) return safeNext(next);
  // L'administration est une application distincte (son propre domaine, donc sa propre connexion).
  if (me.role === 'ADMIN') return brand.adminUrl;
  if (me.role === 'SELLER') return '/vendeur';
  return '/';
}

export function LoginForm() {
  const params = useSearchParams();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const next = params.get('next');

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    setError(undefined);
    try {
      const me = await api<Me>('/auth/login', { body: { identifier: fd.get('identifier'), password: fd.get('password') } });
      // Navigation complète : le cache du routeur peut contenir des redirections obtenues hors connexion.
      window.location.assign(redirectAfterAuth(me, next));
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Connexion"
      subtitle="Accédez à vos favoris, à vos avis et à votre espace vendeur."
      footer={
        <>
          Pas encore de compte ?{' '}
          <Link href={`/inscription${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-brand-600 underline underline-offset-4">
            Créer un compte
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="E-mail ou numéro de téléphone">
          {(p) => <Input {...p} name="identifier" autoComplete="username" required placeholder="vous@exemple.com ou 90 12 34 56" />}
        </Field>
        <Field label="Mot de passe">{(p) => <PasswordInput {...p} name="password" autoComplete="current-password" required />}</Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" loading={loading} className="w-full" size="lg">
          Se connecter
        </Button>
        <p className="text-center text-sm">
          <Link href="/mot-de-passe-oublie" className="text-muted hover:text-ink hover:underline">
            Mot de passe oublié ?
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

export function RegisterForm() {
  const params = useSearchParams();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const next = params.get('next');

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!fd.get('terms')) {
      setErrors({ terms: 'Vous devez accepter les conditions d’utilisation.' });
      return;
    }
    setLoading(true);
    setErrors({});
    setError(undefined);
    try {
      const me = await api<Me>('/auth/register', {
        body: {
          name: fd.get('name'),
          email: fd.get('email') || undefined,
          phone: fd.get('phone') || undefined,
          password: fd.get('password'),
        },
      });
      window.location.assign(redirectAfterAuth(me, next));
    } catch (err) {
      if (err instanceof ClientApiError) setErrors(err.errors);
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Créer un compte"
      subtitle="Gratuit. Un e-mail ou un numéro de téléphone suffit."
      footer={
        <>
          Déjà inscrit ?{' '}
          <Link href={`/connexion${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-brand-600 underline underline-offset-4">
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Nom complet" error={errors.name}>
          {(p) => <Input {...p} name="name" autoComplete="name" required minLength={2} maxLength={80} />}
        </Field>
        <Field label="Adresse e-mail" error={errors.email} optional hint="Nécessaire pour récupérer votre compte en cas d’oubli du mot de passe.">
          {(p) => <Input {...p} name="email" type="email" autoComplete="email" inputMode="email" />}
        </Field>
        <Field label="Numéro de téléphone" error={errors.phone} optional hint="Format togolais (90 12 34 56) ou international (+228…).">
          {(p) => <Input {...p} name="phone" type="tel" autoComplete="tel" inputMode="tel" />}
        </Field>
        <Field label="Mot de passe" error={errors.password} hint="8 caractères minimum, dont une lettre et un chiffre.">
          {(p) => <PasswordInput {...p} name="password" autoComplete="new-password" required minLength={8} />}
        </Field>
        <div>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="terms" className="mt-0.5 size-4 accent-navy" />
            <span>
              J’accepte les{' '}
              <Link href="/conditions" className="font-medium text-brand-600 underline" target="_blank">conditions d’utilisation</Link> et la{' '}
              <Link href="/confidentialite" className="font-medium text-brand-600 underline" target="_blank">politique de confidentialité</Link>.
            </span>
          </label>
          {errors.terms && <p className="mt-1 text-sm text-danger" role="alert">{errors.terms}</p>}
        </div>
        {error && !Object.keys(errors).length && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" loading={loading} className="w-full" size="lg">
          Créer mon compte
        </Button>
      </form>
    </AuthCard>
  );
}

export function ForgotForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  return (
    <AuthCard title="Mot de passe oublié" subtitle="Indiquez l’adresse e-mail de votre compte : nous vous enverrons un lien de réinitialisation valable une heure." footer={<Link href="/connexion" className="hover:underline">Retour à la connexion</Link>}>
      {done ? (
        <Alert tone="success" title="Demande enregistrée">
          Si un compte correspond à cette adresse, vous allez recevoir un e-mail. Pensez à vérifier vos courriers indésirables. Compte créé avec un numéro de téléphone uniquement ? Contactez le support depuis la page Contact.
        </Alert>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setError(undefined);
            try {
              await api('/auth/password/forgot', { body: { email: new FormData(e.currentTarget).get('email') } });
              setDone(true);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setLoading(false);
            }
          }}
        >
          <Field label="Adresse e-mail">{(p) => <Input {...p} name="email" type="email" required autoComplete="email" />}</Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" loading={loading} className="w-full" size="lg">
            Envoyer le lien
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  return (
    <AuthCard title="Nouveau mot de passe">
      {done ? (
        <Alert tone="success" title="Mot de passe modifié">
          Vous pouvez maintenant <Link href="/connexion" className="font-semibold underline">vous connecter</Link>. Vos autres sessions ont été fermées par sécurité.
        </Alert>
      ) : !token ? (
        <Alert tone="danger">Lien incomplet. Ouvrez le lien reçu par e-mail ou faites une nouvelle demande.</Alert>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            if (fd.get('password') !== fd.get('confirm')) return setError('Les deux mots de passe ne correspondent pas.');
            setLoading(true);
            setError(undefined);
            try {
              await api('/auth/password/reset', { body: { token, password: fd.get('password') } });
              setDone(true);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setLoading(false);
            }
          }}
        >
          <Field label="Nouveau mot de passe" hint="8 caractères minimum, dont une lettre et un chiffre.">
            {(p) => <PasswordInput {...p} name="password" autoComplete="new-password" required />}
          </Field>
          <Field label="Confirmez le mot de passe">{(p) => <PasswordInput {...p} name="confirm" autoComplete="new-password" required />}</Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" loading={loading} className="w-full" size="lg">
            Enregistrer
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
