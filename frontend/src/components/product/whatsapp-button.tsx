'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api-client';
import { WhatsAppIcon } from '../ui/brand-icons';
import { useSession } from '../session';

/**
 * Ouverture de WhatsApp : le serveur vérifie que l'annonce est toujours accessible,
 * prépare le message (prix affiché à cet instant + lien de l'annonce) et renvoie le lien wa.me.
 * Le client envoie lui-même le message ; aucune commande n'est enregistrée.
 */
export function useWhatsAppOrder(productId: string) {
  const [loading, setLoading] = useState(false);
  const { notify } = useSession();

  const open = useCallback(async () => {
    setLoading(true);
    // Fenêtre ouverte immédiatement (geste utilisateur) pour éviter le blocage des fenêtres surgissantes.
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    const win = isMobile ? null : window.open('', '_blank');
    try {
      const { url } = await api<{ url: string }>(`/products/${productId}/whatsapp`, { method: 'POST' });
      // Seule destination acceptée : une conversation WhatsApp.
      if (!/^https:\/\/wa\.me\/\d+\?text=/.test(url)) throw new Error('Lien WhatsApp invalide.');
      if (win) {
        win.opener = null;
        win.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (e) {
      win?.close();
      notify(errorMessage(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [productId, notify]);

  return { open, loading };
}

export function WhatsAppOrderButton({ productId, orderable }: { productId: string; orderable: boolean }) {
  const { open, loading } = useWhatsAppOrder(productId);
  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      className={`inline-flex h-14 w-full items-center justify-center gap-2 rounded-full px-6 text-base font-medium text-white transition-[transform,background-color] duration-200 active:scale-[.98] disabled:opacity-70 ${
        orderable ? 'bg-whatsapp hover:-translate-y-0.5 hover:bg-whatsapp-hover' : 'glass-dark'
      }`}
    >
      <WhatsAppIcon className="size-5" />
      {loading ? 'Ouverture de WhatsApp…' : orderable ? 'Commander sur WhatsApp' : 'Demander la disponibilité'}
    </button>
  );
}

/** Pilule « Commander » posée sur la photo d'une carte produit. */
export function CardOrderButton({ productId, title }: { productId: string; title: string }) {
  const { open, loading } = useWhatsAppOrder(productId);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void open();
      }}
      disabled={loading}
      aria-label={`Commander ${title} sur WhatsApp`}
      className="glass-dark relative z-10 inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium text-white transition-transform duration-200 hover:-translate-y-0.5 active:scale-[.98] disabled:opacity-70"
    >
      <WhatsAppIcon className="size-4" />
      {loading ? '…' : 'Commander'}
    </button>
  );
}

/** Compte une consultation par session de navigation (les consultations ne sont pas des visiteurs uniques). */
export function ViewTracker({ productId }: { productId: string }) {
  useEffect(() => {
    const key = `tm_view_${productId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      /* stockage indisponible : on compte quand même */
    }
    void fetch(`/api/v1/products/${productId}/view`, { method: 'POST', keepalive: true }).catch(() => undefined);
  }, [productId]);
  return null;
}
