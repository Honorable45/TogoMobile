import type { Metadata } from 'next';
import { CheckCircle2, ImagePlus, QrCode, Tag } from 'lucide-react';
import { brand } from '@/config/brand';
import { PageBanner } from '@/components/layout/page-banner';
import { BecomeSellerPanel } from './panel';

export const metadata: Metadata = {
  title: 'Devenir vendeur',
  description: `Ouvrez gratuitement votre boutique de téléphones sur ${brand.name} et recevez les commandes de vos clients sur WhatsApp.`,
  alternates: { canonical: '/devenir-vendeur' },
};

export default function BecomeSellerPage() {
  const steps = [
    { Icon: CheckCircle2, title: 'Demande d’ouverture', text: 'Décrivez votre boutique. Notre équipe la vérifie avant de la rendre visible.' },
    { Icon: ImagePlus, title: 'Vos annonces depuis votre téléphone', text: 'Jusqu’à 3 photos et une vidéo par appareil, prix, état et caractéristiques.' },
    { Icon: Tag, title: 'Promotions', text: 'Programmez des offres à durée limitée, mises en avant sur votre page et dans le catalogue.' },
    { Icon: QrCode, title: 'Avis vérifiés', text: 'Après une vente, remettez un QR code à votre client pour qu’il puisse laisser un avis.' },
  ];
  return (
    <>
    <PageBanner eyebrow="Vendeurs" title={`Vendre sur ${brand.name}`} subtitle="Une boutique gratuite, gérée depuis votre téléphone. Les clients vous écrivent sur WhatsApp." />
    <div className="container-page grid gap-10 py-12 md:py-16 lg:grid-cols-[1fr_1.1fr]">
      <div>
        <p className="eyebrow mb-5">En quatre étapes</p>
        <ol className="space-y-6">
          {steps.map(({ Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-promo-50 text-promo-700">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="display text-xl">{title}</p>
                <p className="text-sm text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-10 text-xs leading-relaxed text-muted">
          En publiant sur {brand.name}, vous vous engagez à proposer des appareils dont vous avez le droit de disposer, à décrire honnêtement leur état et à afficher des prix réels. Voir la politique de modération.
        </p>
      </div>
      <BecomeSellerPanel />
    </div>
    </>
  );
}
