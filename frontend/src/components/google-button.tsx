'use client';

import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/api-client';
import { brand } from '@/config/brand';
import type { Me } from '@/lib/types';
import { Alert } from './ui/misc';

/** Types minimaux de Google Identity Services (https://accounts.google.com/gsi/client). */
interface GoogleId {
  initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup'; context?: string; use_fedcm_for_button?: boolean }): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise: Promise<void> | null = null;
function loadScript() {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Google indisponible'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Bouton officiel « Continuer avec Google ». Google renvoie un jeton d'identité signé,
 * vérifié par l'API qui ouvre la session habituelle (cookie httpOnly).
 * Masqué tant que NEXT_PUBLIC_GOOGLE_CLIENT_ID n'est pas renseigné.
 */
export function GoogleButton({ context, onSuccess }: { context: 'signin' | 'signup'; onSuccess: (me: Me) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const done = useRef(onSuccess);
  done.current = onSuccess;

  useEffect(() => {
    if (!brand.googleClientId) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        const el = box.current;
        const gid = window.google?.accounts.id;
        if (cancelled || !el || !gid) return;
        gid.initialize({
          client_id: brand.googleClientId,
          ux_mode: 'popup',
          context,
          use_fedcm_for_button: true,
          callback: async ({ credential }) => {
            setBusy(true);
            setError(undefined);
            try {
              done.current(await api<Me>('/auth/google', { body: { credential } }));
            } catch (e) {
              setError(errorMessage(e));
              setBusy(false);
            }
          },
        });
        gid.renderButton(el, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: context === 'signup' ? 'signup_with' : 'continue_with',
          logo_alignment: 'center',
          locale: 'fr',
          width: Math.min(400, Math.max(200, el.offsetWidth)),
        });
      })
      .catch(() => !cancelled && setError('Impossible de charger la connexion Google. Vérifiez votre connexion internet.'));
    return () => {
      cancelled = true;
    };
  }, [context]);

  if (!brand.googleClientId) return null;
  return (
    <div className="space-y-3">
      <div ref={box} className={`flex min-h-11 justify-center ${busy ? 'pointer-events-none opacity-60' : ''}`} aria-busy={busy || undefined} />
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-faint" aria-hidden>
        <span className="h-px flex-1 bg-line" /> ou <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
