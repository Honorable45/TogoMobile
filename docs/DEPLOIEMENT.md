# Déploiement

## Vue d'ensemble

```
Navigateur ──► Cloudflare (DNS, TLS, protection) ──► Vercel : frontend/ (site public, espace vendeur)
     │                                             └─► Vercel : admin/ (administration, admin.<domaine>)
     │                                                   │  /api/v1/* relayé
     │                                                   ▼
     │                                            Render : API NestJS (1..N instances) ──► PostgreSQL managé
     │                                                   │                        ▲
     │                                            Render : worker ─────────────────┘ (file de tâches)
     │                                                   │
     └── envoi direct des fichiers (formulaire signé) ──► Cloudinary ──► diffusion des médias (CDN res.cloudinary.com)
```

| Composant | Service proposé | Rôle |
|---|---|---|
| Site | Vercel, projet `togomobile-frontend` (dossier `frontend/`) | pages publiques (avec cache), espace vendeur, relais `/api/v1`, webhook `/api/revalidate` |
| Administration | Vercel, projet `togomobile-admin` (dossier `admin/`) | modération, validation, journal d'audit ; domaine distinct, jamais indexé, jamais mis en cache |
| API | Render, service web (`pnpm --filter backend start:prod`) | règles métier, sécurité ; sans état, mise à l'échelle horizontale |
| Worker | Render, background worker (`pnpm --filter backend start:worker`) | traitement des médias, invalidation du cache, nettoyage, début et fin des promotions |
| Base | PostgreSQL 14+ managé (Render, Neon, Supabase…) | données ; file de tâches |
| Médias | Cloudinary (ou Cloudflare R2 / S3) | photos et vidéos, jamais sur le disque des instances |
| Redis (facultatif) | Render Key Value, Upstash… | compteurs de limitation de débit partagés |
| E-mails | Resend | réinitialisation du mot de passe |

Le disque des hébergeurs n'est pas persistant : `STORAGE_DRIVER=local` et `MAIL_DRIVER=console` sont **refusés au démarrage en production**.

## Liste de contrôle avant la mise en production

| # | Action | Où |
|---|---|---|
| 1 | Premier commit Git, dépôt poussé sur GitHub/GitLab | dépôt |
| 2 | `pnpm verify` réussi (types, tests de l'API, builds des trois applications) | poste ou CI |
| 3 | Base PostgreSQL managée avec PITR ; `DATABASE_URL` avec `sslmode=require&connection_limit=…` | §1 |
| 4 | Compte Cloudinary, `CLOUDINARY_URL` copiée | §2 |
| 5 | Variables générées (`pnpm env:prepare -- --env production --domain <domaine>`), complétées, vérifiées (`pnpm env:check -- deploy/secrets/production`), rangées dans un coffre | §0 |
| 6 | Render : API + worker depuis `render.yaml`, variables saisies | §3 |
| 7 | Vercel : projet `frontend` et projet `admin`, variables saisies avant le build | §4, §4 bis |
| 8 | DNS Cloudflare : `www`, `admin`, `api`, `media` ; SSL « Full (strict) » | §5 |
| 9 | `pnpm --filter backend seed` (référentiels) puis `pnpm admin:create` | §1, §6 |
| 10 | Vérifications du §7 ; moniteur externe sur `/api/v1/health` ; alertes | §7, EXPLOITATION.md |
| 11 | Sauvegarde hors hébergeur planifiée, premier test de restauration consigné | EXPLOITATION.md |
| 12 | Test de charge sur la préproduction | TESTS.md |

Commande à lancer avant chaque mise en production :

```bash
pnpm verify    # types des 3 applications + 145 tests de l'API (base *_test) + builds
```

## 0. Variables d'environnement

Le script `scripts/prepare-env.mjs` produit les trois fichiers d'un environnement : `backend.env` (API et worker Render), `frontend.env` et `admin.env` (projets Vercel).

```bash
pnpm env:prepare -- --env production --domain <domaine>   # → deploy/secrets/production/{backend,frontend,admin}.env
pnpm env:prepare -- --env staging --domain <domaine>      # → deploy/secrets/staging/…
pnpm env:check -- deploy/secrets/production               # contrôle avant déploiement
```

**Sans domaine** (démarrage) : `pnpm env:prepare -- --env production --no-domain` utilise les adresses gratuites des hébergeurs.
- Pour obtenir ces adresses, nommez les projets Vercel `togomobile` et `togomobile-admin`, et gardez les noms de service de `render.yaml` (`togomobile-api`) :

| | Adresse |
|---|---|
| Site | `https://togomobile.vercel.app` |
| Admin | `https://togomobile-admin.vercel.app` |
| API | `https://togomobile-api.onrender.com` |
| Médias | CDN Cloudinary (`res.cloudinary.com`) |

- Si un nom est déjà pris, l'hébergeur ajoute un suffixe : régénérez alors avec `--force --site-url … --admin-url … --api-url …`. `--force` remplace aussi les secrets ; ne l'utilisez qu'avant la mise en service.
- Limites tant qu'il n'y a pas de domaine :
  - Resend n'envoie les e-mails (mot de passe oublié) qu'à l'adresse du titulaire du compte ;
  - les médias restent sur l'adresse de Cloudinary (`res.cloudinary.com`), ce qui ne pose pas de problème.

  Passez à un domaine avant d'ouvrir le service au public, avec `--domain`.

Ce que fait le script :
- **secrets générés** aléatoirement (`APP_SECRET` 64 caractères, `REVALIDATE_SECRET`, `METRICS_TOKEN`), différents pour la production et la préproduction, et identiques là où ils doivent l'être (`REVALIDATE_SECRET` dans l'API et le site) ;
- **adresses déduites du domaine** :

| | Production | Préproduction |
|---|---|---|
| Site | `https://www.<domaine>` (`--site-host @` : domaine nu) | `https://staging.<domaine>` |
| Admin | `https://admin.<domaine>` | `https://admin-staging.<domaine>` |
| API | `https://api.<domaine>` | `https://api-staging.<domaine>` |
| Médias | `https://media.<domaine>` | `https://media-staging.<domaine>` |

- **ne remplit pas** ce qui dépend de vos comptes. Ces lignes sont marquées `À RENSEIGNER` : `DATABASE_URL`, `CLOUDINARY_URL` (ou les clés R2 avec `--storage r2`), `RESEND_API_KEY` (et `REDIS_URL` si besoin) ;
- **n'écrase jamais** des fichiers existants, car `APP_SECRET` ne doit jamais changer (`--force` pour forcer).

Le contrôle (`env:check`) vérifie :
- que les valeurs obligatoires sont présentes et que les URL sont en HTTPS ;
- la longueur des secrets, et les valeurs interdites en production (stockage local, e-mails en console, données de démonstration) ;
- la cohérence entre les trois applications : même API, même cookie, même secret d'invalidation, adresses du site et de l'admin.

Utilisation :
1. **Render** : groupe de variables `togomobile-shared` → « Add from .env » → coller `backend.env`.
2. **Vercel** : chaque projet → Settings → Environment Variables → coller `frontend.env` ou `admin.env` (environnement *Production*, ou *Preview* pour la préproduction).
3. Ranger le dossier dans un coffre (gestionnaire de mots de passe), puis le supprimer du poste.

`deploy/secrets/` est ignoré par Git. Les modèles sans secret sont dans `deploy/examples/`.

## Environnements

| | Développement | Préproduction | Production |
|---|---|---|---|
| Base | locale (`togomobile`) | base dédiée, **copie anonymisée** ou données de recette | base de production |
| Bucket | stockage local | bucket `togomobile-media-staging` | bucket `togomobile-media` |
| Domaines | localhost | `staging.<domaine>`, `api-staging.<domaine>` | `www.<domaine>`, `api.<domaine>`, `media.<domaine>` |
| Secrets | `.env` locaux | jeux de secrets distincts | jeux de secrets distincts |
| Données de démonstration | oui | possible (`ALLOW_DEMO_SEED=true`) | **jamais** |

Vercel : utiliser les environnements *Preview* (préproduction) et *Production*, chacun avec ses variables. Render : dupliquer `render.yaml` avec des noms suffixés `-staging`. Aucune variable n'est partagée entre préproduction et production.

## 1. Base de données

1. Créer une base PostgreSQL 14+ ; récupérer l'URL avec `?sslmode=require`.
2. **Pool de connexions** : chaque processus Prisma ouvre au plus `connection_limit` connexions. Total = instances API × `WEB_CONCURRENCY` × `connection_limit` + worker × `connection_limit`. Ce total doit rester sous la limite de l'offre PostgreSQL (souvent 97 à 400). Exemple : 3 instances × 1 processus × 10 + worker 5 = 35. Au-delà, placer **PgBouncer** en mode transaction (proposé par Neon et Supabase) et ajouter `&pgbouncer=true` à `DATABASE_URL`.
3. L'extension `pg_trgm` est activée par la première migration (disponible chez la plupart des hébergeurs).
4. Référentiels : `DATABASE_URL=… pnpm --filter backend seed` (idempotent).

### Migrations sûres

- Appliquées par `preDeployCommand` (`pnpm --filter backend deploy:migrate` = `prisma migrate deploy`) : une fois par déploiement, avant la bascule. Si elles échouent, l'ancienne version reste en ligne. **Elles ne sont plus lancées au démarrage de chaque instance.**
- `prisma migrate deploy` n'est jamais destructif par lui-même et ne réinitialise jamais la base. N'utilisez jamais `migrate dev` ni `migrate reset` sur une base partagée.
- Règle d'évolution (« étendre puis contracter ») :
  1. une migration **ajoute** (colonne facultative ou avec valeur par défaut, table, index) ;
  2. le code déployé utilise les deux formes ;
  3. une migration ultérieure retire l'ancien élément.
  Ainsi la version en cours reste compatible pendant le déploiement.
- Index sur grosses tables : `CREATE INDEX CONCURRENTLY` en dehors de la migration Prisma (qui s'exécute dans une transaction), puis migration `IF NOT EXISTS`.
- Avant une migration à risque : sauvegarde manuelle (§8) et essai sur la préproduction.

## 2. Stockage des médias (Cloudinary)

Les photos, vidéos et logos sont stockés sur **Cloudinary** et diffusés par son CDN (`res.cloudinary.com`), jamais sur le disque des serveurs.

1. Créer un compte sur cloudinary.com (l'offre gratuite suffit pour démarrer).
2. Settings → **API Keys** → copier la variable d'environnement `CLOUDINARY_URL` (`cloudinary://<api_key>:<api_secret>@<cloud_name>`).
3. Variables (API et worker) :

```
STORAGE_DRIVER=cloudinary
CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
CLOUDINARY_FOLDER=togomobile          # togomobile-staging pour la préproduction
```

Aucun réglage CORS n'est nécessaire : l'API d'envoi de Cloudinary accepte les formulaires signés depuis n'importe quel site.

### Organisation dans Cloudinary

```
togomobile/
├── uploads/<produit>/…          originaux en attente de traitement (supprimés après traitement)
├── products/<produit>/…         photos (3 tailles WebP), vidéos H.264, miniatures
└── shops/<boutique>/logo-….webp logos des boutiques
```

Photos et miniatures sont des ressources *image* ; les vidéos, des ressources *video*.

Les fichiers sont servis **tels quels** : les variantes sont produites par le worker (sharp, ffmpeg), et aucune transformation Cloudinary n'est utilisée. Seuls le stockage et la bande passante consomment des crédits.

### Fonctionnement des envois

1. Le navigateur demande une autorisation : `POST /seller/products/:id/media/uploads` avec le type et la taille. L'API vérifie le propriétaire et la limite (3 photos, 1 vidéo), puis réserve la place.
2. L'API répond par un **formulaire signé**, valable pour un seul identifiant de fichier. Le secret d'API ne quitte jamais le serveur.
3. Le navigateur envoie le fichier directement à Cloudinary, avec une barre de progression : le fichier ne transite pas par l'API.
4. Finalisation : l'API vérifie la taille réelle et les premiers octets (type réel). Un fichier plus gros que déclaré, ou d'un autre type, est refusé et supprimé de Cloudinary.
5. Le worker produit les variantes, puis le média passe « prêt ». En cas d'échec, il passe « échec », avec la raison affichée au vendeur.

**Nettoyage** : les envois non finalisés expirent. Les fichiers des médias supprimés, y compris en cascade (produit, boutique), sont collectés par un déclencheur SQL (`StorageGarbage`), puis supprimés de Cloudinary par le worker.

**Limites de l'offre gratuite** (à vérifier sur la page tarifs de Cloudinary, elles évoluent) :
- quota mensuel de crédits partagé entre le stockage et la bande passante ;
- taille maximale par fichier (de l'ordre de 10 Mo pour une image et 100 Mo pour une vidéo).

Les limites de TogoMobile (8 Mo par photo, 40 Mo par vidéo) restent en dessous. Suivez la consommation dans le tableau de bord Cloudinary (Usage).

### Alternative : Cloudflare R2 (ou tout stockage S3)

`pnpm env:prepare -- … --storage r2` génère les variables correspondantes. Étapes :
1. Créer le bucket, un domaine public (`media.<domaine>`, ou l'adresse `r2.dev` pour démarrer), et un jeton « Object Read & Write » limité au bucket.
2. Ajouter la **règle CORS** du bucket, indispensable à l'envoi direct :

```json
[{ "AllowedOrigins": ["https://www.<domaine>"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
```

3. Variables : `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION=auto`, `S3_ENDPOINT=https://<ID_COMPTE>.r2.cloudflarestorage.com`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`.

Avec R2, la taille exacte fait partie de la signature, car l'envoi se fait par une URL PUT présignée. Ajoutez une règle de cycle de vie sur `uploads/` (2 jours).

**ffmpeg** (miniature, durée maximale, transcodage H.264) : le paquet facultatif `ffmpeg-static` télécharge un binaire à l'installation, ou indiquez `FFMPEG_PATH`. Sans ffmpeg, les vidéos sont validées (signature, taille) mais diffusées sans transcodage ni miniature, et sont marquées `transcoded=false`.

## 3. API et worker sur Render

Utiliser le blueprint `render.yaml` : un service web `togomobile-api` et un worker `togomobile-worker`, avec un groupe de variables partagé.

| Réglage | API | Worker |
|---|---|---|
| Build | `corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm --filter backend build` | identique |
| Pré-déploiement | `pnpm --filter backend deploy:migrate` | — |
| Démarrage | `pnpm --filter backend start:prod` | `pnpm --filter backend start:worker` |
| Santé | `/api/v1/health` (prêt) ; `/api/v1/health/live` (vivant) | — |

Montée en charge :
- **plusieurs instances API** (sans état) : définir `REDIS_URL` pour partager les compteurs de limitation de débit ;
- **`WEB_CONCURRENCY`** : un processus par cœur sur une instance multi-cœur ;
- **plusieurs workers** sont possibles : la file utilise `FOR UPDATE SKIP LOCKED`, et les tâches périodiques sont protégées par un verrou consultatif.

Si Redis devient injoignable, l'API bascule sur des compteurs en mémoire, par instance, et continue de servir le trafic.

`APP_SECRET` sert au HMAC des numéros d'acheteurs : ne le changez jamais. Swagger est désactivé en production, sauf `SWAGGER_ENABLED=true`.

## 4. Site sur Vercel

1. Projet sur `frontend` (Root Directory).
2. Variables, à définir **avant** le build (le relais `/api/v1` est figé au build) :

```
API_URL=https://api.<domaine>
NEXT_PUBLIC_SITE_URL=https://www.<domaine>
SESSION_COOKIE_NAME=tm_session
REVALIDATE_SECRET=<même valeur que l'API>
CACHE_MAX_SECONDS=300
```

### Cache des pages publiques

- Avec `REVALIDATE_SECRET` défini des deux côtés et `WEB_REVALIDATE_URL=https://www.<domaine>/api/revalidate` côté API, les pages publiques sont mises en cache par étiquette :
  - les fiches produit sont rendues à la première visite puis servies depuis le cache (5 ms mesurés, contre 73 ms au premier rendu) ;
  - l'API invalide **immédiatement** les étiquettes concernées (produit, boutique, catalogue) à chaque changement de prix, de disponibilité, de boutique, de promotion ou d'avis, puis au début et à la fin de chaque promotion (vérification toutes les minutes) ;
  - un appel d'invalidation qui échoue est retenté par le worker, et `CACHE_MAX_SECONDS` borne le retard dans le pire cas.
- Sans `REVALIDATE_SECRET` : les données publiques ne sont gardées qu'une seconde.
- Les espaces vendeur, admin, compte et favoris ne sont jamais mis en cache : rendu côté client, et réponses API en `private, no-store`.

## 4 bis. Administration sur Vercel

1. **Second projet** Vercel sur le même dépôt, Root Directory `admin`.
2. Variables (avant le build) :

```
API_URL=https://api.<domaine>
NEXT_PUBLIC_SITE_URL=https://www.<domaine>
SESSION_COOKIE_NAME=tm_session
```

3. Domaine `admin.<domaine>`. Côté API et worker : `ADMIN_URL=https://admin.<domaine>` (ajoutée automatiquement aux origines autorisées). Côté site : `NEXT_PUBLIC_ADMIN_URL=https://admin.<domaine>` (lien du menu, et redirection des anciennes adresses `/admin`).
4. Laisser `SESSION_COOKIE_DOMAIN` **vide** : la session de l'administration reste limitée à `admin.<domaine>` et n'est pas partagée avec le site.
5. Recommandé : protéger `admin.<domaine>` en plus avec Cloudflare Access (liste d'e-mails autorisés) ou une restriction d'IP. Les droits restent de toute façon vérifiés par l'API (rôle `ADMIN`).
6. « Ignored Build Step » de chaque projet Vercel, pour ne reconstruire que l'application modifiée : `git diff --quiet HEAD^ HEAD -- .`

## 5. Domaines, CDN et cookies

```
www.<domaine>   → Vercel      NEXT_PUBLIC_SITE_URL, WEB_URL, CORS_ORIGINS
admin.<domaine> → Vercel      NEXT_PUBLIC_ADMIN_URL, ADMIN_URL
api.<domaine>   → Render      API_URL
```

- Le navigateur n'appelle que le domaine du site. Le cookie de session reste first-party (`SameSite=Lax`, `HttpOnly`, `Secure`).
- **Cloudflare** :
  - mode SSL « Full (strict) » ;
  - médias : `Cache-Control: public, max-age=31536000, immutable`, déjà posé à l'envoi (règle « Cache Everything » sur `media.<domaine>`) ;
  - API : ne cacher que ce que l'API autorise (Cloudflare respecte `s-maxage` ; toutes les réponses authentifiées sont `private, no-store`) ;
  - ne jamais activer « Cache Everything » sur `www` ni sur `api` ;
  - activer la protection contre les robots et la limitation de débit de Cloudflare sur `/api/v1/auth/*`.
- **Adresse IP des clients** (limitation de débit) : régler `TRUST_PROXY_HOPS` selon la chaîne de proxys (2 par défaut : Vercel puis Render). Vérification : connecté en administrateur, `GET /api/v1/admin/debug/client-ip` doit afficher votre propre IP publique.

## 6. Premier administrateur

```bash
pnpm admin:create -- --email admin@<domaine> --name "Prénom Nom"
```

Le mot de passe est demandé sans être affiché (12 caractères minimum), ou fourni par `ADMIN_PASSWORD` en non interactif. Aucune route HTTP ne permet d'obtenir ce rôle.

## 7. Vérifier un déploiement

1. `GET https://api.<domaine>/api/v1/health` → `status: ok`, `database: ok`, `jobs.failedLastHour: 0`.
2. Page d'accueil, catalogue, une fiche produit, une boutique.
3. `https://admin.<domaine>` : connexion administrateur, tableau de bord ; un compte vendeur y est refusé ; `https://www.<domaine>/admin` redirige vers l'administration.
4. Connexion vendeur, puis ajout d'une photo : elle passe « en traitement » puis « prête » en quelques secondes, ce qui confirme que le worker et Cloudinary fonctionnent.
5. Modifier un prix : la fiche publique affiche le nouveau prix immédiatement (invalidation).
6. `GET /api/v1/metrics` avec `Authorization: Bearer $METRICS_TOKEN` répond.
7. Journaux Render : aucun `http_error` ni `job_error` en boucle.

## 8. Retour à une version précédente

- **Code** : Vercel (« Promote » d'un déploiement précédent) et Render (« Rollback ») redéploient une version antérieure en quelques secondes.
- **Base** : les migrations n'étant qu'additives, l'ancienne version du code fonctionne avec le nouveau schéma, et aucun retour de schéma n'est nécessaire. Si une migration de contraction (suppression) a déjà été appliquée, restaurez une sauvegarde (voir [EXPLOITATION.md](EXPLOITATION.md)) avant de revenir à une version qui utilisait l'élément supprimé.
- Après un retour arrière, vider le cache du site si nécessaire (redéploiement Vercel).

## 9. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| L'API refuse de démarrer : « STORAGE_DRIVER=local est interdit en production » | stockage non configuré | configurer Cloudinary (§2) |
| Envoi de photo refusé par le stockage | `CLOUDINARY_URL` erronée (signature refusée) ou quota Cloudinary atteint ; avec R2 : CORS du bucket absent | §2 ; tableau de bord Cloudinary → Usage |
| Photos bloquées « en traitement » | worker arrêté ou en échec | journaux du worker ; `GET /health` → `jobs` ; `pnpm --filter backend maintenance -- --drain` |
| Prix pas à jour sur le site | invalidation non configurée ou secret différent | `WEB_REVALIDATE_URL`, `REVALIDATE_SECRET` identiques des deux côtés ; tâches `web.revalidate` en échec dans la table `Job` |
| 403 « Origine de la requête non autorisée » | domaine absent de `CORS_ORIGINS` | ajouter l'origine exacte |
| 429 pour tous les visiteurs | IP mal détectée | `TRUST_PROXY_HOPS` (§5) |
| « Too many connections » | pool trop grand | réduire `connection_limit`, ou PgBouncer (§1) |
| Vidéo refusée « trop longue » | durée > `MEDIA_MAX_VIDEO_SECONDS` | augmenter la limite ou raccourcir la vidéo |
| Photo iPhone refusée | HEIC non converti | régler l'appareil photo sur « Le plus compatible » |
