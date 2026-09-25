# Crédits des ressources — Les Bois de Cendre

Tous les graphismes et sons du jeu proviennent de ressources gratuites dont la licence autorise
l’utilisation et la redistribution. Rien n’a été redessiné : les seules opérations effectuées sont
le découpage de cellules, le rognage de la transparence, l’assemblage en atlas, la superposition
de calques de personnages (comme le fait le générateur LPC), la recoloration avec les palettes
officielles de ce générateur, et la conversion audio en MP3.

- Correspondance fichier par fichier : [`public/assets/manifest.json`](public/assets/manifest.json)
- Auteurs des calques de personnages, fichier par fichier : [`public/assets/chars/CREDITS-characters.csv`](public/assets/chars/CREDITS-characters.csv)
- Fichiers de crédits d’origine et textes de licences : dossier [`licenses/`](licenses/)
- Scripts de reconstruction : [`tools/assets/`](tools/assets/)

## Note sur la provenance

Pendant le développement, les sites kenney.nl, opengameart.org et itch.io n’étaient pas joignables
depuis l’environnement de travail (accès réseau restreint). Les fichiers ont donc été téléchargés
depuis des dépôts GitHub publics qui redistribuent ces ressources avec leurs crédits et licences.
Les pages d’origine sont indiquées ci-dessous ; la copie réellement utilisée est précisée.

## Graphismes

| Ressource | Auteurs | Licence | Source d’origine | Copie téléchargée | Fichiers du jeu |
|---|---|---|---|---|---|
| **LPC Revised** — terrain (herbe, terre, été/automne), arbres, souche, rochers, herbes hautes, buissons, fleurs, morilles, feu de camp, établi, coffre, paille, palissade (clôture), porte, chevaux de frise, four de forge, enclume, panier-piège, lanterne sur poteau, caisses, tonneaux, maisons, piliers, pierre du loup, dalles funéraires, crânes, papiers, icônes de ressources et de nourriture | Eliza Wyatt (DeathsDarling), Lanea Zimmerman (Sharm), Stephen Challener (Redshrike), Johannes Sjölund (Wulax), bluecarrot16, BenCreating, Durrani, YuriNikolai, Hyptosis, Demetrius, Craftpix.net 2D Game Assets (détail par feuille dans `licenses/lpc-revised/`) | OGA-BY 3.0 | https://github.com/ElizaWy/LPC (liens OpenGameArt dans les Credits.txt) | https://github.com/ElizaWy/LPC — commit `f07f7f5` | `assets/atlas/world.png`, `world.json`, `offsets.json`, `assets/tiles/terrain_summer.png`, `terrain_autumn.png` |
| **Universal LPC Spritesheet Character Generator** — survivant, rôdeur, affamé, brute (corps, têtes, cheveux, vêtements) | Stephen Challener (Redshrike), Johannes Sjölund (wulax), bluecarrot16, Benjamin K. Smith (BenCreating), Sander Frenken (castelonia), JaidynReiman, Eliza Wyatt (ElizaWy), Evert, TheraHedwig, MuffinElZangano, Durrani, dalonedrau, Matthew Krohn (makrohn), Manuel Riecke (MrBeast), Joe White (liste exacte par fichier dans `CREDITS-characters.csv`) | CC-BY-SA 3.0 (calques également OGA-BY 3.0 / GPL 3.0 selon les fichiers ; la tête de zombie et le corps musclé ne sont disponibles qu’en CC-BY-SA 3.0 / GPL 3.0, d’où la licence CC-BY-SA 3.0 des feuilles assemblées) | https://opengameart.org/content/lpc-zombie , https://opengameart.org/content/lpc-character-bases et liens du CSV | https://github.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator — commit `4963a69` | `assets/chars/player.png`, `rodeur.png`, `affame.png`, `brute.png` |
| **[LPC] Items and game effects** — icônes d’épée, haches, pioche, masse, lance, massue, arc, flèche, corde, torche, parchemin, pain, sac, carte, bottes, protections, gemmes (fragments du sceau), effets (coup de lame, « ! », « zzz ») | Tuomo Untinen, Johannes Sjölund (Wulax), Jetrel, Gwes, Daniel Eddeland, Jaidyn Reiman, Nila122, Lanea Zimmerman (Sharm), ArtisticDude, Stephen Challener (Redshrike), pennomi, laetissima, makrohn | GPL 3.0 (licence de la copie redistribuée) | https://opengameart.org/content/lpc-items-and-game-effects | https://github.com/tchx84/FreedomValley — commit `b50dccd` | `assets/atlas/items.png`, `items.json`, `favicon.png` |
| **[LPC] Signposts, graves, line cloths and scare crow** — croix funéraires, panneau, épouvantail | Tuomo Untinen et al. | GPL 3.0 (licence de la copie redistribuée) | https://opengameart.org/content/lpc-signposts-graves-line-cloths-and-scare-crow | https://github.com/tchx84/FreedomValley — commit `b50dccd` | `assets/atlas/items.png` |

Conformément aux licences à partage à l’identique (CC-BY-SA 3.0, GPL 3.0), les images dérivées de
ces ressources (feuilles de personnages, atlas `items.png`) sont redistribuées sous ces mêmes
licences, avec leurs fichiers sources disponibles dans ce dépôt. Les textes de licences sont dans
`licenses/texts/`. Le texte de l’OGA-BY 3.0 est consultable sur https://opengameart.org/content/oga-by-30-faq
(licence fondée sur la CC-BY 3.0 : attribution obligatoire).

## Sons et musiques

| Ressource | Auteur | Licence | Source d’origine | Copie téléchargée | Fichiers du jeu |
|---|---|---|---|---|---|
| Impact Sounds (pas, bois, minage, cloche) | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds | https://github.com/Mcamento8/open-game-sfx-index (commit `34bbe8b`) | `step_*`, `chop_0`, `chop_1`, `mine_*`, `build`, `bell` |
| RPG Audio (hache, tissu, cuir, métal, portes, grincement) | Kenney | CC0 1.0 | https://kenney.nl/assets/rpg-audio | idem | `chop_2`, `pick_*`, `craft`, `door_*`, `chest` |
| Interface Sounds | Kenney | CC0 1.0 | https://kenney.nl/assets/interface-sounds | idem | `click`, `open`, `close`, `error`, `confirm` |
| Music Jingles | Kenney | CC0 1.0 | https://kenney.nl/assets/music-jingles | idem | `objective`, `victory`, `defeat` |
| Zombies Sound Pack | artisticdude | CC0 1.0 | https://opengameart.org/content/zombies-sound-pack | idem | `zgroan_*`, `zattack`, `zdeath` |
| RPG Sound Pack | artisticdude | CC0 1.0 | https://opengameart.org/content/rpg-sound-pack | idem | `eat` |
| 37 Hits/Punches | qubodup | CC0 1.0 | https://opengameart.org/content/37-hitspunches | idem | `hit_*`, `hurt` |
| Battle Sound Effects | Ogrebane | CC0 1.0 | https://opengameart.org/content/battle-sound-effects | idem | `swing_*`, `bow` |
| Fireplace Sound Loop | PagDev | CC0 1.0 | https://opengameart.org/content/fireplace-sound-loop | https://github.com/tchx84/FreedomValley | `fire_loop` |
| « RPG – The Secret Within the Silent Woods » | hitctrl | CC-BY 3.0 | https://opengameart.org/content/rpg-the-secret-within-the-woods | idem | `music_day` |
| « RPG – The Graveyard » | hitctrl | CC-BY 3.0 | https://opengameart.org/content/rpg-the-graveyard | idem | `music_night` |
| « So it begins » (RPG Title Screen Music Pack) | Alexei Galar | CC-BY 4.0 | https://opengameart.org/content/rpg-title-screen-music-pack | idem | `music_title` |

Tous les fichiers audio ont été convertis en MP3 (compatibilité Safari iOS) ; aucun autre traitement.

## Adaptations faute d’asset conforme

- **Charrettes abandonnées** : aucun sprite de charrette libre et compatible n’a pu être récupéré.
  Elles sont remplacées par des « chargements abandonnés » (tonneaux et caisses LPC) le long des chemins.
- **Torche sur support** : représentée par la lanterne sur poteau du pack LPC Revised (« Lanterne sur poteau »).
- **Pieux défensifs** : représentés par les chevaux de frise (« Sawhorse ») du pack LPC Revised.
- **Brute** : corps musclé LPC recoloré avec la palette officielle « zombie_green » et tête « Frankenstein » du générateur (aucun sprite de zombie musclé dédié n’existe).
- **Rotation des constructions** : les assets n’existent que sous une orientation ; la rotation est donc indisponible.

## Code

Moteur : [Phaser 3](https://phaser.io) (licence MIT). Outils : TypeScript, Vite, Vitest, Playwright.
