import type { Metadata } from 'next';
import { ProsePage } from '@/components/prose';
import { brand } from '@/config/brand';

export const metadata: Metadata = { title: 'Politique de modération et avis vérifiés', alternates: { canonical: '/moderation' } };

export default function Page() {
  return (
    <ProsePage title="Modération et avis vérifiés" intro="Comment nous validons les boutiques, contrôlons les promotions et vérifions les avis — et ce que nous ne pouvons pas garantir.">
      <h2>Validation des boutiques</h2>
      <p>Chaque boutique est examinée par l’équipe avant d’être visible. Le badge « Boutique validée » indique uniquement que cette vérification a eu lieu. Le badge « Identité du vendeur vérifiée » n’apparaît que si l’équipe a effectivement contrôlé l’identité du responsable. Aucun badge ne signifie qu’une boutique est un revendeur agréé d’une marque.</p>
      <p>Les changements sensibles (nom commercial, numéro WhatsApp) sont soumis à une nouvelle validation.</p>
      <h2>Prix et promotions</h2>
      <ul>
        <li>Les prix sont fixés par chaque vendeur, en francs CFA.</li>
        <li>Le prix barré d’une promotion est le prix le plus bas pratiqué par la boutique pour cet appareil au cours des 30 jours précédant l’offre. Si le vendeur modifie son prix habituel, ses promotions en cours prennent fin.</li>
        <li>Une promotion commence et se termine automatiquement aux dates annoncées. L’équipe peut suspendre une offre trompeuse.</li>
      </ul>
      <h2>Comment un avis est vérifié</h2>
      <ul>
        <li>Le vendeur enregistre la vente avec le numéro de téléphone de l’acheteur (nous n’en conservons qu’une empreinte chiffrée).</li>
        <li>Il remet au client un QR code à usage unique, aléatoire et limité dans le temps.</li>
        <li>Le client, connecté à son compte, confirme l’achat en saisissant son numéro puis dépose sa note.</li>
        <li>Des contrôles automatiques détectent les situations inhabituelles (volumes anormaux, même numéro sur plusieurs ventes, commentaires identiques…). Dans ce cas, l’avis n’est publié qu’après examen par l’équipe.</li>
      </ul>
      <p>La mention « Achat vérifié » signifie que cette procédure a abouti. <strong>Le paiement étant conclu hors de {brand.name}, nous ne pouvons pas le constater</strong> : la vérification réduit fortement les faux avis mais ne constitue pas une preuve de paiement.</p>
      <h2>Ce qui est interdit</h2>
      <ul>
        <li>Appareils volés, contrefaits ou dont le vendeur n’a pas le droit de disposer.</li>
        <li>Descriptions mensongères, prix ou promotions fictifs.</li>
        <li>Avis rédigés par le vendeur, ses proches ou contre rémunération ; pression sur les clients.</li>
        <li>Contenus injurieux, discriminatoires ou comportant des données personnelles de tiers.</li>
      </ul>
      <h2>Signalements et décisions</h2>
      <p>Chaque annonce, boutique, promotion et avis peut être signalé. L’équipe examine les signalements, peut masquer un avis, retirer une annonce, suspendre une promotion ou une boutique, et conserve une trace de chaque décision. Un vendeur ne peut ni modifier ni supprimer les avis de ses clients ; il peut demander l’examen d’un avis par un signalement.</p>
    </ProsePage>
  );
}
