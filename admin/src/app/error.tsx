'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/components/error-reporter';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError(error.message, { stack: error.stack, digest: error.digest }), [error]);
  return (
    <main className="container-page flex min-h-[70vh] flex-col items-center justify-center text-center">
      <h1 className="display text-[40px]">Un problème est survenu</h1>
      <p className="mt-2 max-w-md text-muted">Le service est momentanément indisponible. Réessayez dans quelques instants.</p>
      <button type="button" onClick={reset} className="glass-dark mt-8 inline-flex h-11 items-center rounded-full px-5 font-medium text-white">
        Réessayer
      </button>
    </main>
  );
}
