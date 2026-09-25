# Les Bois de Cendre

Jeu solo de survie et de construction dans une forêt médiévale infestée de zombies, en pixel art
vu de trois-quarts (façon Zelda classique). Jouable dans le navigateur, **pensé d’abord pour le
téléphone** (paysage recommandé, portrait jouable) et aussi sur ordinateur. Aucun compte, aucune
publicité, aucun serveur : tout tourne dans la page et la sauvegarde reste sur l’appareil.

## Présentation et règles

Vous découvrez un ancien camp abandonné au sud de la forêt. Il faut récolter, fabriquer son
équipement, se nourrir, construire des défenses, puis explorer trois lieux maudits pour y
reprendre les **trois fragments du sceau** :

| Lieu | Direction depuis le camp | Ambiance |
|---|---|---|
| Ruines du hameau | est | maisons abandonnées, coffres, forge du prévôt |
| Cimetière | ouest | tombes, crypte, morts plus nombreux |
| Pierres noires | nord-ouest, dans les bois corrompus | cercle de pierres, brutes |

Déposez les fragments sur la **pierre du Loup** (sanctuaire, tout au nord), préparez vos
défenses, puis déclenchez vous-même **l’assaut final** (trois vagues). Après la victoire, un
écran de conclusion affiche vos statistiques et vous pouvez continuer à explorer ou recommencer.

**Survie** — trois jauges seulement :
- **Santé** : baisse sous les coups ; remonte lentement si vous êtes nourri et hors combat (plus
  vite près d’un feu), et grâce aux bandages et aux repas.
- **Faim** : baisse lentement (100 points en 15 minutes). En dessous de 30 : avertissement et
  récupération d’endurance ralentie ; à zéro, vous perdez des PV progressivement.
- **Endurance** : attaques, esquives et course ; se recharge vite au repos.

**Nourriture** : myrtilles et morilles (clairement comestibles) se mangent crues ; la viande vient
des pièges à gibier ; le feu de camp cuit la viande et prépare des plats plus nourrissants
(brochette de morilles, ragoût du forestier). Les zombies ne laissent jamais de nourriture.

**Jour et nuit** : un cycle dure environ 11 minutes (jour ≈ 6 min 40, crépuscule 1 min, nuit
3 min, aube 20 s ; le premier jour est un peu plus long). La cloche du crépuscule annonce la
horde : chaque nuit, un groupe de zombies converge vers vous, de plus en plus nombreux (rôdeurs,
puis affamés dès la 2ᵉ nuit, brutes dès la 3ᵉ). À l’aube, les survivants se retirent.

**Zombies** : le **rôdeur** (lent, fréquent), l’**affamé** (rapide, fragile) et la **brute**
(lente, très résistante, redoutable contre les constructions). Ils errent, entendent la récolte
et les combats, vous poursuivent, vous cherchent quand ils vous perdent de vue, contournent les
obstacles et attaquent palissades et portes si le passage est fermé. Chaque attaque est annoncée
(clignotement rouge et « ! ») : esquivez ou reculez.

**Mort** : la moitié de votre sac tombe dans un sac récupérable, indiqué sur la carte. Vous
réapparaissez à votre paillasse (ou au camp) avec une protection de quelques secondes ; les
ennemis proches s’éloignent. Objectifs et fragments sont toujours conservés.

**Fabrication** : 21 recettes réparties entre la main, l’établi, le feu de camp et la forge
(outils de pierre puis de fer, lance, massue, épée, arc et flèches, bandages, torche, gambison,
brigandine, corde, planches, charbon de bois, lingots, plats cuisinés). Chaque recette montre les
ingrédients possédés/requis, la quantité produite, la station nécessaire, et explique pourquoi
elle est indisponible. Les outils s’usent mais ne disparaissent jamais : un outil cassé se répare.

**Construction** : feu de camp, établi, coffre, paillasse, palissade, porte, pieux défensifs,
forge, piège à gibier, lanterne sur poteau. Aperçu du vrai sprite, case verte/rouge avec la
raison du refus, validation explicite, annulation sans coût, réparation, démolition avec
remboursement annoncé (50 %). Un coffre détruit laisse son contenu dans un sac.

## Commandes

### Téléphone
| Commande | Effet |
|---|---|
| Moitié gauche de l’écran | joystick (poussé à fond : course) |
| **Attaque** (grand bouton) | frappe l’ennemi le plus proche devant vous (visée assistée) ; sans ennemi, récolte |
| **Action** | son libellé annonce l’action : couper, miner, cueillir, ouvrir, lire, ramasser, réparer… Maintenir pour répéter |
| **Esquive** | courte roulade invulnérable (coûte de l’endurance) |
| Barre rapide (5 cases) | manger, utiliser ou équiper d’un toucher |
| Sac · Fabriquer · Construire · Carte · Menu | en haut à droite ; ouvrir un menu met le jeu en pause |

Plusieurs doigts fonctionnent en même temps (marcher en attaquant, etc.).
En mode construction, touchez ou glissez sur la carte : l’aperçu s’affiche au-dessus du doigt.

### Ordinateur
| Touche | Effet |
|---|---|
| ZQSD / WASD / flèches | se déplacer (Maj : courir) |
| Espace ou J | attaquer |
| E, F ou Entrée | action contextuelle |
| K ou X | esquiver |
| 1 à 5 | barre rapide |
| I ou Tab · C · B · M | sac · fabrication · construction · carte |
| Échap | pause (ou annuler une construction) |

## Installation locale (étape par étape)

1. Installer **Node.js 20 ou plus récent** : https://nodejs.org (version « LTS »).
2. Récupérer le projet :
   ```bash
   git clone https://github.com/rambouraxel-del/Survive-zombie.git
   cd Survive-zombie
   ```
3. Installer les dépendances : `npm install`
4. Lancer le jeu en développement : `npm run dev`, puis ouvrir l’adresse affichée
   (par défaut http://localhost:5173). Pour tester sur un téléphone du même réseau Wi-Fi :
   `npm run dev -- --host` et ouvrir l’adresse « Network » affichée.

Autres commandes :

| Commande | Rôle |
|---|---|
| `npm test` | tests unitaires des règles (génération, inventaire, craft, construction, combat, sauvegarde, équilibrage…) |
| `npm run typecheck` | vérification TypeScript |
| `npm run build` | build de production dans `dist/` |
| `npm run preview` | sert le build de production localement |
| `npm run e2e` | test de bout en bout dans Chromium (après `npm run build` ; nécessite un Chromium pour Playwright, sinon `npx playwright install chromium`) |

## Déploiement sur GitHub Pages

Le dépôt contient le workflow officiel `.github/workflows/deploy.yml` (build Vite + déploiement
Pages) et `.github/workflows/ci.yml` (types, tests, build à chaque envoi).

1. Sur GitHub : **Settings → Pages → Build and deployment → Source : « GitHub Actions »**.
2. Fusionner le travail dans la branche `main` (le déploiement se lance à chaque envoi sur `main`),
   ou lancer le workflow à la main : **Actions → « Déployer sur GitHub Pages » → Run workflow**.
3. Le jeu est alors publié à l’adresse `https://<compte>.github.io/Survive-zombie/`.

Le projet utilise des chemins relatifs (`base: './'` dans `vite.config.ts`) : il fonctionne sous
le sous-chemin du dépôt comme en local, et le rechargement de la page fonctionne (application
d’une seule page, sans routes).

## Sauvegarde et export

- Sauvegarde **automatique** toutes les 60 s et après chaque étape importante (construction,
  objectif, fragment, aube, sommeil, victoire), ainsi qu’au passage en arrière-plan.
- Stockage local dans **IndexedDB** (repli sur `localStorage`), sauvegarde **versionnée**, avec une
  **sauvegarde de secours** : si la dernière est corrompue, la précédente est chargée et un message
  l’indique. Un message explicite s’affiche si le stockage échoue (navigation privée, espace plein).
- **Menu → Exporter la sauvegarde** télécharge un fichier JSON ; **Importer une sauvegarde**
  (menu ou écran titre) le valide avant de le charger (fichiers corrompus ou d’une version plus
  récente refusés).
- Le butin est tiré de façon déterministe : recharger ne permet pas de refaire un coffre.
- Au chargement et au retour d’arrière-plan, le jeu attend votre confirmation (« Je suis prêt ») :
  rien ne se passe pendant votre absence.

## Crédits

Tous les graphismes et sons proviennent de ressources gratuites sous licences libres (LPC Revised,
Universal LPC Character Generator, LPC Items, Kenney, OpenGameArt…), sans aucun dessin ajouté.
Détail complet : [ASSET_CREDITS.md](ASSET_CREDITS.md), manifeste
[`public/assets/manifest.json`](public/assets/manifest.json), textes de licences dans
[`licenses/`](licenses/) et page **Crédits** dans le jeu.

## Structure du code

| Dossier | Contenu |
|---|---|
| `src/config/` | équilibrage (vitesses, faim, durées, hordes…) |
| `src/data/` | définitions : objets, recettes, constructions, ennemis, butin, notes, crédits |
| `src/world/` | modèle du monde et génération procédurale (graine, validation, repli) |
| `src/sim/` | simulation indépendante du rendu : joueur, zombies, pathfinding, actions, objectifs |
| `src/save/` | sérialisation versionnée, IndexedDB, secours |
| `src/input/` | joystick multitouch et clavier |
| `src/render/` | rendu Phaser : terrain, objets (culling par chunks), personnages, lumière |
| `src/ui/` | interface HTML/CSS : HUD, panneaux, icônes découpées dans les atlas |
| `tools/assets/` | scripts de préparation des assets (découpe, assemblage, conversion, manifeste) |
| `tests/` | tests unitaires (Vitest) et test de bout en bout (Playwright) |

## Limites connues

- **Tests sur appareils réels** : le jeu a été testé dans Chromium en émulation mobile (paysage
  844×390 et portrait 390×844, écran tactile, multitouch simulé par le protocole du navigateur).
  Il n’a **pas** été testé sur un vrai iPhone ni un vrai téléphone Android : Safari iOS en
  particulier reste à vérifier sur appareil.
- **Performances** : la simulation coûte environ 0,1 ms par pas avec 26 zombies (mesure Node).
  Le taux d’images réel sur téléphone n’a pas pu être mesuré (le rendu de test est logiciel).
- **Durée de campagne** : estimée à 60–90 minutes d’après les distances, les durées de jour et
  la progression, mais non mesurée avec de vrais joueurs ; les réglages sont centralisés dans
  `src/config/balance.ts` pour l’ajuster.
- **Équilibrage** : vérifié par des nuits simulées (un « bot » survit aux nuits 1 et 3 avec des
  défenses modestes) ; à affiner avec de vrais retours.
- **Assets** : pas de charrette (remplacée par des chargements de tonneaux/caisses), pas de
  rotation des constructions (orientation unique dans les packs), la « torche sur support » est une
  lanterne sur poteau, la brute réutilise un corps musclé recoloré avec les palettes du générateur.
- Le joueur ne tient pas son arme en main à l’écran (animations de frappe LPC sans calque d’arme) ;
  l’arme équipée est visible dans le HUD et un effet de lame accompagne chaque coup.
