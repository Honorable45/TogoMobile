'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { ExternalLink, LayoutDashboard, MessageSquareText, Receipt, Smartphone, Store, Tag } from 'lucide-react';
import { useApi, useRequireUser } from '@/lib/hooks';
import { SHOP_STATUS_LABELS } from '@/lib/format';
import type { ShopStatus } from '@/lib/types';
import { Alert, Skeleton } from '../ui/misc';

export interface SellerShop {
  id: string;
  name: string;
  slug: string;
  status: ShopStatus;
  statusReason: string | null;
  description: string | null;
  city: string;
  district: string | null;
  address: string | null;
  whatsapp: string;
  phone: string | null;
  openingHours: string | null;
  socialLinks: Record<string, string>;
  logoUrl: string | null;
  pendingChanges: { name?: string; whatsapp?: string; requestedAt?: string } | null;
  validatedAt: string | null;
  identityVerifiedAt: string | null;
  publicUrlAvailable: boolean;
}

const Ctx = createContext<{ shop: SellerShop; reload: () => Promise<void>; setShop: (s: SellerShop) => void } | null>(null);
export const useSellerShop = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSellerShop hors de SellerShell');
  return v;
};

const NAV = [
  { href: '/vendeur', label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
  { href: '/vendeur/produits', label: 'Produits', icon: Smartphone },
  { href: '/vendeur/promotions', label: 'Promotions', icon: Tag },
  { href: '/vendeur/ventes', label: 'Ventes et QR codes', icon: Receipt },
  { href: '/vendeur/avis', label: 'Avis reçus', icon: MessageSquareText },
  { href: '/vendeur/boutique', label: 'Ma boutique', icon: Store },
];

export function SellerShell({ children }: { children: ReactNode }) {
  const { ready } = useRequireUser('SELLER');
  const shop = useApi<SellerShop>(ready ? '/seller/shop' : null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (shop.status === 404) router.replace('/devenir-vendeur');
  }, [shop.status, router]);

  if (!ready || (!shop.data && !shop.error)) {
    return (
      <div className="container-page grid gap-6 py-6 lg:grid-cols-[14rem_1fr]">
        <Skeleton className="hidden h-80 lg:block" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (shop.error || !shop.data) return <div className="container-page py-8"><Alert tone="danger">{shop.error}</Alert></div>;

  const s = shop.data;
  const isActive = (n: (typeof NAV)[number]) => (n.exact ? pathname === n.href : pathname.startsWith(n.href));

  return (
    <Ctx.Provider value={{ shop: s, reload: shop.reload, setShop: (x) => shop.setData(x) }}>
      <div className="container-page grid grid-cols-[minmax(0,1fr)] gap-6 py-4 sm:py-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <div className="glass-light mb-3 hidden rounded-3xl p-4 lg:block">
            <p className="display truncate text-xl">{s.name}</p>
            <p className="text-xs text-muted">{SHOP_STATUS_LABELS[s.status]}</p>
            {s.publicUrlAvailable && (
              <Link href={`/boutiques/${s.slug}`} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 underline underline-offset-4" target="_blank">
                Voir ma page publique <ExternalLink className="size-3" aria-hidden />
              </Link>
            )}
          </div>
          <nav aria-label="Espace vendeur" className="scrollbar-none -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            <ul className="flex gap-1 lg:flex-col">
              {NAV.map((n) => (
                <li key={n.href} className="shrink-0">
                  <Link
                    href={n.href}
                    aria-current={isActive(n) ? 'page' : undefined}
                    className="flex h-11 items-center gap-2.5 rounded-full px-4 text-sm font-medium text-ink-2 transition-colors hover:bg-white aria-[current=page]:bg-navy aria-[current=page]:text-white"
                  >
                    <n.icon className="size-[18px]" aria-hidden />
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <div className="min-w-0 space-y-4">
          {s.status === 'PENDING' && (
            <Alert tone="info" title="Votre boutique est en attente de validation">
              Vous pouvez dès maintenant préparer vos annonces (brouillons). Elles pourront être publiées dès que l’équipe aura validé votre boutique.
            </Alert>
          )}
          {s.status === 'CHANGES_REQUESTED' && (
            <Alert tone="warn" title="Corrections demandées par l’équipe">
              {s.statusReason ? `${s.statusReason}. ` : ''}Modifiez les informations de votre boutique : la demande sera automatiquement réexaminée.
            </Alert>
          )}
          {s.status === 'REJECTED' && (
            <Alert tone="danger" title="Votre demande n’a pas été acceptée">
              {s.statusReason ? `Motif : ${s.statusReason}. ` : ''}Corrigez les informations de votre boutique : la demande sera automatiquement soumise à nouveau.
            </Alert>
          )}
          {s.status === 'SUSPENDED' && (
            <Alert tone="danger" title="Votre boutique est suspendue">
              {s.statusReason ? `Motif : ${s.statusReason}. ` : ''}Vos annonces ne sont plus visibles et aucune modification n’est possible. Contactez l’administration.
            </Alert>
          )}
          {s.status === 'CLOSED' && (
            <Alert tone="warn" title="Boutique fermée temporairement">
              Vos annonces sont masquées. Rouvrez la boutique depuis « Ma boutique ».
            </Alert>
          )}
          {children}
        </div>
      </div>
    </Ctx.Provider>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="display text-[30px] sm:text-[38px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
