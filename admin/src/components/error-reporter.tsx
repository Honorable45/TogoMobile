'use client';

import { useEffect } from 'react';

/** Remonte les erreurs JavaScript non interceptées (au plus 5 par page, sans données de formulaire). */
export function reportClientError(message: string, extra: { stack?: string; digest?: string } = {}) {
  try {
    const body = JSON.stringify({ message: message.slice(0, 500), url: window.location.pathname, stack: extra.stack?.slice(0, 2000), digest: extra.digest });
    navigator.sendBeacon?.('/api/v1/client-errors', new Blob([body], { type: 'application/json' })) ||
      void fetch('/api/v1/client-errors', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
  } catch {
    // La remontée d'erreur ne doit jamais provoquer d'erreur elle-même.
  }
}

export function ErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const onError = (e: ErrorEvent) => sent++ < 5 && reportClientError(e.message || 'Erreur', { stack: e.error?.stack });
    const onRejection = (e: PromiseRejectionEvent) => sent++ < 5 && reportClientError(String(e.reason?.message ?? e.reason ?? 'Promesse rejetée'), { stack: e.reason?.stack });
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
