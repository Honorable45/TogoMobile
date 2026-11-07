# Où modifier quoi

Ce guide indique le fichier à ouvrir pour chaque changement courant.
Les chemins partent de la racine du dépôt.

## Site (frontend/src)

### Identité et textes

| Je veux changer… | Fichier |
|---|---|
| Le nom du site, l'accroche, la ville, le WhatsApp du support | `config/brand.ts` |
| Le logo | `public/brand/` (fichiers SVG) et `components/layout/logo.tsx` |
| Les couleurs, les arrondis, les ombres | `app/globals.css` (bloc `@theme` en haut) |
| Les liens du menu (ordinateur) et les onglets du bas (téléphone) | `config/navigation.ts` |
| Les titres et les textes de la page d'accueil, les cartes « Pourquoi acheter » | `config/home-content.ts` |

### Page d'accueil

`app/(site)/page.tsx` charge les données, puis empile les sections dans l'ordre.
Pour déplacer ou retirer une section, il suffit de déplacer ou de supprimer sa ligne.

Chaque section a son propre fichier dans `components/home/sections/` :

| Section | Fichier |
|---|---|
| Haut de page : accroche, icônes des marques, grand carrousel | `home-hero.tsx` |
| « Promo du jour » et « Nouveautés » | `product-rows.tsx` |
| « Pourquoi acheter » | `reasons-section.tsx` |
| « Des boutiques validées » | `shops-section.tsx` |
| « Choisissez votre marque » (une rangée par marque) | `brand-rows-section.tsx` |
| « Vous vendez des téléphones » | `sell-section.tsx` |

### Rangées et cartes

| Élément | Fichier |
|---|---|
| Rangée qu'on fait glisser (flèches, marges, rien ne bouge seul) | `components/home/scroll-row.tsx` |
| Rangée sans fin : charge la suite, puis reprend au début | `components/home/endless-row.tsx` |
| Nombre de téléphones chargés à chaque fois | `ROW_PAGE_SIZE` dans `config/home-content.ts` |
| Carte produit (photo, badge, Commander, prix) | `components/product/product-card.tsx` |
| Grande tuile « gamme » (Promo du jour, Nouveautés) | `components/home/lineup-tile.tsx` |
| Format des prix, des dates, de la fin des promos | `lib/format.ts` |

### En-tête et pages

| Élément | Fichier |
|---|---|
| En-tête | `components/layout/site-header.tsx` |
| Morceaux de l'en-tête (menu du compte, recherche du téléphone, onglets du bas) | `components/layout/header/` |
| Pied de page | `components/layout/site-footer.tsx` |
| Haut des pages intérieures (titre, sous-titre, « Retour ») | `components/layout/page-banner.tsx` |
| Boutons (noir, contour, WhatsApp…) | `components/ui/button.tsx` |
| Formulaires de connexion et d'inscription | `components/auth-forms.tsx` |
| Les règles des formulaires (champ obligatoire, téléphone, mot de passe…) et leurs messages | `lib/validation.ts` (chaque formulaire liste ses règles en haut de son fichier) |
| Une page du site | `app/(site)/<nom-de-la-page>/page.tsx` |

## API Django (backend-django)

Chaque dossier est un module indépendant, organisé toujours de la même façon :

- `urls.py` : les adresses du module ;
- `views.py` : lit et vérifie la requête ;
- `services.py` (ou plusieurs fichiers) : fait le travail.

| Module | Rôle |
|---|---|
| `catalog/` | Catalogue public. `search.py` : recherche. `product.py` : fiche, similaires, WhatsApp, vues. `home.py` : accueil. `reviews.py` : avis. |
| `accounts/` | Inscription, connexion, profil, mot de passe, appareils connectés |
| `shops/` | Boutiques publiques |
| `favorites/` | Favoris de l'utilisateur connecté |
| `core/` | Outils communs : modèles de la base, sécurité, sessions, format des réponses et des erreurs |
| `config/` | Réglages (`settings.py`) et liste de toutes les adresses (`urls.py`) |

| Je veux changer… | Fichier |
|---|---|
| Le message WhatsApp envoyé au vendeur | `catalog/product.py`, fonction `whatsapp` |
| Les règles d'affichage public (annonce visible ou non, promo en cours) | `core/visibility.py` |
| La forme d'une carte produit renvoyée par l'API | `core/presenter.py`, fonction `card` |
| Les règles de pagination et les paramètres refusés | `core/params.py` |
| Les limites anti-abus (nombre d'essais par minute) | `config/settings.py`, bloc `REST_FRAMEWORK` |

**Ajouter un module :**

1. Créer un dossier avec `__init__.py`, `urls.py`, `views.py` et `services.py`.
2. L'ajouter à `INSTALLED_APPS` dans `config/settings.py`.
3. Inclure son `urls.py` dans `config/urls.py`, avant la dernière ligne (le relais vers l'ancienne API).

**Vérifier après un changement :** les scripts de `backend-django/scripts/` comparent l'API Django à l'ancienne API Node :

- `compare_api.py` : pages publiques ;
- `compare_auth.py` : comptes ;
- `compare_favorites.py` : favoris ;
- `security_check.py` : tests d'attaque de base.
