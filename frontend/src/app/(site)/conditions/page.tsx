import type { Metadata } from 'next';
import { ProsePage } from '@/components/prose';
import { brand } from '@/config/brand';

export const metadata: Metadata = { title: 'Conditions d’utilisation', alternates: { canonical: '/conditions' } };

// Modèle à faire relire par un conseil juridique avant la mise en production.
export default function Page() {
  return (
    <ProsePage title="Conditions d’utilisation" updated="à compléter avant mise en ligne">
      <h2>1. Objet</h2>
      <p>{brand.name} est une plateforme de mise en relation entre des boutiques de téléphones et des acheteurs au {brand.country}. {brand.name} n’est ni vendeur ni intermédiaire de paiement : les contrats de vente sont conclus directement entre l’acheteur et la boutique.</p>
      <h2>2. Comptes</h2>
      <p>Vous êtes responsable de la confidentialité de votre mot de passe et des actions effectuées depuis votre compte. Les informations fournies doivent être exactes.</p>
      <h2>3. Engagements des vendeurs</h2>
      <ul>
        <li>Publier des annonces exactes : modèle, état, défauts, prix réellement pratiqué.</li>
        <li>Ne proposer que des appareils dont ils peuvent légalement disposer.</li>
        <li>N’enregistrer que des ventes réelles et ne pas tenter d’influencer les avis.</li>
        <li>Respecter la réglementation applicable au commerce et à la protection des consommateurs.</li>
      </ul>
      <h2>4. Avis</h2>
      <p>Les avis doivent refléter une expérience d’achat réelle. {brand.name} peut refuser, masquer ou retirer un avis contraire à la <a href="/moderation">politique de modération</a>.</p>
      <h2>5. Responsabilité</h2>
      <p>Les annonces sont publiées sous la responsabilité des vendeurs. {brand.name} met en œuvre des contrôles (validation des boutiques, modération, signalements) mais ne garantit pas l’exécution des ventes conclues entre utilisateurs.</p>
      <h2>6. Suspension</h2>
      <p>En cas de manquement, {brand.name} peut retirer des contenus et suspendre un compte ou une boutique. Les décisions sont journalisées.</p>
      <h2>7. Droit applicable</h2>
      <p>Les présentes conditions sont régies par le droit togolais.</p>
    </ProsePage>
  );
}
