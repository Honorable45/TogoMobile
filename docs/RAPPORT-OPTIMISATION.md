# Rapport d'optimisation et de mise à niveau — TogoMobile

Date : 23 octobre 2026. Ce rapport fait suite à [AUDIT.md](AUDIT.md) : les numéros (#1 à #18) renvoient aux problèmes qui y sont décrits.

> **Ce que ce rapport n'affirme pas.** Aucune capacité en nombre d'utilisateurs n'est garantie. Les mesures ci-dessous ont été faites sur **un seul ordinateur portable**, où tournaient en même temps l'API, PostgreSQL, le générateur de charge, un navigateur et l'éditeur. Elles servent à comparer avant et après, et à repérer le premier goulot d'étranglement. Elles ne prédisent pas le comportement d'une infrastructure de production. Les services externes (R2, Vercel, Render, Redis managé, Resend) **ne sont pas configurés** : l'intégration est prête, mais les actions restantes sont listées au §7.

## 1. Problèmes détectés

Le détail est dans [AUDIT.md §2](AUDIT.md). En résumé :

| Gravité | Problèmes |
|---|---|
| Critique | #1 fichiers transitant en mémoire par l'API (jusqu'à 40 Mo par vidéo) |
| Haute | #2 traitement d'image synchrone ; #3 vidéos sans durée, miniature ni statut ; #6 validation d'une boutique valant validation de tous ses futurs produits ; #8 pas de verrouillage par compte ; #10 aucun `Cache-Control` ; #11 aucune page publique en cache ; #12 migrations au démarrage de chaque instance ; #15 aucune métrique ; #16 sauvegardes jamais testées |
| Moyenne | #4 fichiers orphelins ; #5 images non adaptées au mobile ; #7 pas de statut « corrections demandées » ; #9 limitation de débit non partagée ; #13 N+1 dans l'administration ; #14 pagination sans plafond ; #17 pas de préproduction ni de retour arrière ; #18 pool non dimensionné |

Problèmes découverts pendant l'intervention :
- **Catalogue lent à volume réel** : avec 100 000 annonces, le calcul des promotions en cours (sous-requête `LATERAL`) s'exécutait 85 715 fois par page, soit 650 ms dans PostgreSQL.
- **Build de l'API pouvant ne rien produire** : si `dist/` était supprimé (`nest build`, nettoyage), le fichier incrémental de TypeScript restait en place, et `pnpm build` se terminait avec succès **sans générer** `dist/main.js`. Corrigé.
- **Fichier statique manquant → erreur 500** : un média absent renvoyait 500 au lieu de 404. Corrigé.

## 2. Corrections effectuées

### Médias (#1 à #5)
- **Envoi direct** du navigateur au stockage par URL PUT présignée. Avec S3/R2, le type et la taille exacte sont signés. L'API ne reçoit plus le fichier : elle autorise, puis vérifie la taille réelle et les 64 premiers octets.
- **Réservation des places** (3 photos, 1 vidéo) sous verrou de la ligne produit, envois en cours compris : la limite tient même en cas d'envois simultanés (testé).
- **États des médias** `PROCESSING` → `READY` / `FAILED`, avec motif affiché au vendeur. Seuls les médias `READY` sont publics, et la publication exige une photo `READY`.
- **File de tâches PostgreSQL** (pas de nouveau service) et **worker séparé** : tentatives avec délai croissant, erreurs définitives, reprise des tâches interrompues, tâches périodiques à exécution unique.
- **Images** : trois variantes WebP (1600, 960 et 480 px), métadonnées supprimées. Le site utilise `srcset`/`sizes`, des dimensions explicites et une image de repli.
- **Vidéos** (ffmpeg) : durée maximale (`MEDIA_MAX_VIDEO_SECONDS`), miniature, transcodage H.264/AAC ≤ 1280 px avec `faststart`. Sans ffmpeg, la vidéo est conservée sans transcodage et marquée comme telle.
- **Fichiers orphelins** : un déclencheur SQL recueille les clés de tout média supprimé, y compris par cascade (suppression d'un produit ou d'une boutique), et le worker supprime les fichiers qui ne sont plus référencés. Les envois non finalisés expirent. L'ancien logo d'une boutique est aussi supprimé.

### Règles métier et sécurité (#6 à #10)
- **Modération des annonces** (`PENDING` / `APPROVED` / `REJECTED`, motif). La validation d'une boutique ne valide plus ses futures annonces ; seul le statut **vendeur de confiance**, accordé explicitement par l'administration, les publie sans modération. Les annonces déjà publiées ont été marquées `APPROVED` par la migration : aucune n'a disparu du site. L'administration dispose d'un onglet « À valider ».
- **Statut de boutique `CHANGES_REQUESTED`** (motif obligatoire). Le vendeur voit un bandeau, et toute modification remet la demande en attente.
- **Libellés de vérification d'achat** alignés sur les statuts : « Achat en cours de vérification », « Achat vérifié », « Contestée — suspicion de fraude », « Annulée — achat non vérifié ».
- **Verrouillage par compte** après 8 échecs (15 min), en plus de la limite par IP, avec un message générique, un audit et une métrique.
- **Limitation de débit partageable** via Redis (script Lua atomique). Si Redis est injoignable, l'API bascule automatiquement sur des compteurs en mémoire.
- **`Cache-Control`** : `private, no-store` pour toute réponse authentifiée ou portant un cookie ; `public, s-maxage` configurable pour les lectures publiques anonymes.

### Cache (#11)
- Cache des données publiques du site par étiquette (`product:<slug>`, `shop:<slug>`, `catalog`, `home`, `promotions`). Les fiches produit sont régénérées à la demande (ISR).
- **Invalidation ciblée** par l'API à chaque changement : prix, stock, disponibilité, publication, statut ou profil de boutique (toutes ses fiches), promotion, avis. L'appel direct est immédiat ; en cas d'échec, il est mis en file et retenté.
- **Début et fin des promotions** : vérification chaque minute, car aucune écriture ne se produit à ces instants-là. `CACHE_MAX_SECONDS` borne le retard dans le pire cas.
- Aucune page privée n'est mise en cache.

### Backend et base (#13, #14, #18)
- Requête du catalogue réécrite : CTE `running_promotions` en jointure par hachage, jointure des marques seulement si un filtre l'exige, recherche texte en CTE matérialisée sur l'index trigramme, comptage séparé et mis en cache 30 s.
- Index partiels vérifiés par `EXPLAIN ANALYZE` : `Product_listing_recent_idx`, `Product_popular_idx`, trigramme `Product_searchText_trgm` (déclaré dans le schéma pour que Prisma ne tente plus de le supprimer).
- N+1 supprimés : signalements de l'administration (cibles chargées par lot) et promotions (comptage au lieu de l'historique complet).
- Pagination plafonnée (`PAGINATION_MAX_OFFSET`, 400 au-delà).
- Journal des requêtes lentes ; pool dimensionné par `connection_limit`, avec une règle de calcul et une recommandation PgBouncer.
- Mode multi-processus (`WEB_CONCURRENCY`).

### Observabilité (#15)
- `GET /api/v1/metrics` (Prometheus, jeton) : latence par route, erreurs, requêtes lentes, pool Prisma, file de tâches, échecs d'envoi, échecs d'authentification, erreurs du site, CPU, mémoire, latence de la boucle d'événements.
- Journaux structurés sans données personnelles. Remontée des erreurs du site (`POST /client-errors`, limité en débit et en taille).
- Santé séparée : `/health/live` (vivant) et `/health` (base + file de tâches).

### Déploiement et résilience (#12, #16, #17)
- Migrations en **pré-déploiement**, une seule fois et avant la bascule ; `start:prod` ne migre plus.
- Worker Render dans `render.yaml` ; environnements développement, préproduction et production décrits ; procédure de retour arrière ; règle « étendre puis contracter » pour les migrations.
- `scripts/backup-db.sh` (sauvegarde + empreinte + rétention) et `scripts/restore-check.sh` (restauration dans une base temporaire puis vérification), **tous deux exécutés avec succès**. RPO/RTO définis dans [EXPLOITATION.md](EXPLOITATION.md).

## 3. Fichiers modifiés

**API — nouveaux**
- `src/jobs/jobs.service.ts`, `src/worker.ts`, `scripts/maintenance.ts`
- `src/media/uploads.controller.ts`
- `src/cache/revalidation.service.ts`
- `src/observability/metrics.ts`, `src/observability/observability.module.ts`
- `src/common/redis-throttler.storage.ts`
- `test/e2e/scale.spec.ts`

**API — modifiés**
- Schéma : `prisma/schema.prisma`
- Configuration et démarrage : `src/config/env.ts`, `src/app.module.ts`, `src/bootstrap.ts`, `src/main.ts`, `src/prisma/prisma.service.ts`
- Stockage et médias : `src/storage/storage.service.ts`, `src/media/media.service.ts`, `src/media/media-processing.ts`
- Produits : `src/products/seller-products.controller.ts`, `src/products/seller-products.service.ts`, `src/products/product.dto.ts`, `src/products/product-presenter.ts`, `src/products/public-products.service.ts`
- Catalogue et pagination : `src/catalog/catalog.service.ts`, `src/common/visibility.ts`, `src/common/pagination.ts`
- Comptes, administration, boutiques, promotions, avis, santé : `src/auth/auth.service.ts`, `src/admin/admin.service.ts`, `src/admin/admin.controller.ts`, `src/shops/shops.service.ts`, `src/promotions/promotions.service.ts`, `src/reviews/review-verification.service.ts`, `src/health/health.controller.ts`
- Build et paquets : `package.json`, `tsconfig.build.json`
- Tests : `test/setup-env.ts`, `test/helpers.ts`, `test/e2e/products.spec.ts`

**Site**
- Nouveaux : `src/app/api/revalidate/route.ts`, `src/components/error-reporter.tsx`, `src/components/product/fallback-img.tsx`
- Modifiés :
  - `src/lib/api-server.ts`, `src/lib/types.ts`, `src/lib/format.ts`
  - `src/components/product/gallery.tsx`, `src/components/product/product-card.tsx`
  - `src/components/seller/product-editor.tsx` (envoi direct, progression, états), `src/components/seller/types.tsx`, `src/components/seller/seller-shell.tsx`
  - les pages d'administration (produits, boutiques, promotions)
  - les pages publiques étiquetées (accueil, catalogue, fiche produit, boutique, promotions, boutiques), `layout`, `error.tsx`
  - `e2e/journey.spec.ts`

**Racine**
- Nouveaux : `scripts/backup-db.sh`, `scripts/restore-check.sh`, `loadtest/seed-perf.sql`, `loadtest/catalog.js`, `loadtest/pages.js`
- Configuration : `render.yaml`, `backend/.env.example`, `frontend/.env.example`
- Documentation : `README.md`, `docs/AUDIT.md`, `docs/ARCHITECTURE.md`, `docs/REGLES-METIER.md`, `docs/DEPLOIEMENT.md`, `docs/EXPLOITATION.md`, `docs/TESTS.md`

## 4. Migrations

Toutes sont **additives** : aucune suppression de colonne, de table ni de donnée. Elles ont été appliquées par `prisma migrate deploy`, sans réinitialisation, sur les bases de développement, de test et de mesure. `prisma migrate diff` ne montre aucun écart avec le schéma.

| Migration | Contenu |
|---|---|
| `20261023123923_scale_media_moderation` | `User.failedLoginCount`/`lockedUntil` ; statut `CHANGES_REQUESTED` ; `Shop.trustedSeller` ; modération des produits (annonces existantes non brouillon → `APPROVED`) ; champs de traitement des médias (statut, variantes, durée) ; tables `MediaUpload`, `Job`, `StorageGarbage` ; déclencheur de collecte des fichiers ; index unique sur la clé des médias |
| `20261023150000_catalog_listing_index` | index partiel du tri par défaut du catalogue |
| `20261023160000_popular_index` | index partiel du tri « populaires » |

En production, sur une table `Product` volumineuse, créez d'abord les deux index avec `CREATE INDEX CONCURRENTLY` (même nom), avant le déploiement. La migration utilise `IF NOT EXISTS` et ne les recréera pas. Voir [DEPLOIEMENT.md §1](DEPLOIEMENT.md).

## 5. Tests exécutés et résultats

### 5.1 Fonctionnels et sécurité

| Suite | Avant | Après | Résultat |
|---|---|---|---|
| Jest API (vraie base PostgreSQL) | 119 | **145** | 145/145 réussis (52 s) |
| Playwright (Chromium, ordinateur et mobile) | 24 | 24 (adaptés à la modération et au traitement asynchrone) | 24/24 réussis |
| TypeScript strict (API, site) | — | — | aucune erreur |
| Build de production (API, site) | — | — | réussi |

Le projet n'a pas de configuration ESLint : aucune vérification ESLint n'a été exécutée ni désactivée.

Les 26 nouveaux tests (`scale.spec.ts`) couvrent :
- **envois** : envoi direct, variantes, réservations simultanées, type ou taille non conformes, expiration, image corrompue ;
- **vidéo** : durée, miniature, transcodage, avec un vrai ffmpeg ;
- **file de tâches** : tentatives, erreurs définitives, concurrence ;
- **règles métier** : modération, vendeur de confiance, corrections demandées ;
- **sécurité** : verrouillage de compte, limitation partagée par un vrai `redis-server`, puis repli quand Redis est arrêté ;
- **cache** : en-têtes, invalidation immédiate et reprise en file, suspension de boutique invalidant ses fiches ;
- **exploitation** : pagination bornée, métriques protégées, santé, fichiers orphelins après cascade, erreurs du site.

**Non testé contre le service réel** :
- envoi présigné vers un vrai bucket R2/S3 : le code S3 est écrit selon l'API officielle, mais seul le pilote local a été exécuté ;
- cache de données de Vercel : le comportement a été vérifié avec `next start` en local ;
- Redis managé ; Resend.

### 5.2 Requêtes (base de mesure : 100 000 annonces, 200 boutiques, 5 000 promotions, 100 000 médias)

| Requête | Avant | Après |
|---|---|---|
| Catalogue, tri par défaut (requête HTTP complète) | 680 ms | 157 ms au premier appel (page : 0,5 ms dans PostgreSQL ; comptage : 53 ms, puis mis en cache) |
| Catalogue, filtre promotions / réduction | 790 ms | 73 ms |
| Catalogue, tri par note | 720 ms | 73 ms |
| Catalogue, prix croissant | — | 87 ms |
| Tri « populaires » (PostgreSQL) | 51 ms (parcours séquentiel) | 0,26 ms |
| Fiche produit (API) | — | 19 ms |
| Fiche produit (site) | rendue à chaque visite | 73 ms à la première visite, puis 5 ms (cache) |

### 5.3 Charge (k6)

Machine : un portable de 12 fils d'exécution et 14 Go de RAM, avec la mémoire d'échange pleine. API, PostgreSQL 16 (conteneur Podman), site et k6 tournaient sur la même machine, en même temps que le navigateur et l'éditeur. Le scénario mélange catalogue, filtres, recherche, fiches, boutiques et promotions, avec une longue traîne de produits.

**API, charge constante (60 s par palier)**

| Utilisateurs virtuels | Débit | Médiane | 95e centile | Erreurs |
|---|---|---|---|---|
| 10 | 13 req/s | 21 ms | 169 ms | 0 % |
| 50 | 65 req/s | 18 ms | 173 ms | 0 % |
| 100 | 110 req/s | 24 ms | 605 ms | 0 % |
| 200 | 133 req/s | 113 ms | **3,98 s** | 0 % |

**API, montée progressive (10 → 50 → 100 → 200)** : environ 93 req/s, aucune erreur, médiane 55 à 90 ms, 95e centile 1,5 à 1,8 s. **Le seuil fixé (95e centile < 800 ms) n'est pas atteint** au palier de 200.

Passer de 1 à 4 processus API (pool de 10 chacun, Redis) **n'a rien apporté** : le goulot était PostgreSQL, sur la même machine (jusqu'à 46 connexions actives, requêtes lentes en série). Le premier processus utilisait déjà 130 à 168 % de CPU.

**Pages du site (cache par étiquettes)**

| Utilisateurs virtuels | Débit | Médiane | 95e centile | Erreurs |
|---|---|---|---|---|
| 50 | 22 pages/s | 87 ms | 764 ms | 0 % |
| 100 | 41 pages/s | — | 1,34 s | 0 % |
| 200 | 52 pages/s | — | 3,63 s | 0 % |

**Interprétation honnête**
- Sur cette machine, le système reste stable et sans erreur jusqu'à environ 100 requêtes API par seconde avec des temps corrects. Au-delà, la latence se dégrade sans que des erreurs apparaissent.
- Ces chiffres ne se transposent pas directement à la production : base dédiée, CPU non partagés, CDN devant les médias et cache Vercel réparti géographiquement.
- Pour connaître la capacité réelle, refaites ces tests **en préproduction**, sur l'infrastructure cible, avec `loadtest/` ([TESTS.md](TESTS.md)).

### 5.4 Sauvegarde et restauration

| Base | Sauvegarde | Restauration + vérification |
|---|---|---|
| développement | 92 Ko | 1 s |
| mesure (122 Mo, 100 000 annonces) | 6 Mo en 1,5 s | 6 s |

## 6. Variables d'environnement ajoutées

**API et worker** (détails dans `backend/.env.example`)

| Variable | Défaut | Rôle |
|---|---|---|
| `MEDIA_MAX_VIDEO_SECONDS` | 90 | durée maximale des vidéos |
| `MEDIA_UPLOAD_TTL_SECONDS` | 900 | validité d'une URL d'envoi |
| `MEDIA_PROCESSING` | `queue` (`inline` en test) | traitement par le worker ou dans la requête |
| `FFMPEG_PATH`, `MEDIA_TRANSCODE_VIDEO` | binaire `ffmpeg-static`, `true` | vidéo |
| `WORKER_IN_PROCESS` | `true` en développement, `false` en production | file exécutée dans l'API |
| `WORKER_CONCURRENCY`, `WORKER_POLL_MS` | 2, 1000 | worker |
| `WEB_CONCURRENCY` | 1 | processus par instance |
| `REDIS_URL` | vide | limitation de débit partagée |
| `RATE_LIMIT_PER_MINUTE` | 120 | limite globale par IP |
| `PAGINATION_MAX_OFFSET` | 5000 | profondeur maximale |
| `PUBLIC_CACHE_SECONDS` | 0 | `s-maxage` des lectures publiques |
| `WEB_REVALIDATE_URL`, `REVALIDATE_SECRET` | vides | invalidation du cache du site (secret d'au moins 24 caractères) |
| `METRICS_TOKEN` | vide (désactivé) | accès à `/metrics` |
| `SLOW_QUERY_MS`, `SLOW_REQUEST_MS` | 500, 1500 | seuils des journaux |
| `LOGIN_MAX_FAILURES`, `LOGIN_LOCK_MINUTES` | 8, 15 | verrouillage de compte |

**Site** : `REVALIDATE_SECRET` (identique à l'API), `CACHE_MAX_SECONDS` (300).

## 7. Actions manuelles restantes

Ces actions demandent des comptes, des secrets ou des décisions que je n'ai pas. Aucune valeur n'a été inventée.

1. **Premier commit Git** : le dépôt n'en a aucun. Une archive de l'état antérieur se trouve hors du dépôt, dans le dossier de travail de la session.
2. **Cloudflare R2** : bucket, jeton limité au bucket, domaine `media.<domaine>`, **règle CORS PUT** ([DEPLOIEMENT.md §2](DEPLOIEMENT.md)), règle de cycle de vie sur `uploads/`. Ensuite, tester un envoi réel en préproduction.
3. **Render** : créer les services à partir de `render.yaml`, saisir les secrets, choisir les offres (PostgreSQL avec PITR).
4. **Vercel** : variables, dont `REVALIDATE_SECRET`, et domaine.
5. **Générer** `APP_SECRET`, `REVALIDATE_SECRET` et `METRICS_TOKEN`, puis les conserver dans un coffre.
6. **Redis managé** si plus d'une instance ou plus d'un processus.
7. **Surveillance** : collecte Prometheus, moniteur externe de `/health`, alertes ([EXPLOITATION.md §4](EXPLOITATION.md)).
8. **Sauvegardes hors hébergeur** : planifier `backup-db.sh` et la copie vers un stockage séparé ; test de restauration trimestriel.
9. **Préproduction** : refaire les tests de charge sur l'infrastructure cible.
10. Si la base de production contient déjà beaucoup d'annonces, créer les index en `CONCURRENTLY` avant le déploiement (§4).
11. Prévenir les vendeurs que les nouvelles annonces passent par la modération, sauf pour les vendeurs de confiance.

## 8. Risques restants

| Risque | Niveau | Mesure |
|---|---|---|
| Code S3/R2 présigné jamais exécuté contre un vrai bucket | moyen | test en préproduction avant toute mise en production |
| PostgreSQL, premier goulot mesuré | moyen | instance dédiée, PgBouncer, réplica de lecture si nécessaire |
| La modération ajoute un délai de publication | moyen (métier) | statut vendeur de confiance ; surveiller la file « À valider » |
| Prisma signale la fonction `metrics` comme dépréciée | faible | les métriques HTTP et de file ne dépendent pas de Prisma ; à remplacer lors du passage à Prisma 7 |
| `ffmpeg-static` télécharge un binaire à l'installation | faible | si le réseau du build l'interdit, installer ffmpeg et définir `FFMPEG_PATH` ; sinon, vidéos non transcodées |
| Comptage du catalogue en cache 30 s par instance | faible | le total affiché peut être en retard de 30 s ; les résultats eux-mêmes ne le sont pas |
| Pagination par décalage | faible | plafonnée ; passer à une pagination par curseur si le catalogue dépasse quelques centaines de milliers d'annonces |
| Médias envoyés après l'instant d'une restauration de la base | faible | deviennent orphelins dans R2 ; inventaire du bucket ([EXPLOITATION.md §2.5](EXPLOITATION.md)) |
| Vérification d'achat | inchangé | la plateforme n'encaisse pas : elle ne peut pas prouver une vente ([REGLES-METIER.md](REGLES-METIER.md)) |

## 9. Améliorations à prévoir avant une forte croissance

1. Tests de charge en préproduction, objectif chiffré (par exemple, 95e centile < 500 ms à N req/s), puis dimensionnement.
2. PgBouncer et réplica de lecture pour le catalogue ; `pg_stat_statements` suivi chaque semaine.
3. Moteur de recherche dédié (Meilisearch, Typesense) si la recherche texte devient le premier coût.
4. Pagination par curseur pour le catalogue et l'administration.
5. Cache CDN de l'API (`PUBLIC_CACHE_SECONDS`) derrière Cloudflare, après mesure du taux de réussite du cache.
6. Traçage distribué (OpenTelemetry) entre site, API et worker.
7. Worker vidéo dédié, avec plus de CPU, si le volume de vidéos augmente.
8. Passage à Prisma 7 (configuration `prisma.config.ts`, métriques).
9. Intégration continue : tests Jest et Playwright à chaque modification, avec PostgreSQL en service.

## 10. Coûts potentiels à surveiller

Le détail est dans [EXPLOITATION.md §5](EXPLOITATION.md). En résumé :
- **stockage R2**, dominé par les vidéos : environ 300 Ko par photo (3 variantes) ; à suivre avec `togomobile_storage_uploaded_bytes_total` ;
- **opérations R2** (écritures à chaque variante) ;
- **rendus et bande passante Vercel**, réduits par le cache ;
- **instances Render** : API, worker, et taille de la base avec PITR ;
- **CPU du worker** pour le transcodage vidéo ;
- **Redis managé**, s'il est activé ;
- **e-mails Resend**.
