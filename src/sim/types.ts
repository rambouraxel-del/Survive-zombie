import type { EnemyType } from '../data/enemies';
import type { Slots, Stack } from './inventory';

export type Facing = 'up' | 'down' | 'left' | 'right';

export interface Equipment {
  weapon: Stack | null;
  tool: Stack | null;
  armor: Stack | null;
}

export interface PlayerState {
  x: number;
  y: number;
  facing: Facing;
  aimX: number;
  aimY: number;
  hp: number;
  hunger: number;
  stamina: number;
  inv: Slots;
  equip: Equipment;
  invuln: number;
  attackCd: number;
  actionT: number; // durée restante de l'animation d'action
  action: 'none' | 'slash' | 'thrust' | 'shoot' | 'chop';
  /** objet réellement utilisé pour l'action en cours (affiché en main) */
  actionItem: string | null;
  pendingHit: number; // délai avant application du coup
  dodgeT: number;
  dodgeX: number;
  dodgeY: number;
  staminaDelay: number;
  sinceHurt: number;
  regenT: number;
  regenRate: number;
  healT: number;
  healRate: number;
  dead: boolean;
  deathT: number;
  moving: boolean;
  sprinting: boolean;
  exhausted: boolean;
}

export type EnemyState = 'wander' | 'investigate' | 'chase' | 'search' | 'retreat';

export interface Enemy {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  hp: number;
  state: EnemyState;
  facing: Facing;
  tx: number; // destination courante (px)
  ty: number;
  path: { x: number; y: number }[];
  pathIdx: number;
  repathT: number;
  blockerId: number;
  windup: number; // >0 : attaque annoncée en cours
  windupTarget: 'player' | number; // joueur ou id de construction
  cooldown: number;
  wanderT: number;
  searchT: number;
  lostT: number;
  lastSeenX: number;
  lastSeenY: number;
  kbx: number;
  kby: number;
  hurtT: number;
  dying: number; // >0 : animation de mort
  kind: 'ambient' | 'assault' | 'guardian' | 'final';
  perceiveT: number;
  groanT: number;
  stuckT: number;
  lastX: number;
  lastY: number;
  moving: boolean;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
}

export type GameEvent =
  | { type: 'sound'; key: string; x?: number; y?: number }
  | { type: 'toast'; text: string; kind?: 'info' | 'warn' | 'good' }
  | { type: 'float'; x: number; y: number; text: string; color?: string }
  | { type: 'shake'; strength: number }
  | { type: 'hitfx'; x: number; y: number }
  | { type: 'swing'; x: number; y: number; angle: number }
  | { type: 'objective'; id: string }
  | { type: 'note'; id: string }
  | { type: 'death'; reason: string; lost: number; hasBag: boolean; atBed: boolean }
  | { type: 'victory' }
  | { type: 'objChanged'; id: number }
  | { type: 'buildChanged' }
  | { type: 'bagsChanged' }
  | { type: 'save'; reason: string }
  | { type: 'landmark'; name: string }
  | { type: 'ui'; panel: 'container' | 'note' | 'craft' | 'sanctuary' | 'bed'; ref?: string }
  | { type: 'harvestHit'; objId: number; hp: number; maxHp: number; power: number; tool: string | null }
  | { type: 'threat'; x: number; y: number; kind: 'sound' | 'seen' }
  | { type: 'spotted'; enemyId: number }
  | { type: 'hint'; id: string; text: string }
  | { type: 'collect'; id: string; n: number };

export interface InputState {
  mx: number;
  my: number;
  sprint: boolean;
  attack: boolean; // maintenu (répétition à la cadence de l'arme)
  interact: boolean; // maintenu (récolte répétée)
  dodge: boolean; // front montant consommé par la simulation
  /** appuis ponctuels mis en attente : consommés par la simulation, jamais perdus
   * même si l'appui et le relâchement surviennent entre deux pas de simulation */
  attackTap: boolean;
  interactTap: boolean;
}

export interface Assault {
  night: number;
  total: number;
  spawned: number;
  timer: number;
  announced: boolean;
  done: boolean;
}

export interface FinalState {
  state: 'locked' | 'ready' | 'active' | 'won';
  wave: number;
  pause: number;
  spawnedWave: boolean;
}

export interface Stats {
  collected: Record<string, number>;
  crafted: Record<string, number>;
  built: Record<string, number>;
  ate: number;
  kills: number;
  deaths: number;
  nightsSurvived: number;
  notesRead: string[];
  cursedVisited: string[];
  guardiansSpawned: string[];
  playTime: number;
  /** traçabilité par recette (ex. fer depuis minerai ou ferraille) */
  craftedBy: Record<string, number>;
  scenesVisited: string[];
}

export type MarkerCat = 'resource' | 'danger' | 'camp' | 'revisit';

export interface MapMarker {
  id: number;
  x: number; // tuile
  y: number;
  cat: MarkerCat;
  name: string;
}
