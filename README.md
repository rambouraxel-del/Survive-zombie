# Les Bois de Cendre

RPG d’exploration **solo** en pixel art vu de trois-quarts, dans un monde médiéval sombre.
Jouable dans le navigateur, **pensé d’abord pour le téléphone** (paysage recommandé, portrait
jouable) et sur ordinateur. Aucun compte, aucune publicité, aucun achat, aucun serveur : la
sauvegarde reste sur l’appareil.

## Le jeu (V2)

**Un camp, des expéditions.** Le camp est sûr : personne n’y attaque, la faim n’y baisse pas. On y
choisit son arme de départ au râtelier, on fabrique (établi, feu, forge), on grave des
enchantements, on range ses coffres, on aménage le camp et l’intérieur de la maison (placement
clair, annulation gratuite, déplacement, démontage remboursé et annoncé). Au camp, la fabrication
puise aussi dans les coffres.

**Carrefour des expéditions** (au sud du camp) : chaque destination affiche son type, son état,
sa condition d’ouverture, son danger, ses récompenses, son point de halte et ses paliers.

| Destination | Type | Particularités |
|---|---|---|
| Bois des chasseurs | ressources, de jour | bois, pierre, gibier, herbes ; tanière d’un prédateur (boss facultatif) |
| Marais corrompu | ressources, de nuit | mousse noire, champignons luminescents, feux follets ; lanternes votives |
| Bastion abandonné | expédition principale | herses, leviers, raccourcis ; le chef des mercenaires ; ouvre la Carrière et un donjon |
| Ancienne carrière | expédition principale | terrasses, échelle-raccourci, galeries ; le Ver des profondeurs ; ouvre un donjon |
| Bastion hanté · Profondeurs | donjons, paliers 1 à 5 | reprennent les décors ; ennemis plus forts à chaque palier |

- **Sortie de ressources** : nouvelle instance à chaque départ. Rentrer met la récolte en sûreté ;
  une chute fait perdre **20 %** des ressources de la sortie encore portées (les réserves
  emportées et l’équipement sont protégés), avec le détail affiché.
- **Expédition principale** : la progression est conservée (points de halte, portes, coffres
  vidés, boss). Une chute ramène au dernier point de halte ; les ennemis ordinaires reviennent.
- **Donjon** : un palier ne progresse qu’après une victoire ; une défaite ne change jamais le
  palier. Un court délai sépare deux instances récompensées ; chaque instance a son identifiant.

**Sept familles d’armes** : dague, épée longue, masse/hache, arc, arbalète, magie élémentaire,
magie occulte, chacune en trois rangs (21 armes). Changement d’arme permis partout, même en
combat. Attaques de base : endurance ou mana, **aucune munition**. Trois compétences par famille
(deux équipées, recharges indépendantes qui continuent hors de la main, choix mémorisé) et un
**ultime** par famille, à visée manuelle, alimenté par une jauge commune (dégâts infligés et subis).
La **maîtrise** de chaque famille ne vient que des vrais dégâts sur de vrais ennemis ; elle débloque
compétences, ultime et armes de rang supérieur. Le mannequin sert à s’entraîner, sans maîtrise.

**Équipement** : protections (gambison, cotte de mailles, brigandine), accessoires, potions,
bombes. Le meilleur équipement se fabrique avec les matériaux des boss et des donjons. Un
enchantement par objet (le remplacer est annoncé), conservé partout.

**Ennemis** : rats, loups, cerfs, mercenaires, archers, renards et ours corrompus, égarés enfouis,
âmes, plantes carnivores ; trois boss avec attaques annoncées, fenêtres de riposte et résistance
aux contrôles. Visée légèrement assistée ; toutes les attaques ennemies sont signalées au sol.

**Faim** : ne baisse qu’en expédition, effets progressifs (récupération, puis endurance, puis PV).
Aliments et soins affichent leur gain réel et refusent un usage inutile. **Pas de monnaie.**

**Guidage** : objectif en haut de l’écran, journal (objectifs, facultatifs, carnet de route),
premier lancement guidé et passable, conseils affichés une seule fois (réactivables).

## Commandes

**Téléphone** : joystick à gauche (à fond : course) ; à droite attaque, action, esquive, deux
compétences, ultime (maintenir, glisser pour viser, relâcher ; relâcher sur « annuler » l’annule),
bouton d’arme (appui : arme suivante, appui long : liste). Raccourcis en bas. Disposition
**gaucher** en option ; zones de sécurité respectées ; portrait et paysage.

**Clavier** : ZQSD/WASD/flèches, Maj courir, Espace/J attaquer, E action, K esquive, U et I
compétences, L (maintenir) ultime visé à la souris, R arme suivante, G liste des armes, 1–5
raccourcis, Tab sac, C fabrication, B aménager, M carte, N journal, Échap pause.

**Options** : volumes, muet, taille/opacité du joystick, taille des boutons, gaucher, qualité,
**réduire les secousses**, **réduire les flashs**. La pause fige tout (aucun temps ne passe).
Aucun son avant le premier geste ; musique selon le lieu (camp, région, combat, boss) avec fondus.

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
| `npm test` | tests unitaires ciblés (cartes accessibles, pertes de sortie, paliers de donjon, recharges, ultime, arbalète, fabrication depuis les coffres, enchantement, sauvegarde, migration V1, boucle complète) |
| `npm run typecheck` | vérification TypeScript |
| `npm run build` | build de production dans `dist/` |
| `npm run preview` | sert le build de production localement |
| `npm run e2e` | parcours en navigateur (titre, camp, râtelier, chaque région, panneaux) avec captures — après `npm run build` et `npm run preview` |
| `node tests/e2e/map-overview.mjs <url> <dossier>` | vue d’ensemble de chaque carte (relecture du level design) |
| `node tests/e2e/check-deployed.mjs <url>` | vérification d’un site publié (assets, version, partie, interface, reprise) |

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

- Sauvegarde automatique (toutes les 45 s et à chaque étape : départ, retour, point de halte,
  boss, fabrication, construction), et au passage en arrière-plan. Stockage **IndexedDB** (repli
  `localStorage`), format **versionné (3)** en sections séparées (profil, camp, maison, régions,
  expédition en cours, donjons), avec **sauvegarde de secours**.
- **Reprise** : le jeu attend toujours « Je suis prêt ». Une expédition interrompue (rechargement)
  reprend telle quelle : même instance, coffres déjà vidés, ennemis vaincus. Recharger la page ne
  donne jamais de nouveau butin.
- **Pause → Exporter / Importer** : l’import est validé avant de remplacer quoi que ce soit.

**Ancienne version (V1)** : au premier chargement, une **copie intacte** de l’ancienne sauvegarde
est conservée (Pause ou écran titre → « Exporter l’ancienne sauvegarde (V1) »). Les possessions
sont converties dans une partie V2 : massue → masse I, épée → épée I, arc → arc I ; lances,
flèches et constructions sont remboursées en matériaux ; le tout est rangé dans des **coffres de
transfert** au camp. Les fragments du sceau n’existent plus. La première sortie est considérée
comme faite (Marais et Bastion ouverts). Un message récapitule la conversion.

## Restaurer la version précédente (V1)

La V1 est conservée telle quelle sur la branche **`backup/pre-v2-20260927-2103`** (commit
`c7490e8`). Pour la remettre en ligne sans rien effacer :

1. Remettre les fichiers de la V1 sur `main`, par un nouveau commit :
   ```bash
   git fetch origin
   git checkout main && git pull
   git rm -r -q . && git checkout origin/backup/pre-v2-20260927-2103 -- .
   git commit -m "Retour à la V1" && git push
   ```
2. Le déploiement Pages se relance automatiquement depuis `main`.

Rien n’est réécrit ni forcé : la V2 reste dans l’historique et peut être rétablie en annulant ce
commit (`git revert`). Les sauvegardes V2 ne sont pas lisibles par la V1 ; la copie V1 exportée,
elle, l’est (Importer une sauvegarde).

## Crédits

Tous les graphismes et sons proviennent de ressources gratuites sous licences libres (LPC Revised,
Universal LPC Character Generator, LPC Items, Kenney, OpenGameArt…), sans aucun dessin ajouté.
Détail complet : [ASSET_CREDITS.md](ASSET_CREDITS.md), manifeste
[`public/assets/manifest.json`](public/assets/manifest.json), textes de licences dans
[`licenses/`](licenses/) et page **Crédits** dans le jeu.

## Structure du code

| Dossier | Contenu |
|---|---|
| `src/config/` | équilibrage général (vitesses, faim, mort, points de halte) |
| `src/data/` | définitions : objets, armes et compétences, ennemis et boss, destinations et paliers, recettes, installations, enchantements, butin |
| `src/maps/` | cartes dessinées (ASCII exporté par `tools/maps/`) : camp, maison, Bois, Marais, Bastion, Carrière |
| `src/world/` | modèle du monde et construction d’une carte (terrain, murs, eau, objets, repères) |
| `src/sim/` | simulation indépendante du rendu : joueur, combat, IA, voyages et donjons, actions, objectifs |
| `src/save/` | sérialisation versionnée, IndexedDB, secours |
| `src/input/` | joystick multitouch et clavier |
| `src/render/` | rendu Phaser : terrain, objets (culling par chunks), personnages, lumière |
| `src/ui/` | interface HTML/CSS : HUD, panneaux, icônes découpées dans les atlas |
| `tools/assets/`, `tools/maps/` | préparation des assets (découpe, assemblage, conversion) et dessin des cartes |
| `tests/` | tests unitaires (Vitest) et test de bout en bout (Playwright) |

## Performances

Rendu par calques de tuiles Phaser (un seul dessin par calque), objets affichés par morceaux de
carte proches de la caméra, grille spatiale pour les ennemis, voile d’éclairage au quart de la
résolution, écritures DOM du HUD limitées aux valeurs qui changent, musiques chargées à la demande.
La qualité automatique abaisse la résolution si le jeu reste saccadé. Mesures faites dans Chromium
avec rendu logiciel (machine virtuelle) : pas représentatives d’un téléphone réel.

## Limites connues

- Pas encore testé sur un vrai iPhone ni un vrai Android (émulation mobile Chromium seulement).
- Équilibrage (dégâts, paliers, délais) vérifié par tests et parties simulées, à affiner avec de
  vrais retours.
- Assets : le **loup** est le renard arctique LPC teinté en gris (aucun loup LPC compatible) ; le
  boss de la carrière est le grand ver LPC agrandi ; les murs du bastion sont les murs de château
  LPC assombris. Les emplacements de compagnons sont réservés au camp mais sans compagnon.
