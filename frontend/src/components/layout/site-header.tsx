'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Heart, LayoutDashboard, LogOut, ShieldCheck, Store, User, UserRound } from 'lucide-react';
import { brand } from '@/config/brand';
import { useSession } from '../session';
import { WhatsAppIcon } from '../ui/brand-icons';
import { Logo } from './logo';

const NAV = [
  { href: '/', label: 'Accueil', match: (p: string) => p === '/' },
  { href: '/catalogue', label: 'Catalogue', match: (p: string) => p.startsWith('/catalogue') || p.startsWith('/produits') },
  { href: '/boutiques', label: 'Boutiques', match: (p: string) => p.startsWith('/boutiques') },
  { href: '/promotions', label: 'Promotions', match: (p: string) => p.startsWith('/promotions') },
];

function AccountMenu() {
  const { user, loading, logout } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  const pill =
    'glass-light inline-flex h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium text-ink transition-transform duration-200 hover:-translate-y-0.5 active:scale-[.98] sm:px-4';
  if (loading || !user) return null;
  const item = 'flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm text-ink hover:bg-white/70';
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label="Mon compte" className={pill}>
        <UserRound className="size-[18px]" aria-hidden />
        <span className="hidden max-w-28 truncate sm:inline">{user.name.split(' ')[0]}</span>
      </button>
      {open && (
        <div role="menu" className="glass-light absolute right-0 top-[3.25rem] z-50 w-64 animate-slide-up rounded-3xl p-2">
          <p className="truncate px-3 py-2 text-xs text-muted">{user.email ?? user.phone}</p>
          {user.role === 'SELLER' && (
            <Link role="menuitem" href="/vendeur" className={item} onClick={() => setOpen(false)}>
              <LayoutDashboard className="size-4" aria-hidden /> Espace vendeur
            </Link>
          )}
          {user.role === 'ADMIN' && (
            <a role="menuitem" href={brand.adminUrl} className={item} onClick={() => setOpen(false)}>
              <ShieldCheck className="size-4" aria-hidden /> Administration
            </a>
          )}
          {user.role === 'CUSTOMER' && (
            <Link role="menuitem" href="/devenir-vendeur" className={item} onClick={() => setOpen(false)}>
              <Store className="size-4" aria-hidden /> Vendre sur {brand.name}
            </Link>
          )}
          <Link role="menuitem" href="/favoris" className={item} onClick={() => setOpen(false)}>
            <Heart className="size-4" aria-hidden /> Mes favoris
          </Link>
          <Link role="menuitem" href="/compte" className={item} onClick={() => setOpen(false)}>
            <User className="size-4" aria-hidden /> Mon compte
          </Link>
          <button
            role="menuitem"
            type="button"
            className={`${item} w-full`}
            onClick={async () => {
              setOpen(false);
              await logout();
              router.push('/');
              router.refresh();
            }}
          >
            <LogOut className="size-4" aria-hidden /> Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * En-tête flottant en verre clair. Ligne 1 : logo, « Devenir vendeur », compte (si connecté).
 * Navigation centrée sur ordinateur ; seconde ligne d'onglets égaux sur mobile (pas de menu hamburger).
 */
export function SiteHeader() {
  const pathname = usePathname();
  const { user } = useSession();
  const sellerActive = pathname.startsWith('/devenir-vendeur');
  // Onglets en verre : verre sombre pour l'onglet actif, verre clair au survol.
  const tab = (active: boolean) =>
    `inline-flex h-10 items-center justify-center rounded-full px-2 text-[13px] font-medium transition-[transform,background-color] duration-200 active:scale-[.98] sm:px-4 sm:text-sm ${
      active ? 'glass-dark text-white' : 'text-ink-2 hover:glass-light'
    }`;

  return (
    <header className="glass-light fixed inset-x-3 top-3 z-40 rounded-[28px] md:rounded-full">
      <div className="mx-auto flex h-[60px] max-w-[76rem] items-center gap-2 pl-4 pr-2 md:h-16 md:pl-5">
        <Logo />
        <nav aria-label="Navigation principale" className="mx-auto hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={n.match(pathname) ? 'page' : undefined} className={tab(n.match(pathname))}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          {user?.role !== 'SELLER' && user?.role !== 'ADMIN' && (
            <Link
              href="/devenir-vendeur"
              aria-current={sellerActive ? 'page' : undefined}
              aria-label="Devenir vendeur"
              className="glass-dark inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-white transition-transform duration-200 hover:-translate-y-0.5 active:scale-[.98]"
            >
              <Store className="size-[18px]" aria-hidden />
              <span className="sm:hidden">Vendre</span>
              <span className="hidden sm:inline">Devenir vendeur</span>
            </Link>
          )}
          {brand.whatsapp && (
            <a
              href={`https://wa.me/${brand.whatsapp.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-11 items-center gap-2 rounded-full border border-white/30 bg-whatsapp/90 px-4 text-sm font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/.35)] backdrop-blur-md hover:bg-whatsapp-hover sm:inline-flex"
            >
              <WhatsAppIcon className="size-[18px]" /> Nous écrire
            </a>
          )}
          <AccountMenu />
        </div>
      </div>
      <nav aria-label="Navigation mobile" className="grid grid-cols-4 gap-1 border-t border-white/80 px-1.5 py-1.5 md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={n.match(pathname) ? 'page' : undefined} className={tab(n.match(pathname))}>
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

/** Réserve la hauteur de l'en-tête flottant pour les pages sans bandeau (espaces vendeur et admin). */
export function HeaderSpacer() {
  return <div className="h-[136px] md:h-[100px]" aria-hidden />;
}
