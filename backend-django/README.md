# API TogoMobile en Django (migration en cours)

Réécriture de `backend/` (NestJS + Prisma) en **Django + Django REST Framework**, sur **la même base PostgreSQL** :
les tables restent gérées par les migrations Prisma (`managed = False`), et les deux API peuvent tourner côte à côte.
Les adresses et les réponses JSON sont identiques à l'API Node : le site Next.js fonctionne sans modification.

## Avancement

| Module | État |
|---|---|
| Catalogue public : accueil, recherche, fiche, similaires, avis publics, clic WhatsApp, vues | ✅ identique à Node (`scripts/compare_api.py` : 26/26) |
| Comptes et sessions (`/auth/*`) | à faire |
| Boutiques publiques, favoris, signalements | à faire |
| Espace vendeur : produits, médias, promotions, ventes | à faire |
| Avis par QR code (vérification, dépôt) | à faire |
| Administration (modération, publicités, référentiels, statistiques) | à faire |
| Tâches de fond (file `Job`), purge du stockage | à faire |

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
Propres à Django : `DJANGO_SECRET_KEY` (obligatoire en production), `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`.

## Vérifier l'équivalence avec l'API Node

Les deux API sur la même base (Node sur le port 4000, Django sur le port 8000) :

```bash
.venv/bin/python scripts/compare_api.py http://localhost:4000 http://localhost:8000
```

Le script compare statut et JSON champ par champ, sur une trentaine d'adresses (tris, filtres, recherche, erreurs).
