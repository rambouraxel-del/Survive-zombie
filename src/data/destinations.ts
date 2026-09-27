// Destinations : régions de ressources (renouvelables), expéditions principales et donjons.
import type { EnemyType } from './enemies';

export type DestKind = 'farm' | 'main' | 'dungeon';

export interface Destination {
  id: string;
  name: string;
  kind: DestKind;
  map: string;
  /** image affichée sur la carte des destinations : "atlas:frame" */
  image: string;
  desc: string;
  danger: 1 | 2 | 3 | 4 | 5;
  rewards: string;
  /** drapeaux de progression requis */
  requires: string[];
  /** explication (sans rien dévoiler) quand la destination est verrouillée */
  lockedText: string;
  /** drapeau posé à la victoire contre le boss principal */
  bossFlag?: string;
  bossName?: string;
}

export const DESTINATIONS: Destination[] = [
  {
    id: 'bois', name: 'Bois des chasseurs', kind: 'farm', map: 'bois', image: 'world:tree_oak_a',
    desc: 'Forêt claire en plein jour : gibier, bois, pierre, fibres, herbes. Quelques loups et rats. Une tanière au nord abrite un prédateur (facultatif).',
    danger: 1, rewards: 'Bois, pierre, fibres, peaux, viande, herbes ; fourrures ; crocs du prédateur (boss facultatif)', requires: [], lockedText: '',
    bossFlag: 'boss_predator', bossName: 'Le Prédateur corrompu',
  },
  {
    id: 'marais', name: 'Marais corrompu', kind: 'farm', map: 'marais', image: 'props:tree_bare_c',
    desc: 'Toujours plongé dans la nuit. Passages étroits entre les eaux mortes ; les lanternes votives offrent un répit temporaire.',
    danger: 2, rewards: 'Mousse noire, champignons luminescents, essence de feu follet, glandes à venin (enchantements, potions)', requires: ['first_return'],
    lockedText: 'Revenez au camp après une première sortie : la route du marais vous sera indiquée.',
  },
  {
    id: 'bastion', name: 'Bastion abandonné', kind: 'main', map: 'bastion', image: 'props:arch_gate',
    desc: 'Une forteresse en ruine tenue par des mercenaires. Chemins de traverse, herses à ouvrir, un chef redoutable dans la grande salle.',
    danger: 3, rewards: 'Acier de rempart, cotte de mailles, insignes du capitaine (armes de rang III) ; débloque son donjon et la carrière', requires: ['first_return'],
    lockedText: 'Revenez au camp après une première sortie pour préparer une vraie expédition.',
    bossFlag: 'boss_chief', bossName: 'Hrodgar, chef des mercenaires',
  },
  {
    id: 'carriere', name: 'Ancienne carrière', kind: 'main', map: 'carriere', image: 'props:rock_tower_s',
    desc: 'Terrasses de roche, installations abandonnées et galeries souterraines. Bêtes et hommes corrompus ; quelque chose de massif dort au fond.',
    danger: 4, rewards: 'Minerai, charbon, cristaux ; carapace du ver (armes de rang III) ; débloque son donjon', requires: ['boss_chief'],
    lockedText: 'Terminez d’abord une expédition principale : la route de la carrière passe par le bastion.',
    bossFlag: 'boss_worm', bossName: 'Le Ver des profondeurs',
  },
  {
    id: 'd_bastion', name: 'Donjon : le Bastion hanté', kind: 'dungeon', map: 'bastion', image: 'props:portcullis',
    desc: 'La garnison du chef est revenue. On entre par la poterne ; la grande salle attend au bout.',
    danger: 3, rewards: 'Acier, braises éternelles, insignes (paliers 3 à 5) ; très rare : relique du rempart', requires: ['boss_chief'],
    lockedText: 'Se débloque après la première victoire dans une expédition principale.',
  },
  {
    id: 'd_carriere', name: 'Donjon : les Profondeurs', kind: 'dungeon', map: 'carriere', image: 'props:cave_mouth',
    desc: 'Les galeries et le fond de la carrière grouillent à nouveau. Le ver est revenu, plus fort.',
    danger: 4, rewards: 'Cristaux, essences, carapaces (paliers 3 à 5) ; très rare : géode vivante', requires: ['boss_worm'],
    lockedText: 'Se débloque après avoir vaincu la créature de la carrière.',
  },
];

export const DEST_BY_ID: Record<string, Destination> = Object.fromEntries(DESTINATIONS.map((d) => [d.id, d]));

// ------------------------------------------------------------ paliers des donjons
export interface TierDef {
  tier: number;
  danger: 1 | 2 | 3 | 4 | 5;
  /** emplacements de rencontre actifs (voir les repères « slot » des cartes) */
  slots: string[];
  /** ennemis supplémentaires ajoutés à chaque groupe (densité) */
  extra: number;
  /** remplacements de composition : type -> type (ennemis plus avancés) */
  swap?: Partial<Record<EnemyType, EnemyType>>;
  hpMul: number;
  dmgMul: number;
  /** variantes d'attaque (ennemis « aguerris » : attaques supplémentaires) */
  elite: number; // proportion d'ennemis aguerris
  bossHpMul: number;
  loot: string;
  notes: string;
}

export interface DungeonDef {
  id: string;
  boss: EnemyType;
  bossName: string;
  /** délai (s de jeu) entre deux victoires avant de relancer une instance récompensée */
  cooldown: number;
  tiers: TierDef[];
}

export const DUNGEONS: Record<string, DungeonDef> = {
  d_bastion: {
    id: 'd_bastion', boss: 'chief', bossName: 'Hrodgar revenant', cooldown: 180,
    tiers: [
      { tier: 1, danger: 3, slots: ['b', 'c', 'boss'], extra: 0, hpMul: 1, dmgMul: 1, elite: 0, bossHpMul: 1, loot: 'd_bastion_1', notes: 'Cour et chapelle occupées. Le chef revenant garde la grande salle.' },
      { tier: 2, danger: 3, slots: ['a', 'b', 'c', 'boss'], extra: 0, hpMul: 1.2, dmgMul: 1.1, elite: 0.2, bossHpMul: 1.15, loot: 'd_bastion_2', notes: 'La basse-cour est à nouveau tenue. Premiers soldats aguerris (coups doublés).' },
      { tier: 3, danger: 4, slots: ['a', 'b', 'c', 'boss'], extra: 1, swap: { husk: 'wraith' }, hpMul: 1.4, dmgMul: 1.2, elite: 0.35, bossHpMul: 1.3, loot: 'd_bastion_3', notes: 'Groupes plus nombreux ; des âmes corrompues hantent la chapelle.' },
      { tier: 4, danger: 4, slots: ['a', 'b', 'c', 'boss'], extra: 1, swap: { husk: 'wraith', merc: 'merc' }, hpMul: 1.65, dmgMul: 1.3, elite: 0.5, bossHpMul: 1.5, loot: 'd_bastion_4', notes: 'La moitié de la garnison est aguerrie ; les arbalétriers tirent en rafale.' },
      { tier: 5, danger: 5, slots: ['a', 'b', 'c', 'boss'], extra: 2, swap: { husk: 'wraith' }, hpMul: 1.9, dmgMul: 1.45, elite: 0.7, bossHpMul: 1.8, loot: 'd_bastion_5', notes: 'Palier maximal : garnison complète et aguerrie.' },
    ],
  },
  d_carriere: {
    id: 'd_carriere', boss: 'worm', bossName: 'Ver des profondeurs, réveillé', cooldown: 180,
    tiers: [
      { tier: 1, danger: 4, slots: ['c', 'boss'], extra: 0, hpMul: 1, dmgMul: 1, elite: 0, bossHpMul: 1, loot: 'd_carriere_1', notes: 'Galeries hantées. Le ver attend dans la grande caverne.' },
      { tier: 2, danger: 4, slots: ['b', 'c', 'boss'], extra: 0, hpMul: 1.2, dmgMul: 1.1, elite: 0.2, bossHpMul: 1.15, loot: 'd_carriere_2', notes: 'Des ours corrompus remontent du fond de la carrière.' },
      { tier: 3, danger: 4, slots: ['a', 'b', 'c', 'boss'], extra: 1, hpMul: 1.4, dmgMul: 1.2, elite: 0.35, bossHpMul: 1.3, loot: 'd_carriere_3', notes: 'Toute la carrière est infestée ; groupes plus denses.' },
      { tier: 4, danger: 5, slots: ['a', 'b', 'c', 'boss'], extra: 1, swap: { rat: 'fox_c', husk: 'bear_c' }, hpMul: 1.65, dmgMul: 1.3, elite: 0.5, bossHpMul: 1.5, loot: 'd_carriere_4', notes: 'Les créatures les plus faibles ont laissé place à des bêtes massives.' },
      { tier: 5, danger: 5, slots: ['a', 'b', 'c', 'boss'], extra: 2, swap: { rat: 'fox_c', husk: 'bear_c' }, hpMul: 1.9, dmgMul: 1.45, elite: 0.7, bossHpMul: 1.8, loot: 'd_carriere_5', notes: 'Palier maximal.' },
    ],
  },
};

export const MAX_TIER = 5;
