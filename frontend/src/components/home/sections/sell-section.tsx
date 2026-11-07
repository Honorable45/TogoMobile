import Link from 'next/link';
import { ChevronRight, QrCode, Store } from 'lucide-react';
import { HOME_TITLES } from '@/config/home-content';

/** Bas de l'accueil : deux grandes cartes, « Ouvrez votre boutique » et « Comment ça marche ». */
export function SellSection() {
  return (
    <section aria-labelledby="vendre" className="bg-surface py-16 md:py-24">
      <div className="container-page">
        <h2 id="vendre" className="display mb-8 text-[32px] md:mb-10 md:text-[48px]">{HOME_TITLES.sell}</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex min-h-[380px] flex-col items-center rounded-[28px] bg-canvas px-8 pt-12 text-center">
            <h3 className="display text-[28px]">Ouvrez votre boutique.</h3>
            <p className="mt-3 max-w-sm text-[17px] text-ink-2">Gratuite, gérée depuis votre téléphone. Les clients vous écrivent directement sur WhatsApp.</p>
            <Link href="/devenir-vendeur" className="mt-4 inline-flex items-center gap-0.5 text-[17px] text-brand-600 hover:underline">
              Devenir vendeur <ChevronRight className="size-4" aria-hidden />
            </Link>
            <span className="mt-auto mb-10 flex size-28 items-center justify-center rounded-[32px] bg-surface text-navy">
              <Store className="size-12" strokeWidth={1.5} aria-hidden />
            </span>
          </div>
          <div className="flex min-h-[380px] flex-col items-center rounded-[28px] bg-ink px-8 pt-12 text-center text-white">
            <h3 className="display text-[28px]">Comment ça marche.</h3>
            <p className="mt-3 max-w-sm text-[17px] text-white/75">Publier, recevoir les commandes, enregistrer les ventes et récolter des avis vérifiés.</p>
            <Link href="/comment-ca-marche" className="mt-4 inline-flex items-center gap-0.5 text-[17px] text-promo-100 hover:underline">
              Tout comprendre en 2 minutes <ChevronRight className="size-4" aria-hidden />
            </Link>
            <span className="mt-auto mb-10 flex size-28 items-center justify-center rounded-[32px] bg-white/10">
              <QrCode className="size-12" strokeWidth={1.5} aria-hidden />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
