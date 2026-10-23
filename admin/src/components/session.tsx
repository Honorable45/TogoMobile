'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ClientApiError } from '@/lib/api-client';
import type { Me } from '@/lib/types';

interface SessionValue {
  user: Me | null;
  loading: boolean;
  refresh: () => Promise<Me | null>;
  logout: () => Promise<void>;
  notify: (message: string, tone?: 'info' | 'error') => void;
}

const Ctx = createContext<SessionValue | null>(null);

/** Session de l'administrateur côté navigateur. Les droits sont toujours vérifiés par l'API. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'error'; id: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = useCallback((message: string, tone: 'info' | 'error' = 'info') => {
    clearTimeout(toastTimer.current);
    setToast({ message, tone, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api<Me>('/auth/me');
      setUser(me);
      return me;
    } catch (e) {
      if (e instanceof ClientApiError && e.status === 401) setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
  }, []);

  const value = useMemo<SessionValue>(() => ({ user, loading, refresh, logout, notify }), [user, loading, refresh, logout, notify]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {toast && (
          <div
            key={toast.id}
            className={`pointer-events-auto animate-slide-up rounded-full px-5 py-3 text-sm font-medium text-white shadow-pop ${toast.tone === 'error' ? 'bg-danger' : 'glass-dark'}`}
          >
            {toast.message}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession doit être utilisé dans SessionProvider');
  return v;
}

export function loginHref(next?: string) {
  const target = next ?? (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/');
  return `/connexion?next=${encodeURIComponent(target)}`;
}
