// Crédits affichés dans le jeu (détail complet : ASSET_CREDITS.md et public/assets/manifest.json).
export interface CreditEntry {
  pack: string;
  authors: string;
  license: string;
  url: string;
  via?: string;
  note?: string;
}

export const CREDITS: CreditEntry[] = [
  {
    pack: 'LPC Revised (terrain, arbres, rochers, objets, nourriture, feu, coffre, forge, portes, palissade…)',
    authors: 'Eliza Wyatt (DeathsDarling), Lanea Zimmerman (Sharm), Stephen Challener (Redshrike), Johannes Sjölund (Wulax), bluecarrot16, BenCreating, Durrani, YuriNikolai, Hyptosis, Demetrius, Craftpix.net 2D Game Assets',
    license: 'OGA-BY 3.0',
    url: 'https://github.com/ElizaWy/LPC',
    note: 'Chaque feuille est détaillée dans les fichiers Credits.txt du dépôt, reproduits dans licenses/lpc-revised/.',
  },
  {
    pack: 'Universal LPC Spritesheet Character Generator (survivant et zombies)',
    authors: 'Stephen Challener (Redshrike), Johannes Sjölund (wulax), bluecarrot16, Benjamin K. Smith (BenCreating), Sander Frenken (castelonia), JaidynReiman, Eliza Wyatt (ElizaWy), Evert, TheraHedwig, MuffinElZangano, Durrani, dalonedrau, Matthew Krohn (makrohn), Manuel Riecke (MrBeast), Joe White',
    license: 'CC-BY-SA 3.0 (calques également sous OGA-BY 3.0 / GPL 3.0 selon les fichiers)',
    url: 'https://github.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator',
    note: 'Calques assemblés sans retouche. Liste fichier par fichier : assets/chars/CREDITS-characters.csv.',
  },
  {
    pack: 'Universal LPC — équipement porté (hache, masse, pioche, lance, épée, massue, arc, armures de cuir et de plaques)',
    authors: 'bluecarrot16, JaidynReiman, Pierre Vigier (pvigier), Tuomo Untinen (reemax), Johannes Sjölund (wulax), Inboxninja, Eliza Wyatt (ElizaWy), Napsio (Vitruvian Studio), Michael Whitlock (bigbeargames)',
    license: 'CC-BY-SA 3.0 (calques également sous OGA-BY 3.0 / CC-BY 4.0 / GPL selon les fichiers)',
    url: 'https://github.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator',
    note: 'Calques découpés et assemblés sans retouche. Liste fichier par fichier : assets/chars/CREDITS-characters.csv.',
  },
  {
    pack: '[LPC] Items and game effects (icônes d’armes, d’outils, corde, torche, fragments, effets)',
    authors: 'Tuomo Untinen, Johannes Sjölund (Wulax), Jetrel, Gwes, Daniel Eddeland, Jaidyn Reiman, Nila122, Lanea Zimmerman (Sharm), ArtisticDude, Stephen Challener (Redshrike), pennomi, laetissima, makrohn',
    license: 'GPL 3.0 (licence de la copie redistribuée)',
    url: 'https://opengameart.org/content/lpc-items-and-game-effects',
    via: 'https://github.com/tchx84/FreedomValley',
  },
  {
    pack: '[LPC] Signposts, graves, line cloths and scare crow (croix de tombes, panneau, épouvantail)',
    authors: 'Tuomo Untinen et al.',
    license: 'GPL 3.0 (licence de la copie redistribuée)',
    url: 'https://opengameart.org/content/lpc-signposts-graves-line-cloths-and-scare-crow',
    via: 'https://github.com/tchx84/FreedomValley',
  },
  {
    pack: 'Kenney — Impact Sounds, RPG Audio, Interface Sounds, Music Jingles',
    authors: 'Kenney (kenney.nl)',
    license: 'CC0 1.0',
    url: 'https://kenney.nl/assets',
    via: 'https://github.com/Mcamento8/open-game-sfx-index',
  },
  {
    pack: 'Zombies Sound Pack · RPG Sound Pack',
    authors: 'artisticdude',
    license: 'CC0 1.0',
    url: 'https://opengameart.org/content/zombies-sound-pack',
    via: 'https://github.com/Mcamento8/open-game-sfx-index',
  },
  {
    pack: '37 Hits/Punches',
    authors: 'qubodup (Iwan Gabovitch)',
    license: 'CC0 1.0',
    url: 'https://opengameart.org/content/37-hitspunches',
    via: 'https://github.com/Mcamento8/open-game-sfx-index',
  },
  {
    pack: 'Battle Sound Effects',
    authors: 'Ogrebane',
    license: 'CC0 1.0',
    url: 'https://opengameart.org/content/battle-sound-effects',
    via: 'https://github.com/Mcamento8/open-game-sfx-index',
  },
  {
    pack: 'Musique « RPG – The Secret Within the Silent Woods » (jour)',
    authors: 'hitctrl',
    license: 'CC-BY 3.0',
    url: 'https://opengameart.org/content/rpg-the-secret-within-the-woods',
    via: 'https://github.com/tchx84/FreedomValley',
  },
  {
    pack: 'Musique « RPG – The Graveyard » (nuit)',
    authors: 'hitctrl',
    license: 'CC-BY 3.0',
    url: 'https://opengameart.org/content/rpg-the-graveyard',
    via: 'https://github.com/tchx84/FreedomValley',
  },
  {
    pack: 'Musique « So it begins » — RPG Title Screen Music Pack (écran titre)',
    authors: 'Alexei Galar',
    license: 'CC-BY 4.0',
    url: 'https://opengameart.org/content/rpg-title-screen-music-pack',
    via: 'https://github.com/tchx84/FreedomValley',
  },
  {
    pack: 'Fireplace Sound Loop (feu de camp)',
    authors: 'PagDev',
    license: 'CC0 1.0',
    url: 'https://opengameart.org/content/fireplace-sound-loop',
    via: 'https://github.com/tchx84/FreedomValley',
  },
];
