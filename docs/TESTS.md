# Tests

## API — Jest (`backend/test`)

```bash
pnpm --filter backend test            # tout (unitaires + intégration)
pnpm --filter backend test:unit
pnpm --filter backend test:e2e
```

- Les tests d'intégration démarrent l'application NestJS complète (gardes, validation, filtres) et l'interrogent par HTTP avec supertest, sur une **vraie base PostgreSQL**.
- Base utilisée : `TEST_DATABASE_URL`, ou à défaut la base de `backend/.env` suffixée `_test` (`togomobile_test`). Elle doit exister (`CREATE DATABASE togomobile_test;`). Les migrations sont appliquées automatiquement. **Les tests refusent de s'exécuter si le nom de la base ne finit pas par `_test`** : toutes les tables sont vidées à chaque fichier.
- Les fichiers sont écrits dans un dossier temporaire ; aucun service externe n'est appelé. Les tests vidéo utilisent ffmpeg (`ffmpeg-static`) ; les tests Redis démarrent un `redis-server` local s'il est installé, sinon ils apparaissent comme ignorés (« skipped ») dans le résultat.

| Fichier | Couvre |
|---|---|
| `unit/rules.spec.ts` | numéros +228, wa.me, normalisation de recherche, calcul de réduction, prix de référence, validation des dates, phases de promotion, détection du type réel des fichiers, liens sociaux, contrôles automatiques des ventes |
| `e2e/products.spec.ts` | produit valide, prix et état invalides, 4ᵉ photo et 2ᵉ vidéo refusées (y compris en envois simultanés), faux fichier image, publication, accès refusé aux produits d'un autre vendeur, média d'un autre produit, stock, retrait, disponibilité, boutiques en attente et suspendues |
| `e2e/promotions.spec.ts` | création, prix invalides, dates incohérentes, prix de référence non gonflable, produit indisponible, chevauchement, activation à la date prévue, expiration automatique, désactivation et historique, modification réservée aux promotions programmées, arrêt sur changement de prix, suspension administrative, même prix sur 7 surfaces |
| `e2e/favorites.spec.ts` | ajout, suppression, doublons (y compris simultanés), isolation entre utilisateurs, boutiques suivies |
| `e2e/reviews.spec.ts` | jeton opaque, empreinte seule stockée, jeton valide/inconnu/expiré/révoqué/annulé/déjà utilisé, verrouillage après tentatives répétées, limitation de fréquence, avis sans éligibilité, avis admissible et note moyenne, plusieurs avis, 4 soumissions simultanées, vendeur sur sa propre boutique, vente suspecte, vente contestée puis vérifiée, annulation interdite après avis, aucun droit du vendeur sur les avis, commentaire avec numéro, référence en double, date future, plafond de ventes, tableau de bord |
| `e2e/scale.spec.ts` | envoi direct présigné (local), variantes WebP, réservation des places sous concurrence, type/taille non conformes, expiration, image corrompue, vidéo (durée, miniature, transcodage ffmpeg), file de tâches (tentatives, erreurs définitives, concurrence), modération et vendeur de confiance, corrections demandées, verrouillage de compte, en-têtes de cache, invalidation immédiate et reprise en file, suspension de boutique, pagination bornée, métriques, santé, fichiers orphelins en cascade, erreurs du site, limitation de débit partagée par Redis et repli en mémoire |
| `e2e/security.spec.ts` | accès à l'administration (401/403), rôle imposé à l'inscription, rôle non modifiable, cookie httpOnly, messages génériques, déconnexion, changement de mot de passe, réinitialisation à usage unique, compte suspendu, limitation de fréquence, CSRF, boutique invisible avant validation, liens sociaux dangereux, changements sensibles soumis à validation, isolation des boutiques, logo, absence de données internes, lien WhatsApp, santé |

## Site — Playwright (`frontend/e2e`)

Prérequis : API, site et administration démarrés, données de démonstration chargées (`pnpm --filter backend seed:demo`), commande `pnpm` disponible (le global setup crée un administrateur de test avec `admin:create`).

```bash
E2E_BASE_URL=http://localhost:3000 E2E_ADMIN_URL=http://localhost:3001 pnpm --filter frontend test:e2e
# navigateur déjà présent sur la machine :
CHROME_PATH=/chemin/vers/chrome E2E_BASE_URL=… pnpm --filter frontend test:e2e
# sinon : pnpm --filter frontend exec playwright install chromium
```

| Fichier | Couvre |
|---|---|
| `public.spec.ts` | accueil, recherche tolérante, fiche, filtres combinés conservés dans l'URL puis réinitialisés, catalogue vide, lien WhatsApp (bon numéro, référence, prix, lien), page boutique, carrousel (5 s, pause, réduction des animations), 404, redirection des espaces privés |
| `journey.spec.ts` | parcours complet en 15 étapes : inscription vendeur → validation admin → produit en étapes avec photo → publication → catalogue → boutique → promotion (même prix partout) → favoris → vente → QR code → avis vérifié (mauvais numéro refusé, code à usage unique) → modération et journal d'audit ; refus d'accès vendeur à l'administration |
| `mobile.spec.ts` | barre de navigation mobile, panneau de filtres, barre de commande collante, carrousel tactile, absence de défilement horizontal sur les pages principales |

Les tests de parcours créent des données (comptes en `@test.togomobile`, boutique, produit) sur la base utilisée par l'API. Elles sont supprimées automatiquement à la fin (`pnpm --filter backend seed:clear-e2e`, appelé par le teardown Playwright). Lancez-les sur une base de développement ou de recette, jamais en production.

## Tests de charge — k6 (`loadtest/`)

**Jamais sur la production sans autorisation et plan de protection.** Utiliser une base dédiée.

```bash
# 1. base de mesure : 100 000 annonces synthétiques, 200 boutiques, 5 000 promotions
createdb togomobile_perf && DATABASE_URL=…/togomobile_perf pnpm --filter backend deploy:migrate
psql …/togomobile_perf -f loadtest/seed-perf.sql
# 2. API (paliers 10 → 50 → 100 → 200 utilisateurs virtuels) ou charge constante
k6 run -e BASE=http://localhost:4500/api/v1 loadtest/catalog.js
k6 run -e BASE=… -e MODE=constant -e VUS=100 -e DURATION=60s loadtest/catalog.js
# 3. pages du site
k6 run -e BASE=http://localhost:3500 -e VUS=50 loadtest/pages.js
```

Pour les tests, relever `RATE_LIMIT_PER_MINUTE` sur l'API mesurée (tous les utilisateurs virtuels partagent une IP). Les résultats mesurés sont dans [RAPPORT-OPTIMISATION.md](RAPPORT-OPTIMISATION.md).
