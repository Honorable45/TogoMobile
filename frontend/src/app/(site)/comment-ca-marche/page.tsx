import type { Metadata } from 'next';
import Link from 'next/link';
import { ProsePage } from '@/components/prose';
import { brand } from '@/config/brand';

export const metadata: Metadata = { title: 'Comment ça marche', alternates: { canonical: '/comment-ca-marche' } };

export default function Page() {
  return (
    <ProsePage title="Comment ça marche" intro={`${brand.name} rassemble les annonces des boutiques de téléphones du Togo. La vente se conclut directement entre vous et le vendeur.`}>
      <h2>Pour les acheteurs</h2>
      <ul>
        <li>Recherchez un téléphone dans le <Link href="/catalogue">catalogue</Link> et comparez les prix, l’état et les caractéristiques.</li>
        <li>Consultez la page de la boutique : localisation, avis vérifiés, réseaux sociaux.</li>
        <li>Touchez « Commander sur WhatsApp » : un message est préparé avec le nom du téléphone, sa référence, le prix affiché et le lien de l’annonce. Vous l’envoyez vous-même au vendeur.</li>
        <li>Convenez avec le vendeur du prix final, de la garantie, de la livraison ou du retrait et du mode de paiement. {brand.name} n’encaisse aucun paiement.</li>
        <li>Après l’achat, le vendeur peut vous remettre un QR code : scannez-le pour laisser un avis « Achat vérifié ».</li>
      </ul>
      <h2>Conseils avant de payer</h2>
      <ul>
        <li>Pour un appareil d’occasion, vérifiez l’IMEI (composez *#06#), l’état de la batterie, l’écran, les caméras et le déverrouillage du compte (iCloud, Google).</li>
        <li>Demandez un reçu mentionnant le modèle, le prix et la garantie.</li>
        <li>Méfiez-vous des prix anormalement bas et des demandes de paiement à l’avance sans garantie. Signalez toute annonce suspecte.</li>
      </ul>
      <h2>Pour les vendeurs</h2>
      <ul>
        <li><Link href="/devenir-vendeur">Demandez l’ouverture de votre boutique</Link>. Elle devient visible après validation par l’équipe.</li>
        <li>Publiez vos annonces : 3 photos et 1 vidéo au maximum par appareil, prix en FCFA, état, défauts éventuels.</li>
        <li>Créez des promotions datées. Le prix barré affiché est toujours le prix le plus bas pratiqué au cours des 30 jours précédents.</li>
        <li>Après une vente, enregistrez-la et remettez le QR code à votre client pour qu’il puisse vous laisser un avis.</li>
      </ul>
    </ProsePage>
  );
}
