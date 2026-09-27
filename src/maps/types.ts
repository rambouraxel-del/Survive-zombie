// Définition des cartes dessinées à la main (ASCII) : un caractère par tuile.
//
// Caractères de terrain communs à toutes les cartes :
//   .  herbe            ,  terre / boue        :  pavés           _  plancher
//   ~  eau (bloque)     =  pont (sur l'eau)    #  mur ou falaise (style de la carte)
//   T  arbre (thème)    t  arbre mort / nu     *  buisson (bloque)
//   "  herbes hautes    b  myrtillier          m  morille         h  herbe de soin
//   k  mousse noire     g  champignon pâle     r  rocher          R  gros rocher (2×1 : « RR »)
//   o  filon de fer     c  filon de charbon    x  cristal         f  fleurs (décor)
//   p  galets (décor)   s  os et crânes        j  roseaux (décor) w  toile d'araignée (décor)
//   %  dessus de mur seul (bords d'une pièce vue de dessus)
// Tout autre caractère est un repère défini dans la légende de la carte (sa tuile reçoit le
// sol par défaut de la carte, ou celui précisé par le repère).
import type { EnemyType } from '../data/enemies';

export type WallStyle = 'castle' | 'cliff' | 'brick' | 'none';

export interface MapLight {
  /** obscurité fixe de la carte (0 = plein jour, 1 = nuit noire) */
  darkness: number;
  /** teinte du voile */
  color: [number, number, number];
  /** zones plus sombres (grottes) : obscurité supplémentaire */
  caveDarkness?: number;
}

export type Marker = MarkerBase & { only?: 'main' | 'dungeon' };

type MarkerBase =
  | { kind: 'start'; ground?: string }
  | { kind: 'exit'; name?: string; ground?: string }
  | { kind: 'checkpoint'; id: string; name: string; votive?: boolean; ground?: string }
  | { kind: 'chest'; id: string; loot: string; renew?: boolean; sprite?: string; name?: string; ground?: string; only?: 'main' | 'dungeon' }
  | { kind: 'note'; id: string; ground?: string }
  | { kind: 'spawn'; group: EnemyType[]; slot?: string; ground?: string; only?: 'main' | 'dungeon'; asleep?: boolean }
  | { kind: 'boss'; type: EnemyType; id: string; ground?: string; only?: 'main' | 'dungeon' }
  | { kind: 'prop'; sprite: string; w: number; h: number; solid?: boolean; occluder?: boolean; light?: number; name?: string; flat?: boolean; ground?: string }
  | { kind: 'gate'; id: string; sprite: string; w: number; h: number; name: string; openedBy: 'lever' | 'boss' | 'inside'; ground?: string; mainOnly?: boolean; dungeonOpen?: boolean }
  | { kind: 'lever'; id: string; opens: string; name: string; ground?: string }
  | { kind: 'barricade'; id: string; ground?: string }
  | { kind: 'shortcut'; id: string; name: string; sprite: string; from: 'north' | 'south' | 'east' | 'west'; cells: { dx: number; dy: number; w: number; h: number }; ground?: string }
  | { kind: 'house'; ground?: string }
  | { kind: 'door'; to: string; ground?: string }
  | { kind: 'travel'; ground?: string }
  | { kind: 'rack'; ground?: string }
  | { kind: 'building'; type: string; ground?: string }
  | { kind: 'reserved'; name: string; ground?: string }
  | { kind: 'lodge'; sprite: string; w: number; h: number; name: string; ground?: string }
  | { kind: 'mound'; ground?: string };

export interface AreaDef {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** grotte : plus sombre */
  cave?: boolean;
  /** lieu marquant : annoncé et affiché sur la carte */
  landmark?: boolean;
}

export interface MapDef {
  id: string;
  name: string;
  palette: 'summer' | 'autumn';
  base: string; // sol par défaut ('.' ou ',')
  wall: WallStyle;
  light: MapLight;
  /** zoom choisi pour la carte : nombre de tuiles visibles en hauteur (mode paysage) */
  viewTiles: number;
  music: string;
  /** arbres utilisés pour 'T' et 't' */
  trees: string[];
  deadTrees: string[];
  rows: string[];
  legend: Record<string, Marker>;
  areas: AreaDef[];
}
