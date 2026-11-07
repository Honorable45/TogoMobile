'use client';

/**
 * En-tête flottant du site. Les morceaux sont rangés dans components/layout/header/ :
 * - account-menu.tsx : menu du compte (ordinateur) et liens du compte
 * - header-search.tsx : barre de recherche sous le logo (téléphone)
 * - bottom-nav.tsx : onglets fixés en bas de l'écran (téléphone)
 * Les liens du menu se modifient dans config/navigation.ts.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Store } from 'lucide-react';
import { brand } from '@/config/brand';
import { NAV } from '@/config/navigation';
import { useSession } from '../session';
import { WhatsAppIcon } from '../ui/brand-icons';
import { HeaderAdBar } from '../home/ad-bar';
import { AccountMenu } from './header/account-menu';
import { BottomNav } from './header/bottom-nav';
import { HeaderSearch } from './header/header-search';
import { Logo } from './logo';

/**
 * En-tête flottant en verre clair.
 * Ordinateur : logo, navigation centrée, « Devenir vendeur », WhatsApp, compte.
 * Téléphone : logo, puis barre de recherche ; la navigation passe en bas de l'écran.
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
