# TogoMobile

Marketplace de téléphones pour les boutiques du Togo : catalogue commun, boutiques personnalisées, promotions datées, avis vérifiés par QR code et commande directe auprès du vendeur sur WhatsApp. La plateforme n'encaisse aucun paiement.

| Dossier | Rôle | Technologies |
|---|---|---|
| `backend/` | API REST, règles métier, sécurité, worker de traitements | NestJS 11, Prisma 6, PostgreSQL 16, sharp, ffmpeg, qrcode |
| `frontend/` | Site public et espace vendeur | Next.js 16 (App Router), React 19, Tailwind CSS 4, Lucide |
| `admin/` | Administration (application séparée, domaine `admin.<domaine>`) | Next.js 16, React 19, Tailwind CSS 4 |
| `docs/` | Architecture, règles métier, déploiement, tests | — |

## Démarrage rapide (développement)

Prérequis : Node.js 20.12+ (22 recommandé), pnpm 9 (`corepack enable`), PostgreSQL 14+.

```bash
pnpm install

# 1. Configuration
cp backend/.env.example backend/.env           # renseigner DATABASE_URL
cp frontend/.env.example frontend/.env.local   # API_URL=http://localhost:4000
cp admin/.env.example admin/.env.local         # API_URL=http://localhost:4000

# 2. Base de données
pnpm db:migrate                       # applique les migrations
pnpm --filter backend seed                # marques et catégories
pnpm --filter backend seed:demo           # + données de démonstration (affiche les identifiants une seule fois)

# 3. Premier administrateur (le mot de passe est demandé sans être affiché)
pnpm admin:create -- --email admin@exemple.tg --name "Prénom Nom"

# 4. Lancer l'API (port 4000), le site (port 3000) et l'administration (port 3001)
pnpm dev
```

- Site : http://localhost:3000
- Administration : http://localhost:3001
- API : http://localhost:4000/api/v1
- Documentation de l'API (Swagger) : http://localhost:4000/api/docs
- Santé : http://localhost:4000/api/v1/health

Une base PostgreSQL jetable avec Docker ou Podman :

```bash
docker run -d --name togomobile-pg -e POSTGRES_USER=togomobile -e POSTGRES_PASSWORD=togomobile_dev \
  -e POSTGRES_DB=togomobile -p 127.0.0.1:5432:5432 postgres:16-alpine
```

## Commandes

| Commande | Effet |
|---|---|
| `pnpm dev` | API, site et administration en mode développement |
| `pnpm env:prepare -- --env production --domain <domaine>` / `pnpm env:check -- deploy/secrets/production` | Génère / vérifie les variables de déploiement des trois applications |
| `pnpm verify` | Avant un déploiement : types, tests de l'API, builds des trois applications |
| `pnpm build` | Build de production des trois applications |
| `pnpm --filter backend deploy:migrate` | Applique les migrations (une fois par déploiement, jamais au démarrage) |
| `pnpm --filter backend start:prod` | Démarre l'API compilée (`WEB_CONCURRENCY` processus) |
| `pnpm --filter backend start:worker` | Démarre le worker (médias, invalidation du cache, nettoyage) |
| `pnpm --filter backend maintenance -- --drain` / `--cleanup` | Exécute les tâches en attente / nettoie les fichiers orphelins |
| `./scripts/backup-db.sh` / `./scripts/restore-check.sh <fichier>` | Sauvegarde / test de restauration dans une base temporaire |
| `pnpm --filter frontend start` | Démarre le site compilé |
| `pnpm db:migrate` | Crée/applique les migrations (développement) |
| `pnpm --filter backend seed` / `seed:demo` / `seed:clear` | Référentiels / démonstration / suppression des données de démonstration |
| `pnpm admin:create -- --email … --name …` | Crée ou promeut un administrateur |
| `pnpm --filter backend test` | Tests unitaires et d'intégration de l'API (base `*_test`) |
| `pnpm --filter frontend test:e2e` | Tests de bout en bout Playwright (site + API démarrés) |
| `k6 run loadtest/catalog.js` | Test de charge (base dédiée ; voir docs/TESTS.md) |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — organisation, modèle de données, sécurité, API
- [docs/REGLES-METIER.md](docs/REGLES-METIER.md) — promotions, prix de référence, ventes, avis vérifiés et leurs limites
- [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) — environnements, Vercel, Render (API + worker), PostgreSQL, Cloudinary (ou R2/S3), CDN, retour arrière, dépannage
- [docs/EXPLOITATION.md](docs/EXPLOITATION.md) — sauvegardes, RPO/RTO, restauration, surveillance, alertes, coûts
- [docs/AUDIT.md](docs/AUDIT.md) et [docs/RAPPORT-OPTIMISATION.md](docs/RAPPORT-OPTIMISATION.md) — audit et mise à niveau pour la montée en charge
- [docs/TESTS.md](docs/TESTS.md) — stratégie et exécution des tests
- [docs/DESIGN.md](docs/DESIGN.md) — système visuel et règles d'interface

## Identité et charte

Le nom, l'accroche, les photos facultatives et les liens officiels sont centralisés dans `frontend/src/config/brand.ts`. La charte visuelle (papier, encre, bleu nuit, ocre, verre dépoli) est déclarée une seule fois dans `frontend/src/app/globals.css` : jetons `@theme` et utilitaires `glass`, `glass-light`, `glass-dark`, `display`, `eyebrow`, `num`, `reveal-word`, `container-page`. Les polices (Newsreader, IBM Plex Sans, IBM Plex Mono) sont auto-hébergées. Voir [docs/DESIGN.md](docs/DESIGN.md). Aucun badge de certification ou de partenariat de marque n'est affiché : les seuls badges (« Boutique validée », « Identité vérifiée », « Achat vérifié ») reflètent des contrôles réellement effectués par la plateforme.
# TogoMobile
