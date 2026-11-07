'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { ACCOUNT_PATHS, BOTTOM_NAV } from '@/config/navigation';
import { useSession } from '../../session';
import { AccountLinks } from './account-menu';
import { useDismiss } from './use-dismiss';

/** Barre d'onglets fixée en bas de l'écran sur mobile : Accueil, Boutiques, Promo du jour, Compte. */
export function BottomNav() {
  const pathname = usePathname();
  const { user, loading } = useSession();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useDismiss(open, close);
  useEffect(close, [pathname]);

  const tab = (active: boolean) =>
    `flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-medium leading-tight transition-colors duration-200 active:scale-[.97] ${
      active ? 'glass-dark text-white' : 'text-ink-2'
    }`;
  const accountActive = ACCOUNT_PATHS.some((p) => pathname.startsWith(p)) || open;

  // Fiche produit : la barre « Commander sur WhatsApp » occupe le bas de l'écran ; deux barres
  // empilées mangeraient près d'un cinquième de l'écran. Le logo et « Retour » restent en haut.
  if (pathname.startsWith('/produits/')) return null;

  return (
    <nav
      id="bottom-nav"
      aria-label="Navigation mobile"
      className="glass-light fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-40 rounded-[26px] p-1 md:hidden"
    >
      <div ref={ref} className="relative grid grid-cols-4 gap-1">
        {BOTTOM_NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={n.match(pathname) ? 'page' : undefined} className={tab(n.match(pathname))}>
            <n.Icon className="size-[22px]" aria-hidden />
            {n.label}
          </Link>
        ))}
        {user ? (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className={tab(accountActive)}>
            <UserRound className="size-[22px]" aria-hidden />
            Compte
          </button>
        ) : (
          <Link
            href="/connexion"
            aria-current={accountActive ? 'page' : undefined}
            aria-disabled={loading || undefined}
            className={tab(accountActive)}
          >
            <UserRound className="size-[22px]" aria-hidden />
            Compte
          </Link>
        )}
        {open && user && (
          <div role="menu" aria-label="Mon compte" className="glass-light absolute bottom-[calc(100%+0.75rem)] right-0 w-64 animate-slide-up rounded-3xl p-2">
            <AccountLinks onPick={close} />
          </div>
        )}
      </div>
    </nav>
  );
}
