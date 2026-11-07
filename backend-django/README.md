# API TogoMobile en Django (migration en cours)

Réécriture de `backend/` (NestJS + Prisma) en **Django + Django REST Framework**, sur **la même base PostgreSQL** :
les tables restent gérées par les migrations Prisma (`managed = False`), et les deux API peuvent tourner côte à côte.
Les adresses et les réponses JSON sont identiques à l'API Node : le site Next.js fonctionne sans modification.

## Avancement

| Module | État |
|---|---|
| Catalogue public : accueil, recherche, fiche, similaires, avis publics, clic WhatsApp, vues | ✅ identique à Node (`scripts/compare_api.py` : 42/42 avec les boutiques) |
| Comptes et sessions (`/auth/*`) : mots de passe et cookie compatibles | ✅ (`scripts/compare_auth.py` : 19/19) |
| Boutiques publiques (`/shops`, `/shops/:slug`) | ✅ identique à Node (dans `compare_api.py`) |
| Favoris (`/me/favorites/*`) | ✅ (`scripts/compare_favorites.py` : 22/22, ajouts et retraits croisés entre les deux API) |
| Signalements | à faire |
| Espace vendeur : produits, médias, promotions, ventes | à faire |
| Avis par QR code (vérification, dépôt) | à faire |
| Administration (modération, publicités, référentiels, statistiques) | à faire |
| Tâches de fond (file `Job`), purge du stockage | à faire |

## Pendant la migration : relais vers l'API Node

Avec `LEGACY_API_URL=http://localhost:4000` (adresse de l'API Node), toute route pas encore réécrite en Django
est transmise à l'API Node : le site reste entièrement utilisable. À retirer quand tout sera migré.

## Sécurité

- Limitation de débit par IP pour tous, connectés compris (`RATE_LIMIT_PER_MINUTE`, plus des limites propres à la
  connexion, l'inscription et les mots de passe). IP lue derrière `TRUST_PROXY_HOPS` proxys de confiance (1 par défaut,
  comme l'API Node) : un faux `X-Forwarded-For` ne contourne pas la limite.
- Verrouillage du compte après `LOGIN_MAX_FAILURES` échecs, pendant `LOGIN_LOCK_MINUTES`.
- Requêtes modifiantes venues d'une autre origine refusées ; CORS limité à `CORS_ORIGINS` et `ADMIN_URL`.
- En-têtes : nosniff, X-Frame-Options, Referrer-Policy, COOP ; HSTS et redirection HTTPS en production.
- Corps JSON limités à 200 Ko ; erreurs internes jamais détaillées au client.
- Paramètres d'adresse inconnus refusés (400 « Champ non autorisé »), comme le ValidationPipe Node.
- `DB_CONN_MAX_AGE` : connexions PostgreSQL persistantes (60 s par défaut en production, 0 en `DJANGO_DEBUG` :
  le serveur de développement ouvre un fil par requête et saturerait PostgreSQL).
- `python scripts/security_check.py` : tests d'attaque de base (attendre une minute entre deux exécutions).

## Lancer en local

```bash
cd backend-django
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
export DATABASE_URL=postgresql://utilisateur:motdepasse@localhost:5432/togomobile   # même base que backend/
DJANGO_DEBUG=1 API_URL=http://localhost:4000 WEB_URL=http://localhost:3000 .venv/bin/python manage.py runserver 8000
```

Puis lancer le site sur cette API : `API_URL=http://localhost:8000 pnpm --filter frontend dev`.

Variables reprises de l'API Node : `DATABASE_URL`, `API_URL`, `WEB_URL`, `STORAGE_DRIVER` (`local`, `s3`, `cloudinary`),
`S3_PUBLIC_URL`, `CLOUDINARY_URL`, `CLOUDINARY_FOLDER`, `PAGINATION_MAX_OFFSET`, `REDIS_URL`.
Comptes : `APP_SECRET` (même valeur que Node), `SESSION_COOKIE_NAME`, `SESSION_COOKIE_DOMAIN`, `SESSION_COOKIE_SAMESITE`,
`SESSION_DAYS`, `LOGIN_MAX_FAILURES`, `LOGIN_LOCK_MINUTES`, `CORS_ORIGINS`, `ADMIN_URL`, `MAIL_DRIVER`, `MAIL_FROM`, `RESEND_API_KEY`.
Propres à Django : `DJANGO_SECRET_KEY` (obligatoire en production), `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`.

## Vérifier l'équivalence avec l'API Node

Les deux API sur la même base (Node sur le port 4000, Django sur le port 8000) :

```bash
.venv/bin/python scripts/compare_api.py http://localhost:4000 http://localhost:8000
```

Le script compare statut et JSON champ par champ, sur une trentaine d'adresses (tris, filtres, recherche, erreurs).
