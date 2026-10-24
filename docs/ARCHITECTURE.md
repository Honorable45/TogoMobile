# Architecture

## Vue d'ensemble

```
Navigateur ──► Site Next.js (Vercel) ──► /api/v1/* relayé ──► API NestJS (Render, 1..N) ──► PostgreSQL
    │               │  pages publiques en cache par étiquette ◄── invalidation ──┘   ▲  (données + file de tâches)
    │               │                                                                 │
    │               └── médias servis par le CDN du stockage           Worker (Render) ┘ variantes, vidéo, nettoyage
    └── envoi direct des fichiers (formulaire signé) ──► Cloudinary (ou R2/S3) ◄── Worker
```

- **Relais `/api/v1`** : le navigateur n'appelle jamais l'API sur un autre domaine. `next.config.ts` réécrit `/api/v1/*` vers `API_URL`. Le cookie de session est donc posé sur le domaine du site (cookie « first-party », `SameSite=Lax`), même si l'API est hébergée ailleurs.
- **Pages publiques** (accueil, catalogue, fiche, boutique, promotions) : rendues côté serveur pour le référencement. Avec `REVALIDATE_SECRET`, les réponses de l'API sont mises en cache par étiquette (`product:<slug>`, `shop:<slug>`, `catalog`, `home`, `promotions`) et invalidées par l'API à chaque changement ; les fiches produit sont régénérées à la demande (ISR). Sans secret, le cache est limité à 1 s. Détails : [Cache](#cache).
- **Administration** : application Next.js séparée (`admin/`), sur son propre domaine (`admin.<domaine>`), avec sa propre connexion réservée au rôle `ADMIN`, son propre relais `/api/v1` et son propre cookie de session. Elle n'est jamais indexée ni mise en cache. Les anciennes adresses `/admin` du site y redirigent. Son origine (`ADMIN_URL`) est autorisée par l'API.
- **Espaces privés** (vendeur, administration, compte, favoris) : rendus côté client, chaque appel est autorisé par l'API. Le `proxy.ts` de Next ne fait que rediriger vers la connexion ; il n'est pas une barrière de sécurité.

## API (`backend`)

| Module | Responsabilités |
|---|---|
| `auth` | Inscription, connexion, sessions, mot de passe oublié, profil |
| `shops` | Demande d'ouverture, profil boutique, logo, fermeture temporaire, pages publiques |
| `products` | Annonces du vendeur, stock, publication, historique des prix |
| `media` | Envoi, vérification, compression, ordre et suppression des photos et vidéos |
| `catalog` | Recherche, filtres, tri, fiche produit, WhatsApp, consultations, accueil |
| `promotions` | Création, modification, désactivation, historique, liste publique |
| `favorites` | Favoris produits et boutiques |
| `sales` | Ventes déclarées, QR codes, parcours client de dépôt d'avis |
| `reviews` | Notes, listes publiques, contrôles automatiques |
| `reports` | Signalements |
| `referentials` | Marques et catégories |
| `stats` | Tableau de bord vendeur, statistiques administrateur, données du sitemap |
| `admin` | Validation, suspension, modération, décisions, journal d'audit |
| `storage` | Abstraction du stockage : local (développement), Cloudinary ou S3/R2 (production), autorisations d'envoi direct |
| `jobs` | File de tâches PostgreSQL, tentatives, tâches périodiques ; exécutée par le worker (`dist/worker.js`) |
| `cache` | Invalidation ciblée du cache du site (`RevalidationService`) |
| `observability` | Métriques Prometheus, temps de réponse, en-têtes `Cache-Control`, erreurs du site, santé |

Les routes sont documentées dans Swagger (`/api/docs`). Préfixe : `/api/v1`.

### Gardes globales (dans l'ordre)

1. **Limitation de fréquence** par adresse IP (120 requêtes/min par défaut, limites plus strictes sur la connexion, l'inscription, les signalements, les QR codes et les envois de fichiers).
2. **Contrôle d'origine** (anti-CSRF) : toute requête modifiant des données et portant un en-tête `Origin` doit venir d'une origine autorisée (`CORS_ORIGINS`, `WEB_URL`).
3. **Authentification et rôles** : la session est lue dans le cookie httpOnly, l'utilisateur et son rôle sont chargés **depuis la base** à chaque requête. `@Public()` ouvre une route aux visiteurs et `@Roles()` la restreint.

Les contrôles de propriété sont faits dans les services. Un vendeur ne charge que les objets de **sa** boutique (`shopId` déduit de sa session, jamais transmis par le client). Une ressource d'un autre vendeur répond 404, ce qui ne révèle pas son existence.

### Validation

`ValidationPipe` (`whitelist` + `forbidNonWhitelisted`) : tout champ inconnu, comme `role`, est refusé. Les erreurs sont renvoyées par champ (`errors: { champ: message }`) pour l'affichage dans les formulaires. Les contraintes critiques sont doublées en base (`CHECK`, unicités, index partiel).

## Modèle de données

Fichier : `backend/prisma/schema.prisma`. Les migrations sont dans `backend/prisma/migrations`.

| Table | Points notables |
|---|---|
| `User` | rôle `CUSTOMER`/`SELLER`/`ADMIN`, statut, e-mail et téléphone uniques (E.164), mot de passe scrypt |
| `Session` | empreinte SHA-256 du jeton, expiration, révocation |
| `PasswordResetToken` | empreinte, 1 h, usage unique |
| `Shop` | slug unique, statut, `pendingChanges` (nom/WhatsApp à valider), badges `validatedAt` / `identityVerifiedAt`, note agrégée |
| `Brand`, `Category` | gérées par l'administration, `featured` pour l'accueil |
| `Product` | référence publique `TM-XXXXXX` aléatoire, prix entier FCFA, `status` (publication) ≠ `availability` (disponibilité), `removedAt` (retrait administratif), `specs` JSON, `searchText` indexé en trigrammes |
| `ProductMedia` | 3 images + 1 vidéo par produit (contrôlé sous verrou), une seule image principale (index partiel unique) |
| `PriceHistory` | chaque changement de prix habituel ; base du prix de référence |
| `Promotion`, `PromotionEvent` | prix de référence figé, dates, statut ; historique des événements |
| `ProductFavorite`, `ShopFavorite` | clé primaire composite : pas de doublon |
| `Sale` | vente déclarée, HMAC du numéro de l'acheteur, statut, résultats des contrôles (`flags`) |
| `ReviewToken` | empreinte du jeton QR, expiration, tentatives, révocation |
| `Review` | `saleId` unique (un avis par vente), note 1-5 (`CHECK`), statut de modération, statut de vérification |
| `Report`, `AuditLog` | signalements (un par personne et par contenu), journal des actions sensibles |
| `ProductDailyStat` | consultations et clics WhatsApp par jour (Africa/Lome) |

Les montants sont des entiers en FCFA. Les dates sont stockées en UTC (`timestamptz`) et affichées en `Africa/Lome` (UTC+0, sans heure d'été).

## Sécurité — récapitulatif

- **Mots de passe** : scrypt (N=32768), comparaison à temps constant, temps de réponse égalisé si le compte n'existe pas.
- **Sessions** : jeton aléatoire de 256 bits dans un cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production. Seule son empreinte est stockée. Les sessions sont révocables : déconnexion, changement de mot de passe, suspension.
- **Administrateurs** : créés uniquement par `pnpm admin:create` (aucune route HTTP). Un administrateur ne peut ni se suspendre ni suspendre un autre administrateur depuis l'interface.
- **Fichiers** :
  - le type réel est lu dans les premiers octets du fichier, jamais dans l'extension ;
  - les images sont décodées puis ré-encodées en WebP : les métadonnées EXIF et GPS sont supprimées, et un faux fichier image est rejeté ;
  - les noms de fichiers sont aléatoires et les clés de stockage validées ;
  - en stockage local, les fichiers sont servis avec `nosniff` et une CSP `sandbox`.
- **Liens sociaux** : `https` uniquement, domaine vérifié par réseau, sans identifiants intégrés à l'URL.
- **Données privées** : les réponses publiques n'exposent jamais propriétaire, e-mails, modifications en attente ou motifs internes. Les auteurs d'avis sont affichés « Prénom N. ».
- **Journalisation** : les mots de passe, jetons et numéros d'acheteurs ne sont jamais écrits dans les journaux ni dans l'audit.
- **En-têtes** : Helmet côté API, `X-Frame-Options`, `nosniff`, `Referrer-Policy` côté site.

## Site (`frontend`)

- `src/app/(site)` : pages publiques avec en-tête, pied de page et barre d'onglets mobile.
- `src/app/vendeur`, `src/app/admin` : espaces privés (`SellerShell`, `AdminShell`).
- `src/components` : composants partagés. Bibliothèque d'icônes unique : Lucide. Les logos de marques tierces (WhatsApp, Facebook…) sont des SVG maison au même gabarit.
- `src/lib/api-server.ts` / `api-client.ts` : clients de l'API, côté serveur et côté navigateur.
- `src/config/brand.ts` : identité de la plateforme.

### Accessibilité et performance

- Libellés associés aux champs et erreurs annoncées (`role="alert"`) ; focus visible ; lien d'évitement ; boutons nommés ; notes données aussi en texte.
- `prefers-reduced-motion` respecté globalement (CSS) et par le carrousel (pas de défilement automatique).
- Police auto-hébergée (aucune requête vers Google), images pré-compressées en WebP (1600 px et vignette 480 px), chargement différé, vidéos `preload="none"`.
- Photos réduites dans le navigateur avant l'envoi (2000 px) pour économiser les données mobiles ; progression d'envoi affichée.
- Catalogue paginé côté serveur, filtres en formulaire GET (fonctionnent sans JavaScript), paramètres conservés dans l'URL.

## Traitements asynchrones

- **File** : table `Job` (`PENDING` → `RUNNING` → `DONE` / `FAILED`), prise par `SELECT … FOR UPDATE SKIP LOCKED` : plusieurs workers peuvent tourner sans traiter deux fois la même tâche.
- Tentatives avec délai croissant ; `PermanentJobError` arrête immédiatement (fichier corrompu, secret refusé) ; une tâche `RUNNING` depuis plus de 10 min (processus tué) est reprise.
- Tâches périodiques protégées par `pg_try_advisory_xact_lock` (une seule exécution par période, quel que soit le nombre de workers) : `media.cleanup`, `promotions.boundaries`.
- Processus : `pnpm --filter backend start:worker`. En développement, la file tourne aussi dans l'API (`WORKER_IN_PROCESS`, vrai par défaut hors production) ; en test, les médias sont traités immédiatement (`MEDIA_PROCESSING=inline`).
- Outil : `pnpm --filter backend maintenance -- --drain` (exécute les tâches en attente), `-- --cleanup` (nettoyage des fichiers).

## Médias

1. `POST /seller/products/:id/media/uploads` : propriété, type déclaré, taille, puis réservation d'une place sous verrou de la ligne produit (médias non échoués + envois en cours non expirés ≤ 3 photos / 1 vidéo). La réponse contient l'autorisation d'envoi direct : formulaire POST signé pour un seul identifiant (Cloudinary), URL PUT présignée avec type et taille signés (S3/R2), ou jeton à usage unique vers `PUT /api/v1/uploads/:token` (local).
2. Le navigateur envoie le fichier directement au stockage, avec suivi de la progression.
3. `POST …/uploads/:uploadId/complete` : taille réelle (HEAD), lecture des 64 premiers octets (type réel), puis création du média `PROCESSING` et d'une tâche `media.process`. Un fichier non conforme est refusé et supprimé.
4. Worker :
   - **image** : rotation EXIF, suppression des métadonnées, variantes WebP 1600 / 960 / 480 px ;
   - **vidéo** (ffmpeg) : durée (refus au-delà de `MEDIA_MAX_VIDEO_SECONDS`), miniature, transcodage H.264/AAC ≤ 1280 px avec `faststart`.
   Le média passe `READY` ; l'original est supprimé. En cas d'échec : `FAILED` avec un motif affiché au vendeur.
5. Seuls les médias `READY` sont publics, et la publication exige une photo `READY`.
6. **Fichiers orphelins** : un déclencheur SQL copie les clés de tout `ProductMedia` supprimé (y compris en cascade) dans `StorageGarbage` ; le worker supprime ensuite ces fichiers s'ils ne sont plus référencés, ainsi que les envois expirés.

L'ancien envoi multipart (`POST …/media`) est conservé pour compatibilité ; il suit le même traitement.

## Cache

| Couche | Ce qui est mis en cache | Invalidation |
|---|---|---|
| CDN des médias | fichiers (clés immuables) | aucune nécessaire : une nouvelle version a une nouvelle clé |
| Site (cache de données Next.js) | réponses publiques de l'API, par étiquette | `POST /api/revalidate` appelé par l'API (immédiat, puis file de reprise), borne `CACHE_MAX_SECONDS` |
| API → CDN | `GET` publics anonymes : `public, s-maxage=PUBLIC_CACHE_SECONDS` | expiration courte |
| API (mémoire) | nombre total de résultats d'une recherche du catalogue (30 s) | expiration |
| Jamais | réponses authentifiées, espaces vendeur et admin, `Set-Cookie` | `private, no-store` |

Événements invalidants : modification, publication, retrait, stock d'un produit ; statut, nom, logo d'une boutique (toutes ses fiches) ; création, modification, arrêt d'une promotion et son début ou sa fin (vérification chaque minute) ; publication ou masquage d'un avis ; création, modification, suppression d'une publicité de l'accueil, et son début ou sa fin programmés.

## Observabilité

- `GET /api/v1/metrics` (format Prometheus, protégé par `METRICS_TOKEN`) : durée des requêtes par route, requêtes lentes, pool Prisma, file de tâches, échecs d'envoi, erreurs d'authentification, erreurs du site, ressources du processus.
- Journaux structurés `http_slow`, `http_error`, `slow_query`, `job_error`, `client_error`, sans données personnelles ni secrets.
- `GET /api/v1/health/live` (processus) et `GET /api/v1/health` (base + état de la file).
- Voir [EXPLOITATION.md](EXPLOITATION.md) pour les alertes.

## Performance de la base

- Liste du catalogue : index partiels `Product_listing_recent_idx` (tri par défaut) et `Product_popular_idx`, index trigramme sur `searchText`, CTE `running_promotions` en jointure par hachage (au lieu d'une sous-requête latérale exécutée pour chaque ligne), comptage séparé et mis en cache.
- Pagination bornée : au-delà de `PAGINATION_MAX_OFFSET` (5 000 lignes), l'API répond 400 ; on affine alors la recherche.
- Pool : `connection_limit` dans `DATABASE_URL` (voir [DEPLOIEMENT.md §1](DEPLOIEMENT.md)).
