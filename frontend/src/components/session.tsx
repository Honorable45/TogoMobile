'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ClientApiError, errorMessage } from '@/lib/api-client';
import type { Me } from '@/lib/types';

interface SessionValue {
  user: Me | null;
  loading: boolean;
  refresh: () => Promise<Me | null>;
  logout: () => Promise<void>;
  favoriteProducts: Set<string>;
  favoriteShops: Set<string>;
  toggleProduct: (id: string) => Promise<boolean>;
  toggleShop: (id: string) => Promise<boolean>;
  notify: (message: string, tone?: 'info' | 'error') => void;
}

const Ctx = createContext<SessionValue | null>(null);

/**
 * État de session côté navigateur. Les pages publiques restent mises en cache côté serveur ;
 * seules les informations propres à l'utilisateur (compte, favoris) sont chargées ici.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [favoriteProducts, setFavProducts] = useState<Set<string>>(new Set());
  const [favoriteShops, setFavShops] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'error'; id: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = useCallback((message: string, tone: 'info' | 'error' = 'info') => {
    clearTimeout(toastTimer.current);
    setToast({ message, tone, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const loadFavorites = useCallback(async () => {
    try {
      const ids = await api<{ products: string[]; shops: string[] }>('/me/favorites/ids');
      setFavProducts(new Set(ids.products));
      setFavShops(new Set(ids.shops));
    } catch {
      /* non bloquant */
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api<Me>('/auth/me');
      setUser(me);
      void loadFavorites();
      return me;
    } catch (e) {
      if (e instanceof ClientApiError && e.status === 401) {
        setUser(null);
        setFavProducts(new Set());
        setFavShops(new Set());
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadFavorites]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    setFavProducts(new Set());
    setFavShops(new Set());
  }, []);

  const toggle = useCallback(
    async (kind: 'products' | 'shops', id: string, current: Set<string>, set: (s: Set<string>) => void) => {
      const was = current.has(id);
      const next = new Set(current);
      if (was) next.delete(id);
      else next.add(id);
      set(next); // mise à jour optimiste
      try {
        await api(`/me/favorites/${kind}/${id}`, { method: was ? 'DELETE' : 'PUT' });
        notify(
          kind === 'products'
            ? was ? 'Retiré de vos favoris' : 'Ajouté à vos favoris'
            : was ? 'Vous ne suivez plus cette boutique' : 'Boutique ajoutée à vos favoris',
        );
        return !was;
      } catch (e) {
        set(current);
        notify(errorMessage(e), 'error');
        return was;
      }
    },
    [notify],
  );

  const value = useMemo<SessionValue>(
    () => ({
      user,
      loading,
      refresh,
      logout,
      favoriteProducts,
      favoriteShops,
      toggleProduct: (id) => toggle('products', id, favoriteProducts, setFavProducts),
      toggleShop: (id) => toggle('shops', id, favoriteShops, setFavShops),
      notify,
    }),
    [user, loading, refresh, logout, favoriteProducts, favoriteShops, toggle, notify],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 sm:bottom-6">
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
