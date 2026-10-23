# Règles métier

Toutes ces règles sont appliquées **côté serveur** (`backend`). L'interface ne fait que les refléter.

## Boutiques

| Statut | Visible publiquement | Le vendeur peut… |
|---|---|---|
| `PENDING` (en attente) | Non | préparer des brouillons, modifier son profil |
| `ACTIVE` | Oui | tout : publier, promotions, ventes |
| `CLOSED` (fermée temporairement par le vendeur) | Page visible avec un avertissement, annonces masquées | modifier, rouvrir |
| `SUSPENDED` (par l'administration) | Non (404) | rien (lecture seule) |
| `CHANGES_REQUESTED` (corrections demandées) | Non | corriger selon le motif indiqué par l'administration : la demande repasse en attente |
| `REJECTED` (demande refusée) | Non | corriger : la demande repasse automatiquement en attente |

- Ouvrir une boutique fait passer le compte au rôle `SELLER`. La boutique reste invisible tant qu'elle n'est pas validée.
- Une fois la boutique validée, un changement de **nom** ou de **numéro WhatsApp** est mis en attente dans `pendingChanges`, puis approuvé ou refusé par l'administration. L'adresse publique (slug) ne change jamais.
- Suspendre un compte vendeur suspend aussi sa boutique et ferme toutes ses sessions.
- Badges :
  - « Boutique validée » : la boutique a été validée par l'administration.
  - « Identité du vendeur vérifiée » : posé manuellement par l'administration, après un contrôle réel.
- **Valider une boutique ne valide pas ses futures annonces.** Seul le statut « vendeur de confiance » (`trustedSeller`), accordé explicitement par l'administration, publie les annonces sans modération ; il peut être retiré à tout moment.

## Annonces

- **Publication** (`DRAFT` / `PUBLISHED` / `ARCHIVED`) et **disponibilité** (`AVAILABLE` / `OUT_OF_STOCK` / `TEMPORARILY_UNAVAILABLE` / `WITHDRAWN`) sont indépendantes.
- Une annonce est **consultable** si elle est publiée, non retirée par l'administration et que sa boutique est active.
- Une annonce consultable est **listée** dans les catalogues sauf si elle est « retirée de la vente ». Les annonces indisponibles passent après les disponibles.
- Seules les annonces `AVAILABLE` sont présentées comme commandables. Pour les autres, le bouton devient « Demander la disponibilité » ; une annonce retirée de la vente n'a plus de bouton.
- Publier exige au moins une photo **traitée** (`READY`) et une boutique active.
- **Modération** (`PENDING` / `APPROVED` / `REJECTED`) : la première publication d'une annonce passe en attente de validation, sauf pour un vendeur de confiance. Une annonce n'est publique qu'une fois `APPROVED`. Une annonce refusée affiche le motif au vendeur ; il la corrige et la publie à nouveau, ce qui la remet en attente. Les annonces publiées avant cette règle ont été marquées `APPROVED` par la migration, sans changement de visibilité.
- Stock à 0 → `OUT_OF_STOCK` automatiquement ; stock remis → `AVAILABLE`. Impossible de déclarer « disponible » avec un stock nul.
- Médias : **3 photos et 1 vidéo au maximum par produit**. La limite est vérifiée sous verrou de la ligne produit et compte aussi les envois en cours : elle est tenue même en cas d'envois simultanés. Un média en échec ne compte pas. Les médias en traitement ne sont pas publics. La photo principale est toujours une image, et une seule par produit (index unique).
- Seuls les brouillons sans vente associée peuvent être supprimés ; sinon, l'annonce est retirée.
- Un retrait administratif (`removedAt`, motif obligatoire) bloque toute modification par le vendeur.

## Promotions

### Prix de référence (prix barré)

> **Règle retenue : le prix de référence est le prix habituel le plus bas pratiqué pour ce produit au cours des 30 jours précédant la création (ou la modification) de la promotion, prix actuel inclus.**

Calcul : prix actuel, changements de prix intervenus pendant la fenêtre, et prix en vigueur au début de la fenêtre. Ainsi, un vendeur qui monte son prix juste avant une promotion ne peut pas afficher un prix barré gonflé (cas couvert par un test).

Cette règle s'inspire des pratiques reconnues de protection des consommateurs (fenêtre de 30 jours). **Elle doit être validée par un juriste au regard du droit togolais et des règles UEMOA applicables.** La durée de la fenêtre est réglable (`RULE_REFERENCE_PRICE_DAYS`).

### Autres règles

- Prix promotionnel entier, strictement positif, strictement inférieur au prix de référence, réduction d'au moins 1 %.
- La date de fin doit être postérieure au début et dans le futur. Le début ne peut pas être antidaté (tolérance de 5 min). Durée maximale de 90 jours (`RULE_MAX_PROMOTION_DAYS`).
- Uniquement sur une annonce publiée, disponible, d'une boutique active. Pas de chevauchement entre deux promotions actives d'un même produit (vérifié sous verrou).
- La réduction affichée est arrondie **à l'inférieur**, pour ne jamais exagérer l'avantage.
- **Activation et expiration automatiques** : une promotion `ACTIVE` ne s'applique qu'entre `startsAt` (inclus) et `endsAt` (exclu), et seulement si l'annonce est publique et disponible. Le calcul se fait à chaque requête, sans tâche planifiée.
- Le vendeur peut modifier une promotion **programmée** (pas encore commencée) et désactiver une promotion en cours ou programmée.
- **Modifier le prix habituel met fin aux promotions en cours ou programmées** (événement `AUTO_DISABLED`).
- L'administration peut suspendre une offre (motif obligatoire) ; le vendeur ne peut pas la réactiver.
- Chaque événement (création, modification, désactivation, suspension, rétablissement) est historisé dans `PromotionEvent`.
- **Cohérence des prix** : le prix courant est calculé par un seul module (`ProductPresenter` et son équivalent SQL dans le catalogue) et n'est jamais dupliqué. Les pages publiques ne mettent pas les prix en cache. Un test vérifie le même prix sur 7 surfaces : catalogue, boutique, promotions, accueil, fiche, favoris, message WhatsApp.

## Commande sur WhatsApp

1. Au clic, l'API vérifie que l'annonce est toujours consultable et non retirée de la vente.
2. Elle compose le message : nom, référence, prix affiché à cet instant (avec la fin de la promotion le cas échéant) et lien public de l'annonce.
3. Elle renvoie un lien `https://wa.me/<numéro>?text=…`. Le numéro est normalisé au format international, chiffres uniquement.
4. Le client envoie lui-même le message. **Seul un compteur de clics est incrémenté : aucune commande ni vente n'est créée.**

Le message rappelle que les conditions finales (prix, garantie, livraison) se confirment avec le vendeur.

## Ventes déclarées et avis vérifiés

### Ce qui est vérifié — et ce qui ne l'est pas

La plateforme n'encaisse pas les paiements : **elle ne peut pas prouver qu'une vente a eu lieu**. La procédure combine plusieurs niveaux pour rendre la fabrication de faux avis difficile, coûteuse et détectable :

1. **Déclaration par le vendeur** : produit, date (30 derniers jours), référence de transaction unique dans la boutique, numéro de l'acheteur.
   - Le numéro est conservé uniquement sous forme de HMAC, avec ses deux derniers chiffres pour aider le vendeur à s'y retrouver.
   - Il ne peut pas être celui de la boutique ou du vendeur.
   - Le nombre de déclarations est plafonné : 30 par 24 h, 5 pour une boutique validée depuis moins de 14 jours.
2. **QR code** : jeton aléatoire de 256 bits, placé dans le **fragment** de l'URL (`/avis#jeton`), donc jamais transmis dans les journaux d'accès des serveurs.
   - Seule son empreinte SHA-256 est stockée, sans aucune donnée personnelle ni identifiant séquentiel.
   - Valable 60 jours ; régénérable, ce qui révoque l'ancien.
   - Révoqué si la vente est annulée, et verrouillé après 5 numéros erronés.
3. **Confirmation par le client**, connecté à son compte : il doit saisir le numéro communiqué au vendeur. Le compte ne peut appartenir ni au vendeur ni à un administrateur.
4. **Contrôles automatiques** :
   - le même compte a déjà confirmé plusieurs achats dans la boutique (90 jours) ;
   - le même numéro d'acheteur revient dans plusieurs ventes de la boutique ;
   - plus de 10 confirmations en 24 h ;
   - nombreuses ventes pour une boutique de moins de 14 jours ;
   - commentaire identique à un autre avis ;
   - commentaire contenant un lien ou un numéro de téléphone.
5. **Examen administratif** des cas signalés : valider, contester ou annuler la vente.

| Statut de vente | Signification |
|---|---|
| `DECLARED` | saisie par le vendeur, pas encore confirmée par le client |
| `PENDING_VERIFICATION` | confirmée par le client, mais un contrôle automatique demande un examen |
| `VERIFIED` | **« vérifiée selon la procédure »** : déclaration + confirmation client + contrôles passés (ou validation administrative) |
| `DISPUTED` | contestée : l'avis est masqué, perd la mention et sort des notes |
| `CANCELLED` | annulée : QR code révoqué, avis rejeté |

Libellés affichés : `DECLARED` « Vente déclarée », `PENDING_VERIFICATION` « Achat en cours de vérification », `VERIFIED` « Achat vérifié », `DISPUTED` « Contestée — suspicion de fraude », `CANCELLED` « Annulée — achat non vérifié ».

La mention **« Achat vérifié »** n'est affichée que pour un avis publié dont la vente est `VERIFIED`. Elle **ne signifie pas que le paiement a été constaté**, et l'interface le précise.

### Limites connues

- Un vendeur peut, en théorie, déclarer une fausse vente au nom d'un complice qui confirmera. Les plafonds, le HMAC du numéro (qui détecte sa réutilisation), les contrôles de volume, les signalements et le journal d'audit limitent et exposent cette fraude, mais ne l'empêchent pas totalement.
- Le numéro saisi par le client n'est pas vérifié par SMS. Une vérification par code SMS renforcerait la procédure, mais demande un fournisseur payant.

### Dépôt d'un avis : atomicité

Le jeton passe de `ACTIVE` à `USED` par une mise à jour conditionnelle, dans la même transaction que la confirmation de la vente, la création de l'avis et le recalcul des notes. La contrainte d'unicité `Review.saleId` garantit en base un seul avis par vente. Un test lance 4 soumissions simultanées : une seule réussit.

### Avis

- Note de 1 à 5 (contrainte `CHECK`). Commentaire facultatif, entre 10 et 1 000 caractères s'il est présent.
- Les notes moyennes (produit et boutique) sont calculées uniquement à partir des avis **publiés et liés à une vente vérifiée**, puis recalculées à chaque décision. Le tri « Mieux notés » applique un lissage bayésien (moyenne a priori 3,5, poids 3).
- Le vendeur consulte ses avis mais ne peut **ni les modifier ni les supprimer**. Il peut les signaler.
- L'administration publie (seulement si la vente est vérifiée), masque ou rejette, avec un motif journalisé.

## Statistiques

- **Consultations** : pages vues, au plus une par produit et par session de navigation. Ce ne sont **pas des visiteurs uniques**.
- **Clics WhatsApp** : ouvertures de conversation. **Ce ne sont pas des ventes.**
- Les ventes « déclarées » et « vérifiées selon la procédure » sont toujours distinguées.

## Données de démonstration

Les boutiques, produits, ventes et avis de démonstration portent tous `isDemo = true`, et leur nom contient « (démo) ».
- L'interface affiche un badge « Démo » et ces pages ne sont pas indexées.
- Les visuels sont générés, sans aucune photo réelle.
- Les mots de passe sont aléatoires et affichés une seule fois.
- Ces données sont refusées en production, sauf `ALLOW_DEMO_SEED=true`, et se suppriment avec `pnpm --filter backend seed:clear`.

## Comptes

- Après 8 échecs de connexion consécutifs (`LOGIN_MAX_FAILURES`), le compte est verrouillé 15 min (`LOGIN_LOCK_MINUTES`), en plus de la limitation par adresse IP. Le message reste générique ; une réinitialisation de mot de passe lève le verrou.
