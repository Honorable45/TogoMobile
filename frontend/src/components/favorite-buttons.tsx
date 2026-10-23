'use client';

import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { loginHref, useSession } from './session';

export function FavoriteProductButton({ productId, title, variant = 'icon' }: { productId: string; title: string; variant?: 'icon' | 'full' }) {
  const { user, loading, favoriteProducts, toggleProduct } = useSession();
  const router = useRouter();
  const active = favoriteProducts.has(productId);

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      router.push(loginHref());
      return;
    }
    void toggleProduct(productId);
  };

  const label = active ? `Retirer ${title} des favoris` : `Ajouter ${title} aux favoris`;
  if (variant === 'full') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-pressed={active}
        aria-label={label}
        className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-line-2 bg-surface px-6 font-medium text-ink transition-transform duration-200 hover:-translate-y-0.5 active:scale-[.98]"
      >
        <Heart className={`size-5 ${active ? 'fill-promo-600 text-promo-600' : ''}`} aria-hidden />
        <span>{active ? 'Dans vos favoris' : 'Ajouter aux favoris'}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-pressed={active}
      aria-label={label}
      className="glass-light inline-flex size-11 items-center justify-center rounded-full text-ink transition-transform duration-200 hover:-translate-y-0.5 active:scale-[.98]"
    >
      <Heart className={`size-[18px] ${active ? 'fill-promo-600 text-promo-600' : ''}`} aria-hidden />
    </button>
  );
}

export function FollowShopButton({ shopId, name }: { shopId: string; name: string }) {
  const { user, loading, favoriteShops, toggleShop } = useSession();
  const router = useRouter();
  const active = favoriteShops.has(shopId);
  return (
    <button
      type="button"
      disabled={loading}
      aria-pressed={active}
      aria-label={active ? `Ne plus suivre ${name}` : `Suivre ${name}`}
      onClick={() => (user ? void toggleShop(shopId) : router.push(loginHref()))}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[0.9375rem] font-medium transition-[transform,background-color] duration-200 active:scale-[.98] ${
        active ? 'bg-white text-navy' : 'glass text-white hover:bg-white/20'
      }`}
    >
      <Heart className={`size-[18px] ${active ? 'fill-promo-600 text-promo-600' : ''}`} aria-hidden />
      {active ? 'Boutique suivie' : 'Suivre'}
    </button>
  );
}
