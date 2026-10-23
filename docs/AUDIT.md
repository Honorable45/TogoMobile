# Audit technique de TogoMobile

Date : 23 octobre 2026. Périmètre : l'intégralité du dépôt (`apps/api`, `apps/web`, `docs`, configuration de déploiement).

## 1. État constaté

| Élément | Constat |
|---|---|
| Dépôt Git | initialisé, **aucun commit**. Une archive de l'état avant intervention a été faite hors du dépôt. Recommandation : faire un premier commit avant toute mise en production. |
| Frontend | Next.js 16.4 (App Router, Turbopack), React 19.3, Tailwind 4. Trois espaces (public, vendeur, admin) dans une seule application, qui partagent la même API. |
| Backend | NestJS 11, Prisma 6.19, PostgreSQL 16, une seule API REST (`/api/v1`). |
| Authentification | Sessions opaques en base (cookie httpOnly, empreinte SHA-256) ; pas de JWT. Rôles `CUSTOMER`/`SELLER`/`ADMIN` lus en base à chaque requête. |
| Stockage | Abstraction `StorageService` (local en dev, S3/R2 en production). Images converties en WebP (1600 px + vignette 480 px). |
| Tests | 119 tests API (Jest, base PostgreSQL réelle), 24 tests Playwright. |
| Déploiement | `render.yaml` (API), Vercel (site) documenté. |

Fonctionnalités opérationnelles : catalogue, recherche, filtres, fiches, boutiques, promotions, favoris, WhatsApp, ventes déclarées, QR codes, avis vérifiés, modération, statistiques.

## 2. Problèmes détectés

Classement : **C** critique, **H** haute, **M** moyenne, **B** basse. Le « risque de régression » est celui de la correction elle-même.

| # | Domaine | Problème | Gravité | Risque de régression |
|---|---|---|---|---|
| 1 | Médias / performance | Les fichiers transitent intégralement par l'API (`multer` en mémoire, jusqu'à 40 Mo par vidéo). Quelques envois simultanés suffisent à saturer la mémoire d'une petite instance. | **C** | moyen |
| 2 | Médias | Le traitement des images (sharp) est synchrone dans la requête HTTP ; aucune file de traitement. | H | moyen |
| 3 | Médias | Vidéos : aucune limite de durée, aucune miniature, aucun transcodage ; le statut « prêt » n'existe pas. | H | faible |
| 4 | Médias | Aucun nettoyage des fichiers orphelins (envoi interrompu, suppression de boutique, suppression en cascade des produits). | M | faible |
| 5 | Images | Deux tailles seulement ; la galerie charge la version 1600 px même sur mobile ; pas de `srcset` ni de dimensions explicites. | M | faible |
| 6 | Règle métier | La validation d'une boutique rend **tous ses futurs produits** publiables sans contrôle. | H | moyen |
| 7 | Règle métier | Aucun statut « corrections demandées » pour les boutiques. | M | faible |
| 8 | Sécurité | La limitation des tentatives de connexion se fait seulement par IP : une attaque distribuée sur un compte n'est pas freinée. | H | faible |
| 9 | Sécurité / échelle | Compteurs de limitation de débit en mémoire : ils ne sont pas partagés entre plusieurs instances de l'API. | M | faible |
| 10 | Cache | Aucun en-tête `Cache-Control` sur l'API : réponses privées non marquées `no-store`, réponses publiques non cachables. | H | faible |
| 11 | Cache | Pages publiques rendues à chaque requête, sans cache. C'était voulu pour la cohérence des prix, mais tout le trafic finit sur l'API et PostgreSQL. | H | moyen |
| 12 | Déploiement | `start:prod` lance `prisma migrate deploy` au démarrage de **chaque** instance : migrations concurrentes, et un redémarrage peut appliquer une migration non prévue. | H | faible |
| 13 | Requêtes | N+1 : l'admin des signalements lance 1 requête par ligne ; l'admin des promotions charge tout l'historique de chaque promotion. | M | faible |
| 14 | Requêtes | Pagination par décalage sans plafond de profondeur : un `page=1000` force PostgreSQL à parcourir 60 000 lignes. | M | faible |
| 15 | Observabilité | Aucune mesure des temps de réponse, du taux d'erreur ni des requêtes lentes ; erreurs frontend non remontées. Le contrôle de santé ne distingue pas « vivant » et « prêt ». | H | faible |
| 16 | Résilience | Sauvegardes documentées mais jamais testées ; pas de script de vérification de restauration ; RPO/RTO non définis. | H | faible |
| 17 | Déploiement | Pas d'environnement de préproduction décrit ; pas de procédure de retour arrière. | M | faible |
| 18 | Base | Pool de connexions non dimensionné (valeur par défaut de Prisma) ; pas de recommandation PgBouncer. | M | faible |

Points vérifiés sans anomalie :
- isolation des vendeurs : chaque requête vendeur dérive `shopId` de la session, 404 sinon, couvert par des tests ;
- type réel des fichiers vérifié par leurs premiers octets ;
- mots de passe en scrypt, jetons stockés uniquement sous forme d'empreinte ;
- CSRF par contrôle d'origine, validation stricte des entrées ;
- vérification des achats : jetons de 256 bits, usage unique et atomique.

## 3. Plan d'intervention (ordre d'exécution)

1. **Sécurité et règles métier** : verrouillage par compte (#8), modération des produits (#6), statut « corrections demandées » (#7), en-têtes de cache privés (#10), limitation de débit partageable via Redis (#9).
2. **Médias** : envoi direct navigateur → stockage par URL présignée (#1), file de traitement asynchrone dans PostgreSQL et worker séparé (#2), variantes d'images (#5), validation, durée et miniature des vidéos (#3), nettoyage des orphelins (#4).
3. **Backend et base** : correction des N+1 (#13), plafond de pagination (#14), journal des requêtes lentes, pool de connexions (#18), index vérifiés par plans d'exécution sur un jeu de données volumineux.
4. **Cache** : cache des pages publiques avec invalidation ciblée par étiquettes, déclenchée par l'API lors des changements, y compris au début et à la fin des promotions (#11).
5. **Observabilité** : métriques Prometheus, journal structuré des requêtes, remontée des erreurs frontend, santé vivant/prêt (#15).
6. **Déploiement et résilience** : migrations en pré-déploiement (#12), worker Render, préproduction, retour arrière, sauvegarde et restauration testées (#16, #17).
7. **Tests** : nouveaux tests fonctionnels et de sécurité, tests de charge k6 à plusieurs niveaux de concurrence.

Le résultat de chaque point est consigné dans [RAPPORT-OPTIMISATION.md](RAPPORT-OPTIMISATION.md).
