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
| Joystick (zone du pouce, à gauche ; à droite en disposition gaucher) | se déplacer ; poussé à fond : course |
| **Attaque** (grand bouton) | frappe l’ennemi le plus proche à portée de l’arme (visée assistée) ; sans ennemi, récolte |
| **Action** | un verbe court (Couper, Miner, Cueillir, Fouiller, Lire, Réparer…) ; le nom de la cible s’affiche près d’elle. Maintenir pour répéter |
| Toucher un objet proche | le choisit comme cible, sans déplacer le personnage |
| **Esquive** | courte roulade invulnérable (coûte de l’endurance) |
| Raccourcis (5 cases) | manger, soigner ou équiper d’un toucher ; une case vide ouvre le choix d’un objet |
| **Sac** et **Menu** (en haut à droite) | le Menu donne accès à Fabriquer, Construire, Carte, Objectif et Pause ; les écrans de gestion sont regroupés en onglets (Sac, Fabriquer, Construire, Carte) |
| Ligne d’objectif (en haut) | objectif et progression ; la toucher affiche les détails (jeu en pause) et permet de passer l’introduction |
| Recette suivie (sous l’objectif) | ressources manquantes de la recette épinglée ; la toucher ouvre sa fiche |

Plusieurs doigts fonctionnent en même temps (marcher en attaquant, etc.). Un appui très bref n’est
jamais perdu ; perte de focus, rotation de l’écran, appel système ou ouverture d’un menu relâchent
toutes les commandes. Les aides élémentaires disparaissent une fois apprises (Options → Aides pour
les revoir).

### Ordinateur
Les commandes tactiles se masquent quand on joue au clavier ou à la souris et réapparaissent dès
qu’on touche l’écran (appareils hybrides). Les raccourcis clavier s’affichent à gauche au début.

| Touche | Effet |
|---|---|
| ZQSD / WASD / flèches | se déplacer (Maj : courir) |
| Espace ou J | attaquer |
| E, F ou Entrée | action contextuelle |
| K ou X | esquiver |
| 1 à 5 | raccourcis |
| I ou Tab · C · B · M | sac · fabrication · construction · carte |
| Échap | pause (ou annuler une construction) |

### Options
Type de commandes (automatique, tactile, clavier), taille et opacité du joystick, taille des
boutons, disposition gaucher, qualité d’affichage (automatique, haute, économie), volumes,
secousses, aides ; le mode debug (images par seconde, temps de calcul, collisions) est dans
« Avancé », avec l’identifiant de version (aussi affiché sur l’écran titre).

## Nouveautés de la mise à jour « confort »

- **Raccourcis indépendants du sac** : chaque case désigne un type d’objet ; quantité et état
  épuisé affichés ; les matériaux n’y vont jamais d’eux-mêmes ; les premiers aliments, soins et
  outils vont seulement dans une case libre ; une affectation manuelle n’est jamais remplacée.
- **Fabrication** : ordre fixe (rien ne bouge sous le doigt), filtres par station et
  « Fabricables seulement », fiche détaillée au toucher (usage, ingrédients possédés/requis,
  station, quantité produite, effets chiffrés, comparaison avec l’équipement), fer travaillé en
  une seule fiche avec deux méthodes (minerai ou ferraille), quantités ×1 / ×5 / maximum,
  recette épinglée.
- **Nourriture** : la fiche d’un aliment indique le gain réel selon la faim actuelle et le surplus
  perdu ; manger n’est plus possible quand cela ne sert à rien.
- **Carte** : centrée sur le joueur, zoom adapté à la zone découverte, zoom +/−, glisser et pincer,
  recentrage, nord, légende, marqueurs personnels nommés (ressource, danger, camp, à revoir).
- **Introduction** : fouiller le coffre, lire le carnet, récolter (ressources proches signalées),
  fabriquer un premier outil (son avantage est annoncé), puis préparer la nuit (arme, repas, feu,
  défenses conseillées). Elle peut être passée ; ce qui est déjà fait compte.
- **Équipement visible** : haches, masse, pioche, lance, épée, massue, arc et armures portés par
  le personnage (calques du générateur LPC).
- **Camp** : coffre agrandi (24 cases, contenu conservé), feu amélioré (lumière et repos),
  établi renforcé (réparations à moitié prix, une planche de plus).
- **Exploration** (nouvelles parties) : bivouac abandonné, barricade brisée, tombe ouverte,
  réserve de chasseurs, chacun avec une note, un butin en rapport et, pour deux d’entre eux, des
  gardiens. Signaux de menace : « ! » quand un zombie vous repère, repère discret au bord de
  l’écran pour un grognement proche ou un poursuivant hors de vue (pas de radar).
- **Combat** : visée assistée à portée réelle de l’arme ; hordes nocturnes arrivant par petits
  groupes.

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
| `node tests/e2e/perf.mjs <url>` | mesures de performance par scénario (simulation, scène, rendu, interface) |
| `node tests/e2e/compare-shots.mjs <url> <dossier> <préfixe>` | captures comparables (même sauvegarde, mêmes écrans, 4 formats) |

## Déploiement sur GitHub Pages

Le site publié doit être la **version compilée** (`dist/`), jamais les fichiers source : le
`index.html` de la racine du dépôt pointe vers `/src/main.ts` et ne fonctionne pas tel quel.

Workflows fournis :
- `.github/workflows/deploy.yml` (à chaque envoi sur `main`) : installe les dépendances, lance les
  tests, construit avec Vite, vérifie que `dist/index.html` référence bien les fichiers compilés,
  publie **uniquement `dist/`** avec les actions officielles GitHub Pages, puis **vérifie l’URL
  publique** dans un navigateur (JS, CSS, assets, écran titre, version servie = commit déployé,
  lancement d’une partie, rendu, interface, reprise de sauvegarde).
  Captures d’écran disponibles dans l’artefact « verification-site-publie » du run.
- `.github/workflows/verify-site.yml` : même vérification de l’URL publique, lancée à la main.
- `.github/workflows/ci.yml` : types, tests et build à chaque envoi.

Réglage obligatoire (une fois) : **Settings → Pages → Build and deployment → Source : « GitHub
Actions »**. Avec « Deploy from a branch », GitHub publie les fichiers bruts d’une branche : c’est
le HTML de développement qui est servi et le jeu ne démarre pas.

Adresse : `https://<compte>.github.io/Survive-zombie/`. Les chemins sont relatifs
(`base: './'` dans `vite.config.ts`) : le site fonctionne sous le sous-chemin du dépôt comme en
local, et le rechargement de la page fonctionne (application d’une seule page, sans routes).

## Sauvegarde et export

- Sauvegarde **automatique** toutes les 60 s et après chaque étape importante (construction,
  objectif, fragment, aube, sommeil, victoire), ainsi qu’au passage en arrière-plan.
- Stockage local dans **IndexedDB** (repli sur `localStorage`), sauvegarde **versionnée**, avec une
  **sauvegarde de secours** : si la dernière est corrompue, la précédente est chargée et un message
  l’indique. Un message explicite s’affiche si le stockage échoue (navigation privée, espace plein).
- **Menu → Pause → Exporter la sauvegarde** télécharge un fichier JSON ; **Importer une
  sauvegarde** (Pause ou écran titre) le valide avant de le charger : un fichier invalide, corrompu
  ou d’une version plus récente est refusé et ne remplace pas la sauvegarde existante.
- Le butin est tiré de façon déterministe : recharger ne permet pas de refaire un coffre.
- Au chargement et au retour d’arrière-plan, le jeu attend votre confirmation (« Je suis prêt »).

**Compatibilité** : les sauvegardes de la version précédente (format 1) sont converties au
chargement (format 2) sans perte ni duplication d’objets : les raccourcis sont créés à partir des
objets utiles, l’introduction n’est pas imposée, le monde est **conservé tel quel** (les nouvelles
scènes d’exploration n’apparaissent que dans les nouvelles parties, ce que le jeu indique à la
reprise). Des sauvegardes réelles de l’ancien format servent de référence aux tests
(`tests/fixtures/`).

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

## Performances

Mesures (`tests/e2e/perf.mjs`) dans Chromium sans tête, écran 844×390 à densité 2, **rendu WebGL
logiciel (SwiftShader) sur une machine virtuelle à 4 cœurs** : ce n’est pas un téléphone. Le coût
JavaScript par image reste inférieur à 1 ms (simulation 0,1–0,5 ms, mise à jour de la scène
0,1–0,7 ms, interface < 0,1 ms), y compris la nuit avec 14 ennemis. Le temps d’image est dominé par
le remplissage de pixels du GPU logiciel : à densité 1 (4 fois moins de pixels) le même jeu passe
de ~19 à ~55 images/s. Optimisations réalisées après mesure : voile de nuit calculé au quart de
résolution (3,6 ms → 0,4 ms par image), écritures DOM du HUD limitées aux valeurs qui changent
(35–57 → 2–11 modifications/s), textes flottants réutilisés, et **qualité automatique** qui abaisse
la résolution si le jeu reste saccadé. Les 1–2 images/s observées dans un navigateur distant
correspondent à ce cas de rendu logiciel ; elles ne sont pas représentatives d’un iPhone, qui n’a
pas été mesuré.

## Limites connues

- **Tests sur appareils réels** : le jeu a été testé dans Chromium en émulation mobile (paysage
  844×390, portrait 390×844, téléphone étroit 360×640, ordinateur 1280×800, écran tactile,
  multitouch simulé par le protocole du navigateur). Il n’a **pas** été testé sur un vrai iPhone ni
  un vrai téléphone Android : Safari iOS en particulier reste à vérifier sur appareil.
- **Durée et équilibrage** : première nuit vérifiée avec des joueurs simulés (débutant préparé :
  survit mais prend des coups ; mal préparé : peut fuir, jamais de série de morts) ; à affiner avec
  de vrais retours.
- **Assets** : pas de charrette (remplacée par des chargements de tonneaux/caisses ; la scène
  « convoi pillé » n’existe pas), pas de rotation des constructions, la « torche sur support » est
  une lanterne sur poteau, la brute réutilise un corps musclé recoloré. Équipement visible : la
  massue n’apparaît que pendant la frappe, la torche n’est pas visible en main, les deux haches
  partagent le même dessin, le gambison est représenté par l’armure de cuir.
- **Anciennes parties** : leur monde est conservé, donc sans les nouvelles scènes d’exploration.
