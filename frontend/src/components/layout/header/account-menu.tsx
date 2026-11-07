'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Heart, LayoutDashboard, LogOut, ShieldCheck, Store, User, UserRound } from 'lucide-react';
import { brand } from '@/config/brand';
import { useSession } from '../../session';
import { useDismiss } from './use-dismiss';

/** Liens du compte connecté, partagés par le menu de l'en-tête (ordinateur) et l'onglet Compte (mobile). */
export function AccountLinks({ onPick }: { onPick: () => void }) {
  const { user, logout } = useSession();
  const router = useRouter();
  if (!user) return null;
  const item = 'flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm text-ink hover:bg-white/70';
  return (
    <>
      <p className="truncate px-3 py-2 text-xs text-muted">{user.email ?? user.phone}</p>
      {user.role === 'SELLER' && (
        <Link role="menuitem" href="/vendeur" className={item} onClick={onPick}>
          <LayoutDashboard className="size-4" aria-hidden /> Espace vendeur
        </Link>
      )}
      {user.role === 'ADMIN' && (
        <a role="menuitem" href={brand.adminUrl} className={item} onClick={onPick}>
          <ShieldCheck className="size-4" aria-hidden /> Administration
        </a>
      )}
      {user.role === 'CUSTOMER' && (
        <Link role="menuitem" href="/devenir-vendeur" className={item} onClick={onPick}>
          <Store className="size-4" aria-hidden /> Vendre sur {brand.name}
        </Link>
      )}
      <Link role="menuitem" href="/favoris" className={item} onClick={onPick}>
        <Heart className="size-4" aria-hidden /> Mes favoris
      </Link>
      <Link role="menuitem" href="/compte" className={item} onClick={onPick}>
        <User className="size-4" aria-hidden /> Mon compte
      </Link>
      <button
        role="menuitem"
        type="button"
        className={`${item} w-full`}
        onClick={async () => {
          onPick();
          await logout();
          router.push('/');
          router.refresh();
        }}
      >
        <LogOut className="size-4" aria-hidden /> Se déconnecter
      </button>
    </>
  );
}

/** Menu du compte dans l'en-tête, sur ordinateur uniquement (sur mobile : onglet Compte en bas). */
export function AccountMenu() {
  const { user, loading } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  if (loading || !user) return null;
  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Mon compte"
        className="glass-light inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium text-ink transition-transform duration-200 hover:-translate-y-0.5 active:scale-[.98]"
      >
        <UserRound className="size-[18px]" aria-hidden />
        <span className="max-w-28 truncate">{user.name.split(' ')[0]}</span>
      </button>
      {open && (
        <div role="menu" className="glass-light absolute right-0 top-[3.25rem] z-50 w-64 animate-slide-up rounded-3xl p-2">
          <AccountLinks onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
