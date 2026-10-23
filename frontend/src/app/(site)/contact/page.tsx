import type { Metadata } from 'next';
import { ProsePage } from '@/components/prose';
import { brand } from '@/config/brand';

export const metadata: Metadata = { title: 'Contact', alternates: { canonical: '/contact' } };

export default function Page() {
  return (
    <ProsePage title="Contact" intro="Une question, un problème avec une annonce ou votre boutique ?">
      <ul>
        <li>Pour un problème avec une annonce, une boutique ou un avis : utilisez le bouton « Signaler » présent sur la page concernée. C’est le moyen le plus rapide d’alerter l’équipe de modération.</li>
        <li>Pour une commande : contactez directement le vendeur sur WhatsApp. {brand.name} n’intervient pas dans le paiement ni la livraison.</li>
        {brand.contactEmail ? (
          <li>
            Pour toute autre demande : <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>
          </li>
        ) : (
          <li>Adresse de contact : à configurer (variable NEXT_PUBLIC_CONTACT_EMAIL).</li>
        )}
      </ul>
    </ProsePage>
  );
}
