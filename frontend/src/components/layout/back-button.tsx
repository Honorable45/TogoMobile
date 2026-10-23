'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

/**
 * Bouton « Retour » placé dans le contenu des pages intérieures.
 * Revient à la page précédente du site si elle existe, sinon à la page de repli.
 */
export function BackButton({ fallback = '/', label = 'Retour', tone = 'glass' }: { fallback?: string; label?: string; tone?: 'glass' | 'light' }) {
  const router = useRouter();
  return (
    <a
      href={fallback}
      onClick={(e) => {
        const sameSite = document.referrer && new URL(document.referrer).origin === window.location.origin;
        if (sameSite && window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className={`inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium transition-transform active:scale-[.98] ${
        tone === 'glass' ? 'glass text-white hover:bg-white/20' : 'glass-light text-ink hover:bg-white'
      }`}
    >
      <ArrowLeft className="size-4" aria-hidden />
      {label}
    </a>
  );
}
