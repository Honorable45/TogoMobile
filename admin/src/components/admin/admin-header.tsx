'use client';

import Link from 'next/link';
import { ExternalLink, LogOut } from 'lucide-react';
import { useSession } from '@/components/session';
import { LogoMark } from '@/components/layout/logo';
import { brand } from '@/config/brand';

/** En-tête de l'administration : identité, lien vers le site public, déconnexion. */
export function AdminHeader() {
  const { user, logout } = useSession();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-3">
        <Link href="/" className="flex min-h-11 items-center gap-2" aria-label={`Administration ${brand.name} — tableau de bord`}>
          <LogoMark />
          <span className="display text-[21px] text-ink">{brand.name}</span>
          <span className="eyebrow hidden sm:inline">Administration</span>
        </Link>
        <div className="flex items-center gap-1 text-sm">
          <a href={brand.siteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 font-medium text-ink-2 hover:bg-white">
            <ExternalLink className="size-4" aria-hidden /> <span className="hidden sm:inline">Voir le site</span>
          </a>
          {user && (
            <>
              <span className="hidden max-w-40 truncate px-2 text-muted md:inline">{user.email ?? user.name}</span>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  window.location.assign('/connexion');
                }}
                className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 font-medium text-ink-2 hover:bg-white"
              >
                <LogOut className="size-4" aria-hidden /> Se déconnecter
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
