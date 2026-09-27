import type { EnemyType } from '../data/enemies';
import type { Family, ProjKind } from '../data/weapons';
import type { Slots, Stack } from './inventory';

export type Facing = 'up' | 'down' | 'left' | 'right';

export interface Equipment {
  weapon: Stack | null;
  armor: Stack | null;
  accessory: Stack | null;
}

/** Effets temporaires (joueur et ennemis), durées en secondes. */
export interface Statuses {
  slowT: number;
  slowMul: number; // multiplicateur de vitesse pendant le ralentissement
  rootT: number;
  stunT: number;
  poisonT: number;
  poisonDps: number;
  burnT: number;
  burnDps: number;
  curseT: number; // subit +30 %, inflige −25 %
  brokenT: number; // subit +25 %
}

export function newStatuses(): Statuses {
  return { slowT: 0, slowMul: 1, rootT: 0, stunT: 0, poisonT: 0, poisonDps: 0, burnT: 0, burnDps: 0, curseT: 0, brokenT: 0 };
}

export type PlayerAction = 'none' | 'slash' | 'thrust' | 'shoot' | 'chop' | 'spellcast';

export interface PlayerState {
  x: number;
  y: number;
  facing: Facing;
  aimX: number;
  aimY: number;
  hp: number;
  hunger: number;
  stamina: number;
  mana: number;
  inv: Slots;
  equip: Equipment;
  invuln: number;
  attackCd: number;
  actionT: number;
  action: PlayerAction;
  /** calque d'équipement affiché pendant l'action (outil de récolte ou arme) */
  actionLook: string | null;
  pendingHit: number;
  pendingMul: number;
  dodgeT: number;
  dodgeX: number;
  dodgeY: number;
  staminaDelay: number;
  manaDelay: number;
  sinceHurt: number;
  regenT: number;
  regenRate: number;
  healT: number;
  healRate: number;
  boostT: number; // potion de vigueur
  dead: boolean;
  deathT: number;
  moving: boolean;
  sprinting: boolean;
  exhausted: boolean;
  // combat V2
  xbowLoaded: boolean;
  reloadT: number;
  parryT: number;
  shield: number;
  shieldT: number;
  poisonBlade: number;
  rapidT: number;
  dashT: number;
  dashVx: number;
  dashVy: number;
  dashMul: number;
  dashHit: number[];
  weakT: number;
  /** enchaînement en cours (ultime de l'épée ou de la dague) */
  combo: { kind: 'sword' | 'dagger'; step: number; t: number; dx: number; dy: number; hit: number[] } | null;
  st: Statuses;
}

export type EnemyState = 'idle' | 'wander' | 'chase' | 'flee' | 'return' | 'hidden' | 'emerge';

export interface EnemyAttack {
  index: number;
  t: number; // temps écoulé
  phase: 'windup' | 'active' | 'recover';
  /** cible verrouillée à l'annonce (px) */
  tx: number;
  ty: number;
  dx: number;
  dy: number;
  step: number;
  hit: boolean;
  /** points d'impact multiples (chutes de pierres) */
  points?: { x: number; y: number }[];
}

export interface Enemy {
  id: number;
  type: EnemyType;
  key: string; // repère d'apparition (stable)
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dmgMul: number;
  elite: boolean;
  boss: boolean;
  phase: 1 | 2;
  state: EnemyState;
  facing: Facing;
  homeX: number;
  homeY: number;
  tx: number;
  ty: number;
  path: { x: number; y: number }[];
  pathIdx: number;
  repathT: number;
  atk: EnemyAttack | null;
  cds: number[];
  kbx: number;
  kby: number;
  hurtT: number;
  dying: number;
  moving: boolean;
  lostT: number;
  perceiveT: number;
  soundT: number;
  wanderT: number;
  stuckT: number;
  lastX: number;
  lastY: number;
  /** a visé le joueur récemment (coup dans le dos si faux) */
  aggro: boolean;
  st: Statuses;
  /** invoqué par un boss (ne rapporte pas de butin) */
  minion?: boolean;
  /** hors du sol (ver enfoui) : invulnérable */
  burrowed?: boolean;
  /** dégâts déjà comptés pour la maîtrise (plafonnés aux PV) */
  hitBy?: number;
}

/** Serviteur spectral (invocation occulte). */
export interface Ally {
  id: number;
  x: number;
  y: number;
  t: number; // durée restante
  cd: number;
  facing: Facing;
  moving: boolean;
  targetId: number;
}

export interface ProjFx {
  slow?: number; // durée
  root?: number;
  poison?: number; // dps
  burn?: number;
  stun?: number;
  interrupt?: boolean;
  curse?: boolean;
  knock?: number;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  owner: 'player' | 'enemy';
  kind: ProjKind;
  pierce: number;
  hit: number[];
  radius: number;
  aoe?: number;
  fx?: ProjFx;
  family?: Family;
  knockback: number;
  /** projectile lancé en arc (bombe) : atterrit au point visé */
  arc?: { tx: number; ty: number; t: number; dur: number; sx: number; sy: number };
}

export type ZoneKind = 'dark' | 'rain' | 'quake' | 'fire' | 'ice' | 'stone' | 'tentacle' | 'enemy_blast' | 'rock' | 'votive' | 'roar';

export interface Zone {
  id: number;
  kind: ZoneKind;
  x: number;
  y: number;
  r: number;
  /** délai avant l'effet (annonce visible) */
  delay: number;
  dur: number; // durée de l'effet après le délai
  t: number;
  owner: 'player' | 'enemy';
  damage: number; // par impulsion
  every: number; // intervalle entre impulsions (0 = une seule)
  tickT: number;
  fx?: ProjFx;
  family?: Family;
  pull?: number;
  hitOnce?: number[];
}

export type FxKind = 'slash' | 'spark' | 'blood' | 'poison' | 'fire' | 'ice' | 'dark' | 'curse' | 'shock' | 'spirit' | 'heal' | 'rays' | 'firelion' | 'iceshield' | 'snakebite' | 'torrentacle' | 'turtleshell' | 'dust';

export type GameEvent =
  | { type: 'sound'; key: string; x?: number; y?: number }
  | { type: 'toast'; text: string; kind?: 'info' | 'warn' | 'good' }
  | { type: 'float'; x: number; y: number; text: string; color?: string }
  | { type: 'shake'; strength: number }
  | { type: 'flash'; color: number }
  | { type: 'fx'; kind: FxKind; x: number; y: number; angle?: number; scale?: number }
  | { type: 'swing'; x: number; y: number; angle: number }
  | { type: 'objective'; id: string }
  | { type: 'note'; id: string }
  | { type: 'death'; summary: DeathSummary }
  | { type: 'objChanged'; id: number }
  | { type: 'buildChanged' }
  | { type: 'bagsChanged' }
  | { type: 'terrainChanged' }
  | { type: 'save'; reason: string }
  | { type: 'landmark'; name: string }
  | { type: 'ui'; panel: string; ref?: string }
  | { type: 'harvestHit'; objId: number; hp: number; maxHp: number; power: number; tool: string | null }
  | { type: 'threat'; x: number; y: number; kind: 'sound' | 'seen' }
  | { type: 'spotted'; enemyId: number }
  | { type: 'hint'; id: string; text: string }
  | { type: 'collect'; id: string; n: number }
  | { type: 'mapChanged' }
  | { type: 'boss'; name: string; active: boolean }
  | { type: 'mastery'; family: Family; level: number }
  | { type: 'runEnd'; title: string; text: string };

export interface DeathSummary {
  where: 'main' | 'farm' | 'dungeon' | 'camp';
  reason: string;
  /** région de ressources : pertes par objet */
  lost: { id: string; n: number }[];
  checkpoint: string | null;
}

export interface InputState {
  mx: number;
  my: number;
  sprint: boolean;
  attack: boolean;
  interact: boolean;
  dodge: boolean;
  attackTap: boolean;
  interactTap: boolean;
  skillTap: [boolean, boolean];
  /** visée manuelle de l'ultime : appui en cours, vecteur (−1..1), relâché (lancer), annulé */
  ultAiming: boolean;
  ultX: number;
  ultY: number;
  ultRelease: boolean;
  ultCancel: boolean;
}

export function newInput(): InputState {
  return { mx: 0, my: 0, sprint: false, attack: false, interact: false, dodge: false, attackTap: false, interactTap: false, skillTap: [false, false], ultAiming: false, ultX: 0, ultY: 0, ultRelease: false, ultCancel: false };
}

export interface Stats {
  collected: Record<string, number>;
  crafted: Record<string, number>;
  built: Record<string, number>;
  kills: Record<string, number>;
  ate: number;
  deaths: number;
  notesRead: string[];
  playTime: number;
  craftedBy: Record<string, number>;
  outings: number;
  returns: number;
  skillsUsed: number;
  ultsUsed: number;
  dummyHits: number;
}

export function newStats(): Stats {
  return { collected: {}, crafted: {}, built: {}, kills: {}, ate: 0, deaths: 0, notesRead: [], playTime: 0, craftedBy: {}, outings: 0, returns: 0, skillsUsed: 0, ultsUsed: 0, dummyHits: 0 };
}

export type MarkerCat = 'resource' | 'danger' | 'camp' | 'revisit';

export interface MapMarker {
  id: number;
  map: string;
  x: number; // tuile
  y: number;
  cat: MarkerCat;
  name: string;
}
