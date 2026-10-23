'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loginHref, useSession } from '@/components/session';
import { api, ClientApiError, errorMessage } from './api-client';
import type { Role } from './types';

/** Exige une session (et éventuellement un rôle) côté interface ; l'API reste seule juge des droits. */
export function useRequireUser(role?: Role) {
  const { user, loading } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(loginHref());
    else if (role && user.role !== role) router.replace('/');
  }, [user, loading, role, router]);
  return { user, ready: !loading && !!user && (!role || user.role === role) };
}

/** Chargement de données via l'API avec états de chargement et d'erreur. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(!!path);
  const ctrl = useRef<AbortController>(undefined);

  const load = useCallback(async () => {
    if (!path) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    setError(null);
    try {
      const d = await api<T>(path, { signal: c.signal });
      setData(d);
      setStatus(200);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError(errorMessage(e));
      setStatus(e instanceof ClientApiError ? e.status : 0);
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
    return () => ctrl.current?.abort();
  }, [load]);

  return { data, error, status, loading, reload: load, setData };
}
