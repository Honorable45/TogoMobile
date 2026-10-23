'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, QrCode, Star } from 'lucide-react';
import { PageBanner } from '@/components/layout/page-banner';
import { useSession } from '@/components/session';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Alert, Card, Skeleton } from '@/components/ui/misc';
import { api, ClientApiError, errorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/format';

const STORE_KEY = 'tm_review_token';

type Check =
  | { state: 'VALID'; expiresAt: string; soldAt: string; product: { title: string; slug: string; reference: string; imageUrl: string | null }; shop: { name: string; slug: string; logoUrl: string | null } }
  | { state: 'INVALID' | 'EXPIRED' | 'USED' | 'REVOKED'; message: string };

const RATING_WORDS = ['', 'Très décevant', 'Décevant', 'Correct', 'Bien', 'Excellent'];

function readToken(): string | null {
  // Le jeton est dans le fragment (#…) : il n'est jamais envoyé aux serveurs dans l'URL.
  const fromHash = window.location.hash.replace(/^#/, '').trim();
  if (fromHash) {
    try {
      sessionStorage.setItem(STORE_KEY, fromHash);
    } catch {
      /* ignore */
    }
    // On retire le jeton de la barre d'adresse (captures d'écran, partage accidentel).
    window.history.replaceState(null, '', window.location.pathname);
    return fromHash;
  }
  try {
    return sessionStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

export default function ReviewPage() {
  const { user, loading: sessionLoading } = useSession();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [check, setCheck] = useState<Check | null>(null);
  const [checkError, setCheckError] = useState<string>();
  const [rating, setRating] = useState(0);
  const [submit, setSubmit] = useState<{ loading?: boolean; error?: string; errors?: Record<string, string>; done?: string; locked?: boolean }>({});

  useEffect(() => {
    const load = () => {
      const t = readToken();
      setToken(t);
      setCheck(null);
      setCheckError(undefined);
      setSubmit({});
      if (!t) return;
      api<Check>('/review-tokens/check', { body: { token: t } })
        .then(setCheck)
        .catch((e) => setCheckError(errorMessage(e)));
    };
    load();
    // Nouveau code scanné alors que la page est déjà ouverte : seul le fragment change.
    const onHash = () => window.location.hash && load();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!rating) return setSubmit({ errors: { rating: 'Choisissez une note de 1 à 5 étoiles.' } });
    const fd = new FormData(e.currentTarget);
    setSubmit({ loading: true });
    try {
      const r = await api<{ message: string }>('/review-tokens/submit', {
        body: { token, buyerPhone: fd.get('buyerPhone'), rating, comment: String(fd.get('comment') ?? '').trim() || null },
      });
      try {
        sessionStorage.removeItem(STORE_KEY);
      } catch {
        /* ignore */
      }
      setSubmit({ done: r.message });
    } catch (err) {
      const ce = err instanceof ClientApiError ? err : null;
      setSubmit({ error: errorMessage(err), errors: ce?.errors, locked: ce?.status === 410 || ce?.code === 'TOKEN_LOCKED' });
    }
  };

  const wrap = (children: React.ReactNode) => (
    <>
      <PageBanner eyebrow="Avis vérifié" title="Votre avis" subtitle="Notez votre achat en quelques secondes." />
      <div className="container-page flex justify-center py-10 md:py-14">
        <div className="w-full max-w-lg space-y-4">{children}</div>
      </div>
    </>
  );

  if (token === undefined || (token && !check && !checkError)) {
    return wrap(<><Skeleton className="h-8 w-56" /><Skeleton className="h-72" /></>);
  }

  if (!token) {
    return wrap(
      <Card className="rounded-3xl p-8 text-center">
        <QrCode className="mx-auto size-10 text-subtle" aria-hidden />
        <h2 className="display mt-3 text-2xl">Donner votre avis</h2>
        <p className="mt-2 text-sm text-muted">
          Pour noter un téléphone, scannez le QR code remis par le vendeur au moment de l’achat (sur son téléphone ou sur votre reçu), avec l’appareil photo de votre smartphone.
        </p>
      </Card>,
    );
  }

  if (checkError) return wrap(<Alert tone="danger" title="Vérification impossible">{checkError}</Alert>);

  if (check && check.state !== 'VALID') {
    const titles = { INVALID: 'Code non reconnu', EXPIRED: 'Code expiré', USED: 'Avis déjà déposé', REVOKED: 'Code désactivé' };
    return wrap(
      <>
        <Alert tone="warn" title={titles[check.state]}>{check.message}</Alert>
        <ButtonLink href="/" variant="outline">Retour à l’accueil</ButtonLink>
      </>,
    );
  }

  const c = check as Extract<Check, { state: 'VALID' }>;

  if (submit.done) {
    return wrap(
      <Card className="rounded-3xl p-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-brand-600" aria-hidden />
        <h2 className="display mt-3 text-2xl">Merci pour votre avis</h2>
        <p className="mt-2 text-sm text-muted">{submit.done}</p>
        <ButtonLink href={`/produits/${c.product.slug}`} className="mt-5">Voir l’annonce</ButtonLink>
      </Card>,
    );
  }

  return wrap(
    <>
      <Card className="flex items-center gap-3 p-4">
        {c.product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.product.imageUrl} alt="" className="size-16 rounded-lg object-cover" />
        ) : null}
        <div className="min-w-0">
          <p className="font-bold">{c.product.title}</p>
          <p className="text-sm text-muted">
            Acheté chez {c.shop.name} · {formatDate(c.soldAt)}
          </p>
        </div>
      </Card>

      {sessionLoading ? (
        <Skeleton className="h-40" />
      ) : !user ? (
        <Card className="rounded-3xl p-6">
          <p className="font-semibold">Connectez-vous pour publier votre avis</p>
          <p className="mt-1 text-sm text-muted">Votre code reste valable : vous reviendrez automatiquement sur cette page.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href="/inscription?next=/avis">Créer un compte</ButtonLink>
            <ButtonLink href="/connexion?next=/avis" variant="outline">Se connecter</ButtonLink>
          </div>
        </Card>
      ) : (
        <Card className="rounded-3xl p-6">
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <Field
              label="Votre numéro de téléphone"
              error={submit.errors?.buyerPhone}
              hint="Le numéro que vous avez donné au vendeur lors de l’achat. Il sert uniquement à confirmer que vous êtes bien l’acheteur et n’est pas publié."
            >
              {(p) => <Input {...p} name="buyerPhone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="90 12 34 56" />}
            </Field>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Votre note</legend>
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Note sur 5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="cursor-pointer">
                    <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="peer sr-only" aria-label={`${n} étoile${n > 1 ? 's' : ''} — ${RATING_WORDS[n]}`} />
                    <Star className={`size-11 rounded p-1 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 ${n <= rating ? 'fill-star text-star' : 'text-line-2'}`} aria-hidden />
                  </label>
                ))}
                <span className="ml-2 text-sm font-semibold text-muted" aria-live="polite">{RATING_WORDS[rating]}</span>
              </div>
              {submit.errors?.rating && <p className="mt-1 text-sm text-danger" role="alert">{submit.errors.rating}</p>}
            </fieldset>

            <Field label="Votre commentaire" optional error={submit.errors?.comment} hint="10 à 1 000 caractères. Décrivez l’appareil et le service ; n’indiquez pas de numéro de téléphone ni de lien.">
              {(p) => <Textarea {...p} name="comment" rows={4} maxLength={1000} />}
            </Field>

            {submit.error && !submit.errors?.comment && <Alert tone="danger">{submit.error}</Alert>}
            {submit.locked ? (
              <ButtonLink href="/" variant="outline">Retour à l’accueil</ButtonLink>
            ) : (
              <Button type="submit" size="lg" loading={submit.loading} className="w-full">
                Publier mon avis
              </Button>
            )}
            <p className="text-xs text-muted">
              Votre prénom et l’initiale de votre nom seront affichés. Voir la <Link href="/moderation" className="underline">politique de modération</Link>.
            </p>
          </form>
        </Card>
      )}
    </>,
  );
}
