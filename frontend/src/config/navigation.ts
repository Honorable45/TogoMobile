/**
 * Menus du site : liens de l'en-tête (ordinateur) et onglets du bas (téléphone).
 * Pour ajouter, renommer ou retirer un lien du menu, c'est ici.
 */
import { House, Search, Store, Tag } from 'lucide-react';

/** `match` : dit si le lien correspond à la page ouverte (il est alors mis en surbrillance). */
export const NAV = [
  { href: '/', label: 'Accueil', Icon: House, match: (p: string) => p === '/' },
  { href: '/catalogue', label: 'Catalogue', Icon: Search, match: (p: string) => p.startsWith('/catalogue') || p.startsWith('/produits') },
  { href: '/boutiques', label: 'Boutiques', Icon: Store, match: (p: string) => p.startsWith('/boutiques') },
  { href: '/promotions', label: 'Promo du jour', Icon: Tag, match: (p: string) => p.startsWith('/promotions') },
];
/** Onglets de la barre du bas sur téléphone (l'onglet Compte est ajouté à part). */
export const BOTTOM_NAV = NAV.filter((n) => n.href !== '/catalogue');
/** Pages qui allument l'onglet « Compte ». */
export const ACCOUNT_PATHS = ['/compte', '/favoris', '/connexion', '/inscription', '/vendeur'];
