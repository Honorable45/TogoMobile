import type { Metadata } from 'next';
import { ProsePage } from '@/components/prose';
import { brand } from '@/config/brand';

export const metadata: Metadata = { title: 'Politique de confidentialité', alternates: { canonical: '/confidentialite' } };

// Modèle à faire relire par un conseil juridique (loi togolaise relative à la protection des données personnelles).
export default function Page() {
  return (
    <ProsePage title="Politique de confidentialité" updated="à compléter avant mise en ligne">
      <h2>Données collectées</h2>
      <ul>
        <li>Compte : nom, e-mail et/ou numéro de téléphone, mot de passe (stocké sous forme d’empreinte, jamais en clair).</li>
        <li>Boutique : informations commerciales publiées par le vendeur (nom, localisation, numéros professionnels, réseaux sociaux).</li>
        <li>Ventes déclarées : référence interne, date, produit et une empreinte chiffrée du numéro de l’acheteur, utilisée uniquement pour vérifier les avis. Aucune pièce d’identité n’est demandée.</li>
        <li>Usage : nombre de consultations et de clics vers WhatsApp par annonce (statistiques agrégées, sans profilage publicitaire).</li>
      </ul>
      <h2>Finalités</h2>
      <p>Fournir le service, sécuriser les comptes, vérifier les avis, lutter contre la fraude, produire des statistiques pour les vendeurs.</p>
      <h2>Ce qui est public</h2>
      <p>Les informations des boutiques et des annonces, ainsi que le prénom et l’initiale du nom des auteurs d’avis. Les adresses e-mail et numéros personnels des acheteurs ne sont jamais publiés ni transmis aux vendeurs.</p>
      <h2>Cookies</h2>
      <p>Un seul cookie technique est utilisé pour maintenir votre session. Aucun cookie publicitaire.</p>
      <h2>Vos droits</h2>
      <p>Vous pouvez demander l’accès, la rectification ou la suppression de vos données en écrivant à l’adresse indiquée sur la page Contact.</p>
      <h2>Hébergement et sous-traitants</h2>
      <p>À préciser selon les prestataires retenus (hébergement du site et de l’API, base de données, stockage des médias, envoi d’e-mails). {brand.name} s’engage à ne pas vendre vos données.</p>
    </ProsePage>
  );
}
