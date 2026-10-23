# Système visuel

Style éditorial « papier, encre et verre » : fond papier chaud, texte encre, un accent froid (bleu nuit) et un accent chaud (ocre) réservé aux mises en avant, panneaux en verre dépoli sur les aplats et les photos.

Tout est déclaré **une seule fois** dans `frontend/src/app/globals.css`.

## Jetons

| Rôle | Jeton Tailwind | Valeur |
|---|---|---|
| Fond de page (paper) | `canvas` | `#f5f3ee` |
| Fonds secondaires | `paper-2` / `paper-3` | `#edeae3` / `#e4e0d7` |
| Cartes, champs | `surface` | `#ffffff` |
| Texte | `ink` / `ink-2` / `muted` | `#15171c` / `#3c414a` / `#6b7079` |
| Mentions décoratives seulement | `faint` | `#9a9ea6` (contraste insuffisant pour une information) |
| Filets | `line` / `line-2` | `#e2ded5` / `#cdc8bd` |
| Accent froid (liens, prix, focus) | `brand-600` / `brand-700` / `brand-50` | `#1b3d7a` / `#11295a` / `#e7ecf5` |
| Aplats, onglet actif, pied de page | `navy` / `navy-2` | `#0f2147` / `#17305f` |
| Accent chaud (badges promo, progression, étoiles) | `promo-600` / `promo-700` / `promo-50` | `#c4661f` / `#a4520f` / `#f7e9dc` |
| États | `ok`, `warn`, `danger` (+ `-50`) | `#2c6848`, `#8f5510`, `#a1342a` |
| WhatsApp | `whatsapp` / `whatsapp-hover` | `#1f9d55` / `#188247` |

Ombres `shadow-card` et `shadow-pop`, rayon `rounded-card` (16 px), courbe `--ease-soft` = `cubic-bezier(0.2, 0.7, 0.2, 1)`.

Pour changer de couleurs de marque, ne remplacez que `navy`/`brand-*` (accent froid) et `promo-*` (accent chaud), en gardant un contraste AA sur le fond papier.

## Typographie

- Titres : **Newsreader** 500 (`display`), interlettrage −0,012 em, interligne 1,04. Accueil 64/104/128 px ; bandeaux 40–56 px ; sections 26–36 px.
- Texte : **IBM Plex Sans**, base 15 px, interligne 1,55.
- Références et codes : **IBM Plex Mono** (`font-mono`).
- Prix et quantités : chiffres tabulaires (`num`).
- Sur-titres : `eyebrow` (11 px, capitales, interlettrage 0,14 em).

Les polices sont auto-hébergées (`@fontsource`) : aucune requête vers un service tiers.

## Composants

- **En-tête flottant** (`SiteHeader`) : verre clair, décollé de 12 px des bords.
  - Logo, rubrique principale « Catalogue » (pilule en verre sombre, bleu nuit plein quand elle est active), bouton vert WhatsApp seulement si `NEXT_PUBLIC_PLATFORM_WHATSAPP` est défini, compte.
  - Sur ordinateur, navigation centrée. Sur mobile, seconde ligne de trois onglets égaux, **sans menu hamburger**.
- **Accueil** : section pleine hauteur, nom et accroche révélés mot par mot (`RevealWords`), trois pilules en verre. Photo facultative (`NEXT_PUBLIC_HERO_IMAGE`) sous un voile bleu nuit à 55 %.
- **Bandeau des pages intérieures** (`PageBanner`) : aplat bleu nuit (photo facultative, voile à 70 %), bouton **« Retour »** dans le contenu, titre serif, phrase courte, panneaux de verre (`GlassPanel`).
- **Carte produit** :
  - badge en petites capitales (ocre : promotion ; vert : neuf ; bleu nuit : autres états) ;
  - pilule « Commander » sur la photo, qui ouvre WhatsApp avec le message prérempli ;
  - prix en accent ;
  - carte entièrement cliquable, levée de 2 px au survol, zoom de la photo à 1,03.
- **Boutons** : pilules de 36/44/56 px ; `primary` (verre sombre), `glass` (sur aplat ou photo), `whatsapp`, `outline`.
- **Filtres** : pastilles blanches bordées, bleu nuit quand elles sont actives. Ce sont de vraies cases à cocher dans un formulaire GET.
- **Formulaires** : champs blancs de 44 px, arrondis à 12 px. Parcours en étapes : barre segmentée ocre, « Étape n » en mono, titre serif.

## Écarts assumés par rapport au modèle d'origine

- La pilule « Commander » des cartes utilise le **verre sombre** et non le verre clair : les photos d'appareils sont claires, et un texte blanc sur verre clair n'y atteindrait pas le contraste AA.
- Le texte « très discret » `#9a9ea6` est limité aux mentions décoratives (« facultatif »). Toute information utilise `#6b7079`.
- Le remplissage des barres du graphique vendeur utilise `#3a5c9c`, un pas plus clair de l'accent : `#1b3d7a`, trop sombre pour un remplissage, échoue au validateur de palette.
- Marketplace oblige, il n'y a pas de numéro WhatsApp unique : le bouton vert de l'en-tête n'apparaît que si la plateforme en configure un.

## Règles

Pas de blanc pur en fond ni de noir pur en texte ; pas de dégradés ; pas de faux avis, compteurs ou prix ; contraste AA, focus visible, cibles de 44 px ; aucun défilement horizontal (vérifié par un test mobile) ; animations désactivées si l'utilisateur demande moins de mouvement.
