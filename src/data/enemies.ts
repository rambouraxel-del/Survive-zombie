// Bestiaire V2 : huit ennemis aux comportements distincts et trois boss.
// Chaque ennemi a un rôle (voir `ai`) et des attaques toujours annoncées (télégraphes).

export type EnemyType =
  | 'rat' | 'wolf' | 'deer'
  | 'merc' | 'archer'
  | 'fox_c' | 'bear_c' | 'husk' | 'wraith' | 'flower'
  | 'predator' | 'chief' | 'worm';

export type AiKind =
  | 'skittish' // fuit, n'attaque que de près ou en groupe
  | 'pack' // poursuit, bondit
  | 'prey' // gibier : fuit toujours
  | 'guard' // garde une zone, poursuit dans un rayon limité
  | 'ranged' // garde ses distances, tire des traits annoncés
  | 'hitrun' // rapide : frappe puis recule
  | 'brute' // lent, attaques lourdes très annoncées, charge
  | 'ambush' // enfoui (monticule visible), surgit à l'approche
  | 'caster' // flotte, garde ses distances, zones au sol
  | 'static' // plante : immobile, frappe à portée
  | 'boss';

export type AttackKind = 'melee' | 'leap' | 'shoot' | 'charge' | 'slam' | 'zone' | 'spit' | 'summon' | 'burrow' | 'rockfall' | 'combo' | 'bomb' | 'roar';

export interface AttackDef {
  kind: AttackKind;
  /** annonce avant le coup (s) */
  windup: number;
  damage: number;
  range: number; // distance d'utilisation
  radius?: number; // zone d'effet
  recover: number; // fenêtre de riposte après le coup
  cooldown: number;
  weight?: number;
  knockback?: number;
  /** projectiles : vitesse et nombre */
  speed?: number;
  count?: number;
  /** phase minimale (boss) */
  phase?: number;
}

export interface SpriteDef {
  tex: string;
  fw: number;
  fh: number;
  /** disposition : feuille humanoïde LPC (même que le joueur), ou feuille de créature */
  layout: 'human' | 'lpc_zombie' | 'quad4' | 'bear' | 'rat' | 'mono';
  /** ligne de chaque direction (feuilles de créatures) : haut, gauche, bas, droite */
  dirRows?: [number, number, number, number];
  walkFrames?: number;
  attackRows?: [number, number, number, number];
  attackFrames?: number;
  scale?: number;
  tint?: number;
  foot?: number; // position des pieds (0..1)
  /** arme visible (humanoïdes) : calque de l'atlas d'équipement */
  weaponLook?: string;
  anim?: 'slash' | 'thrust' | 'shoot' | 'spellcast';
  fps?: number;
}

export interface EnemyDef {
  type: EnemyType;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  sight: number; // px
  leash: number; // px : distance au point d'origine au-delà de laquelle il abandonne
  ai: AiKind;
  attacks: AttackDef[];
  knockbackResist: number;
  /** résistance aux contrôles (étourdissement, immobilisation) : 0..1 */
  ccResist: number;
  armor?: number; // réduction des dégâts
  sprite: SpriteDef;
  /** butin : tirages garantis et aléatoires */
  drops: { id: string; min: number; max: number; chance: number }[];
  /** animal (gibier ou bête) : compte pour les objectifs de chasse */
  animal?: boolean;
  sound?: { alert?: string; attack?: string; hurt?: string; death?: string };
  boss?: boolean;
  /** description du bestiaire */
  desc: string;
}

const HUMAN_SHEET = (tex: string, weaponLook: string, anim: SpriteDef['anim'], tint?: number, scale = 1): SpriteDef => ({ tex, fw: 64, fh: 64, layout: 'human', weaponLook, anim, tint, scale });

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  rat: {
    type: 'rat', name: 'Rat géant', hp: 22, speed: 80, radius: 9, sight: 5 * 32, leash: 9 * 32, ai: 'skittish', knockbackResist: 0, ccResist: 0,
    attacks: [{ kind: 'melee', windup: 0.35, damage: 6, range: 26, recover: 0.5, cooldown: 1.1 }],
    sprite: { tex: 'rat', fw: 80, fh: 64, layout: 'rat', dirRows: [3, 1, 0, 2], walkFrames: 8, scale: 0.8, foot: 0.8 },
    drops: [{ id: 'meat_raw', min: 1, max: 1, chance: 0.5 }, { id: 'hide', min: 1, max: 1, chance: 0.25 }],
    animal: true, sound: { attack: 'bite', death: 'bite' },
    desc: 'Craintif : fuit quand il est blessé, mord si on l’approche ou s’ils sont plusieurs.',
  },
  wolf: {
    type: 'wolf', name: 'Loup des cendres', hp: 42, speed: 118, radius: 11, sight: 8 * 32, leash: 16 * 32, ai: 'pack', knockbackResist: 0.1, ccResist: 0,
    attacks: [
      { kind: 'melee', windup: 0.4, damage: 9, range: 30, recover: 0.6, cooldown: 1.2, weight: 2 },
      { kind: 'leap', windup: 0.65, damage: 13, range: 150, radius: 26, recover: 0.9, cooldown: 4.5, weight: 1 },
    ],
    sprite: { tex: 'fox_arctic', fw: 64, fh: 64, layout: 'quad4', dirRows: [3, 2, 0, 1], walkFrames: 4, tint: 0x9d9486, foot: 0.86 },
    drops: [{ id: 'pelt', min: 1, max: 1, chance: 0.55 }, { id: 'meat_raw', min: 1, max: 1, chance: 0.6 }, { id: 'hide', min: 1, max: 1, chance: 0.4 }],
    animal: true, sound: { alert: 'wolf', attack: 'bite', death: 'wolf' },
    desc: 'Chasse en meute. Annonce son bond en se ramassant sur lui-même : écartez-vous de la ligne.',
  },
  deer: {
    type: 'deer', name: 'Cerf', hp: 30, speed: 125, radius: 12, sight: 7 * 32, leash: 20 * 32, ai: 'prey', knockbackResist: 0.2, ccResist: 0,
    attacks: [],
    sprite: { tex: 'deer', fw: 64, fh: 96, layout: 'quad4', dirRows: [0, 2, 3, 1], walkFrames: 4, foot: 0.9 },
    drops: [{ id: 'meat_raw', min: 2, max: 3, chance: 1 }, { id: 'hide', min: 1, max: 2, chance: 1 }],
    animal: true,
    desc: 'Gibier du Bois des chasseurs. Fuit dès qu’il vous voit.',
  },
  merc: {
    type: 'merc', name: 'Mercenaire', hp: 70, speed: 70, radius: 10, sight: 7 * 32, leash: 10 * 32, ai: 'guard', knockbackResist: 0.3, ccResist: 0.1, armor: 0.1,
    attacks: [
      { kind: 'melee', windup: 0.5, damage: 13, range: 34, recover: 0.7, cooldown: 1.3, weight: 3 },
      { kind: 'combo', windup: 0.6, damage: 10, range: 34, recover: 1.1, cooldown: 5, count: 2, weight: 1 },
    ],
    sprite: HUMAN_SHEET('merc', 'sword', 'slash'),
    drops: [{ id: 'scrap', min: 1, max: 2, chance: 0.6 }, { id: 'cloth', min: 1, max: 1, chance: 0.4 }, { id: 'steel', min: 1, max: 1, chance: 0.18 }, { id: 'bread', min: 1, max: 1, chance: 0.2 }],
    sound: { alert: 'sword_draw', attack: 'swing_sword', death: 'hurt' },
    desc: 'Garde son poste et ne poursuit pas au-delà. Frappe franche, parfois deux coups de suite.',
  },
  archer: {
    type: 'archer', name: 'Arbalétrier mercenaire', hp: 48, speed: 68, radius: 10, sight: 10 * 32, leash: 12 * 32, ai: 'ranged', knockbackResist: 0.1, ccResist: 0,
    attacks: [{ kind: 'shoot', windup: 0.8, damage: 11, range: 260, recover: 0.6, cooldown: 1.8, speed: 330 }],
    sprite: HUMAN_SHEET('merc_archer', 'bow', 'shoot'),
    drops: [{ id: 'planks', min: 1, max: 2, chance: 0.5 }, { id: 'rope', min: 1, max: 1, chance: 0.35 }, { id: 'steel', min: 1, max: 1, chance: 0.12 }],
    sound: { alert: 'goblin', attack: 'bow', death: 'hurt' },
    desc: 'Garde ses distances. Une ligne rouge annonce son tir : sortez-en ou esquivez au bon moment.',
  },
  fox_c: {
    type: 'fox_c', name: 'Renard corrompu', hp: 34, speed: 150, radius: 9, sight: 8 * 32, leash: 14 * 32, ai: 'hitrun', knockbackResist: 0, ccResist: 0,
    attacks: [{ kind: 'melee', windup: 0.3, damage: 9, range: 28, recover: 0.4, cooldown: 1.6 }],
    sprite: { tex: 'fox_woods', fw: 64, fh: 64, layout: 'quad4', dirRows: [3, 2, 0, 1], walkFrames: 4, tint: 0xb07ab8, foot: 0.86 },
    drops: [{ id: 'venom', min: 1, max: 1, chance: 0.5 }, { id: 'hide', min: 1, max: 1, chance: 0.3 }],
    animal: true, sound: { alert: 'shade_0', attack: 'bite', death: 'slime' },
    desc: 'Très rapide : mord puis recule avant de revenir. Frappez-le au moment où il revient.',
  },
  bear_c: {
    type: 'bear_c', name: 'Ours corrompu', hp: 190, speed: 58, radius: 16, sight: 7 * 32, leash: 11 * 32, ai: 'brute', knockbackResist: 0.8, ccResist: 0.3, armor: 0.1,
    attacks: [
      { kind: 'slam', windup: 1.0, damage: 24, range: 44, radius: 46, recover: 1.3, cooldown: 2.6, weight: 2 },
      { kind: 'charge', windup: 0.9, damage: 20, range: 200, radius: 22, recover: 1.5, cooldown: 7, weight: 1, knockback: 220 },
    ],
    sprite: { tex: 'bear_black', fw: 64, fh: 64, layout: 'bear', dirRows: [0, 2, 3, 1], walkFrames: 4, attackRows: [4, 6, 7, 5], attackFrames: 3, scale: 1.25, tint: 0x8f7aa0, foot: 0.9 },
    drops: [{ id: 'hide', min: 2, max: 3, chance: 1 }, { id: 'meat_raw', min: 2, max: 3, chance: 1 }, { id: 'pelt', min: 1, max: 1, chance: 0.4 }],
    animal: true, sound: { alert: 'giant', attack: 'beast_0', death: 'beast_1' },
    desc: 'Lent et massif. Ses coups sont longuement annoncés par une zone rouge : sortez-en, puis punissez la fenêtre qui suit.',
  },
  husk: {
    type: 'husk', name: 'Égaré corrompu', hp: 56, speed: 52, radius: 10, sight: 3.2 * 32, leash: 10 * 32, ai: 'ambush', knockbackResist: 0.3, ccResist: 0,
    attacks: [{ kind: 'melee', windup: 0.55, damage: 12, range: 30, recover: 0.8, cooldown: 1.4 }],
    sprite: { tex: 'rodeur', fw: 64, fh: 64, layout: 'lpc_zombie', tint: 0xa9b08e },
    drops: [{ id: 'cloth', min: 1, max: 1, chance: 0.4 }, { id: 'herb', min: 1, max: 2, chance: 0.3 }, { id: 'blackmoss', min: 1, max: 1, chance: 0.2 }],
    sound: { alert: 'zgroan_1', attack: 'zattack', death: 'zdeath' },
    desc: 'Enfoui sous un monticule de boue visible, il surgit quand on passe trop près. Lent une fois debout.',
  },
  wraith: {
    type: 'wraith', name: 'Âme corrompue', hp: 60, speed: 60, radius: 11, sight: 9 * 32, leash: 14 * 32, ai: 'caster', knockbackResist: 0.5, ccResist: 0.2,
    attacks: [
      { kind: 'zone', windup: 1.1, damage: 16, range: 220, radius: 40, recover: 0.8, cooldown: 3.4, weight: 2 },
      { kind: 'spit', windup: 0.6, damage: 9, range: 200, recover: 0.5, cooldown: 2.2, speed: 220, weight: 1 },
    ],
    sprite: { tex: 'ghost', fw: 40, fh: 46, layout: 'mono', dirRows: [0, 1, 2, 3], walkFrames: 3, tint: 0xb8a2d8, scale: 1.2, foot: 0.95 },
    drops: [{ id: 'wisp', min: 1, max: 1, chance: 0.55 }, { id: 'glowcap', min: 1, max: 1, chance: 0.3 }],
    sound: { alert: 'shade_1', attack: 'shade_0', death: 'shade_1' },
    desc: 'Flotte à distance et fait jaillir des cercles d’ombre au sol : un cercle qui se remplit va exploser.',
  },
  flower: {
    type: 'flower', name: 'Fleur dévoreuse', hp: 80, speed: 0, radius: 14, sight: 3 * 32, leash: 0, ai: 'static', knockbackResist: 1, ccResist: 0.5,
    attacks: [{ kind: 'slam', windup: 0.75, damage: 14, range: 58, radius: 38, recover: 0.9, cooldown: 1.8 }],
    sprite: { tex: 'flower', fw: 60, fh: 76, layout: 'mono', dirRows: [0, 1, 2, 3], walkFrames: 3, tint: 0x9aa780, foot: 0.95 },
    drops: [{ id: 'herb', min: 1, max: 3, chance: 0.8 }, { id: 'glowcap', min: 1, max: 1, chance: 0.35 }],
    sound: { attack: 'slime', death: 'slime' },
    desc: 'Enracinée : garde un passage et frappe tout ce qui entre dans son cercle. Les attaques à distance la neutralisent.',
  },
  // ---------------------------------------------------------------- boss
  predator: {
    type: 'predator', name: 'Le Prédateur corrompu', hp: 720, speed: 78, radius: 20, sight: 9 * 32, leash: 13 * 32, ai: 'boss', knockbackResist: 0.92, ccResist: 0.75, armor: 0.1, boss: true,
    attacks: [
      { kind: 'combo', windup: 0.7, damage: 16, range: 48, radius: 44, recover: 1.0, cooldown: 2.4, count: 2, weight: 3 },
      { kind: 'charge', windup: 1.0, damage: 26, range: 260, radius: 26, recover: 1.6, cooldown: 6, weight: 2, knockback: 260 },
      { kind: 'roar', windup: 0.9, damage: 10, range: 90, radius: 110, recover: 1.2, cooldown: 11, weight: 1, phase: 2 },
      { kind: 'leap', windup: 0.9, damage: 22, range: 220, radius: 56, recover: 1.4, cooldown: 8, weight: 2, phase: 2 },
    ],
    sprite: { tex: 'bear_grizzly', fw: 64, fh: 64, layout: 'bear', dirRows: [0, 2, 3, 1], walkFrames: 4, attackRows: [4, 6, 7, 5], attackFrames: 3, scale: 1.8, tint: 0xb07a6a, foot: 0.9 },
    drops: [{ id: 'pred_fang', min: 2, max: 2, chance: 1 }, { id: 'pelt', min: 2, max: 3, chance: 1 }, { id: 'hide', min: 3, max: 4, chance: 1 }],
    animal: true, sound: { alert: 'roar_0', attack: 'beast_0', death: 'roar_1' },
    desc: 'Boss facultatif du Bois des chasseurs. Griffes en deux temps, charge en ligne, puis rugissement et bond quand il est blessé.',
  },
  chief: {
    type: 'chief', name: 'Hrodgar, chef des mercenaires', hp: 900, speed: 76, radius: 14, sight: 10 * 32, leash: 14 * 32, ai: 'boss', knockbackResist: 0.9, ccResist: 0.75, armor: 0.15, boss: true,
    attacks: [
      { kind: 'combo', windup: 0.6, damage: 14, range: 42, radius: 40, recover: 1.2, cooldown: 2.2, count: 3, weight: 3 },
      { kind: 'charge', windup: 0.85, damage: 22, range: 230, radius: 22, recover: 1.5, cooldown: 7, weight: 2, knockback: 240 },
      { kind: 'bomb', windup: 0.7, damage: 20, range: 240, radius: 52, recover: 0.8, cooldown: 8, weight: 2 },
      { kind: 'summon', windup: 1.0, damage: 0, range: 400, recover: 1.0, cooldown: 26, weight: 1, count: 2, phase: 2 },
    ],
    sprite: HUMAN_SHEET('chief', 'longsword', 'slash', undefined, 1.35),
    drops: [{ id: 'chief_insignia', min: 3, max: 3, chance: 1 }, { id: 'steel', min: 4, max: 5, chance: 1 }, { id: 'iron', min: 3, max: 4, chance: 1 }],
    sound: { alert: 'ogre', attack: 'swing_sword', death: 'ogre' },
    desc: 'Chef du bastion. Enchaînement de trois coups, charge au bouclier, bombes lancées ; appelle des renforts quand il faiblit.',
  },
  worm: {
    type: 'worm', name: 'Le Ver des profondeurs', hp: 1300, speed: 44, radius: 22, sight: 11 * 32, leash: 15 * 32, ai: 'boss', knockbackResist: 1, ccResist: 0.8, armor: 0.15, boss: true,
    attacks: [
      { kind: 'slam', windup: 1.0, damage: 24, range: 70, radius: 64, recover: 1.4, cooldown: 2.8, weight: 3 },
      { kind: 'spit', windup: 0.75, damage: 12, range: 300, recover: 0.8, cooldown: 3, speed: 240, count: 3, weight: 2 },
      { kind: 'burrow', windup: 1.2, damage: 28, range: 400, radius: 60, recover: 1.8, cooldown: 9, weight: 2 },
      { kind: 'rockfall', windup: 1.3, damage: 18, range: 400, radius: 42, recover: 0.8, cooldown: 10, weight: 1, count: 4, phase: 2 },
    ],
    sprite: { tex: 'worm', fw: 35, fh: 50, layout: 'mono', dirRows: [0, 1, 2, 3], walkFrames: 3, scale: 3, tint: 0xa88f7c, foot: 0.92 },
    drops: [{ id: 'worm_plate', min: 3, max: 3, chance: 1 }, { id: 'crystal', min: 4, max: 6, chance: 1 }, { id: 'iron_ore', min: 4, max: 6, chance: 1 }],
    sound: { alert: 'roar_1', attack: 'beast_1', death: 'roar_0' },
    desc: 'Créature massive de la carrière. S’enfouit et resurgit sous vous (cercle au sol), crache, frappe le sol ; fait tomber des rochers quand elle faiblit.',
  },
};

export const ENEMY_TYPES = Object.keys(ENEMIES) as EnemyType[];
