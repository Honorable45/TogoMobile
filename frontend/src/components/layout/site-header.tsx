'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Heart, House, LayoutDashboard, LogOut, Search, ShieldCheck, Store, Tag, User, UserRound } from 'lucide-react';
import { brand } from '@/config/brand';
import { useSession } from '../session';
import { WhatsAppIcon } from '../ui/brand-icons';
import { HeaderAdBar } from '../home/ad-bar';
import { Logo } from './logo';

const NAV = [
  { href: '/', label: 'Accueil', Icon: House, match: (p: string) => p === '/' },
  { href: '/catalogue', label: 'Catalogue', Icon: Search, match: (p: string) => p.startsWith('/catalogue') || p.startsWith('/produits') },
  { href: '/boutiques', label: 'Boutiques', Icon: Store, match: (p: string) => p.startsWith('/boutiques') },
  { href: '/promotions', label: 'Promo du jour', Icon: Tag, match: (p: string) => p.startsWith('/promotions') },
];
/** Onglets de la barre inférieure mobile (le compte est ajouté à part). */
const BOTTOM_NAV = NAV.filter((n) => n.href !== '/catalogue');
const ACCOUNT_PATHS = ['/compte', '/favoris', '/connexion', '/inscription', '/vendeur'];

/** Ferme un menu au clic extérieur ou sur Échap. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

/** Liens du compte connecté, partagés par le menu de l'en-tête (ordinateur) et l'onglet Compte (mobile). */
function AccountLinks({ onPick }: { onPick: () => void }) {
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
function AccountMenu() {
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

/** Barre de recherche de l'en-tête mobile : renvoie vers le catalogue. */
function HeaderSearch() {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname.startsWith('/catalogue') ? (params.get('q') ?? '') : '';
  // Le catalogue a sa propre grande barre de recherche : pas de deuxième barre dans l'en-tête.
  if (pathname.startsWith('/catalogue')) return null;
  return (
    <form action="/catalogue" role="search" className="border-t border-white/80 px-2 py-1.5 md:hidden">
      <label htmlFor="header-search" className="sr-only">
        Rechercher un produit
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted" aria-hidden />
        <input
          key={current}
          id="header-search"
          name="q"
          type="search"
          defaultValue={current}
          enterKeyHint="search"
          placeholder="Rechercher un téléphone, une marque…"
          className="h-10 w-full rounded-full border border-line-2 bg-surface pl-11 pr-4 text-[15px] placeholder:text-faint focus:border-brand-600 focus:outline-none"
        />
      </div>
    </form>
  );
}

/** Barre d'onglets fixée en bas de l'écran sur mobile : Accueil, Vendeurs, Promo du jour, Compte. */
function BottomNav() {
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

/**
 * En-tête flottant en verre clair.
 * Ordinateur : logo, navigation centrée, « Devenir vendeur », WhatsApp, compte.
 * Mobile : logo et « Devenir vendeur », puis barre de recherche ; la navigation passe en bas de l'écran.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const { user } = useSession();
  const sellerActive = pathname.startsWith('/devenir-vendeur');
  const tab = (active: boolean) =>
    `inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium transition-[transform,background-color] duration-200 active:scale-[.98] ${
      active ? 'glass-dark text-white' : 'text-ink-2 hover:glass-light'
    }`;
  const pill =
    'glass-dark inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium md:h-11 md:gap-2 md:px-4 md:text-sm text-white transition-transform duration-200 hover:-translate-y-0.5 active:scale-[.98]';

  return (
    <>
      <header className="glass-header fixed inset-x-3 top-3 z-40 rounded-[28px] md:rounded-full">
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
            {user?.role === 'SELLER' ? (
              <Link href="/vendeur" className={`${pill} md:hidden`}>
                <LayoutDashboard className="size-4 md:size-[18px]" aria-hidden /> Ma boutique
              </Link>
            ) : user?.role !== 'ADMIN' ? (
              <Link href="/devenir-vendeur" aria-current={sellerActive ? 'page' : undefined} className={`${pill} max-md:hidden`}>
                <Store className="size-4 md:size-[18px]" aria-hidden /> Devenir vendeur
              </Link>
            ) : null}
            {brand.whatsapp && (
              <a
                href={`https://wa.me/${brand.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden h-11 items-center gap-2 rounded-full border border-white/30 bg-whatsapp/90 px-4 text-sm font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/.35)] backdrop-blur-md hover:bg-whatsapp-hover lg:inline-flex"
              >
                <WhatsAppIcon className="size-[18px]" /> Nous écrire
              </a>
            )}
            <AccountMenu />
          </div>
        </div>
        {/* Barre de publicités de l'accueil mobile (déclarées par la page avec AdBar). */}
        <div className="md:hidden">
          <HeaderAdBar />
        </div>
        <HeaderSearch />
      </header>
      <BottomNav />
    </>
  );
}

/** Réserve la hauteur de l'en-tête flottant pour les pages sans bandeau (espaces vendeur et admin). */
export function HeaderSpacer() {
  return <div className="h-[136px] md:h-[100px]" aria-hidden />;
}
