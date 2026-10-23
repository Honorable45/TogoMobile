'use client';

/**
 * Appels à l'API depuis le navigateur. Toujours via /api/v1 sur le domaine du site
 * (relais Next.js) : le cookie de session httpOnly est envoyé automatiquement.
 */
export class ClientApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors: Record<string, string> = {},
    public code?: string,
  ) {
    super(message);
  }
}

type Body = Record<string, unknown> | FormData | undefined;

export async function api<T = unknown>(path: string, opts: { method?: string; body?: Body; signal?: AbortSignal } = {}): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      credentials: 'same-origin',
      headers: isForm ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: isForm ? (opts.body as FormData) : opts.body ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      cache: 'no-store',
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ClientApiError(0, 'Connexion impossible. Vérifiez votre accès à Internet puis réessayez.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      res.status === 413
        ? 'Fichier trop volumineux.'
        : res.status === 429 && !data.message
          ? 'Trop de tentatives. Patientez une minute puis réessayez.'
          : (data.message ?? 'Une erreur est survenue. Veuillez réessayer.');
    throw new ClientApiError(res.status, message, data.errors ?? {}, data.code);
  }
  return data as T;
}

export function errorMessage(e: unknown) {
  if (e instanceof ClientApiError) return e.message;
  return 'Une erreur est survenue. Veuillez réessayer.';
}
