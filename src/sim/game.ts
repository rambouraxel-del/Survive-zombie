// Simulation du jeu, indépendante du rendu (testable sans navigateur).
// Une partie = un profil persistant (maîtrises, équipement, camp, progression) + la carte
// courante (camp, maison, région ou donjon) et, en expédition, l'instance de sortie en cours.
import { CHECKPOINT, HARVEST, HUNGER, PLAYER, SAVE, TILE, TRAP } from '../config/balance';
import { BUILDING_BY_ID } from '../data/buildings';
import { item, type Station } from '../data/items';
import { LOOT, START_CHEST } from '../data/loot';
import type { Family, SkillId } from '../data/weapons';
import { FAMILIES } from '../data/weapons';
import { mapDef } from '../maps';
import { buildWorld, type BossPoint, type SpawnPoint } from '../world/mapbuild';
import type { Building, World, WObj } from '../world/world';
import { addItem, countItem, makeSlots, newStack, type Slots, type Stack } from './inventory';
import { evaluateObjectives, OBJECTIVES } from './objectives';
import { Rng, hashSeed } from './rng';
import {
  newStats, newStatuses, type Ally, type Enemy, type GameEvent, type InputState, type MapMarker, type PlayerState,
  type Projectile, type Stats, type Zone,
} from './types';
import { updateEnemies, spawnEnemy, enemiesNear, resetEnemyGrid } from './enemies';
import { interactionTarget, type Target } from './interact';
import { autoAssignHotbar, emptyHotbar, type Hotbar } from './hotbar';
import { tickPlayerCombat, updateAllies, updateProjectiles, updateZones, tickStatuses } from './combat';
import { maxHp, staminaRegenMul, manaRegenMul, speedMul } from './profile';
import type { Variant } from '../world/mapbuild';

/** durée pendant laquelle un appui ponctuel reste en attente (s) */
const INPUT_BUFFER = 0.3;

export function makePlayer(x: number, y: number): PlayerState {
  return {
    x, y, facing: 'down', aimX: 0, aimY: 1,
    hp: PLAYER.maxHealth, hunger: 90, stamina: PLAYER.maxStamina, mana: PLAYER.maxMana,
    inv: makeSlots(24), equip: { weapon: null, armor: null, accessory: null },
    invuln: 0, attackCd: 0, actionT: 0, action: 'none', actionLook: null, pendingHit: 0, pendingMul: 1,
    dodgeT: 0, dodgeX: 0, dodgeY: 0, staminaDelay: 0, manaDelay: 0, sinceHurt: 99,
    regenT: 0, regenRate: 0, healT: 0, healRate: 0, boostT: 0,
    dead: false, deathT: 0, moving: false, sprinting: false, exhausted: false,
    xbowLoaded: true, reloadT: 0, parryT: 0, shield: 0, shieldT: 0, poisonBlade: 0, rapidT: 0,
    dashT: 0, dashVx: 0, dashVy: 0, dashMul: 1, dashHit: [], weakT: 0, combo: null, st: newStatuses(),
  };
}

/** État persistant d'une carte d'expédition (entre les visites). */
export interface LevelState {
  visited: boolean;
  status: 'new' | 'progress' | 'done';
  checkpoint: string | null;
  lit: string[];
  /** coffres permanents : contenu restant (clé du coffre -> emplacements) */
  chests: Record<string, Slots>;
  /** portes, herses et raccourcis ouverts (identifiants de groupe) */
  opened: string[];
  bosses: string[];
  notes: string[];
  fog: string;
}

export function newLevelState(): LevelState {
  return { visited: false, status: 'new', checkpoint: null, lit: [], chests: {}, opened: [], bosses: [], notes: [], fog: '' };
}

/** Instance d'expédition en cours (une sortie). */
export interface RunState {
  id: number;
  dest: string;
  map: string;
  kind: 'farm' | 'main' | 'dungeon';
  tier: number;
  seed: number;
  depleted: string[];
  /** coffres renouvelables de cette sortie (et récompense de donjon) : contenu restant */
  chests: Record<string, Slots>;
  killed: string[];
  /** ressources obtenues pendant la sortie (région de ressources) */
  gains: Record<string, number>;
  /** quantités détenues au départ (protégées) */
  pre: Record<string, number>;
  checkpoint: string | null;
  lit: string[];
  /** portes et raccourcis ouverts pendant cette instance (donjons, sorties) */
  opened: string[];
  bossDefeated: boolean;
  startedAt: number;
  /** lanternes votives allumées : fin de la protection (horloge de jeu) */
  votive: Record<string, number>;
}

export interface DungeonState {
  /** palier maximal débloqué */
  unlocked: number;
  /** paliers réussis */
  cleared: number[];
  /** horloge de jeu de la dernière victoire (délai avant une nouvelle instance récompensée) */
  lastWin: number | null;
  runs: number;
}

export interface ChoiceState {
  starter: string | null;
}

export class Game {
  world: World;
  campWorld: World;
  houseWorld: World;
  player: PlayerState;
  enemies: Enemy[] = [];
  allies: Ally[] = [];
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  nextId = 1;
  rng: Rng;
  seed: number;
  clock = 0;
  stats: Stats = newStats();
  // ---- profil
  mastery: Record<Family, number> = Object.fromEntries(FAMILIES.map((f) => [f, 0])) as Record<Family, number>;
  loadouts: Partial<Record<Family, (SkillId | null)[]>> = {};
  cooldowns: Record<string, number> = {};
  ult = 0;
  flags = new Set<string>();
  starter: string | null = null;
  completed = new Set<string>();
  journal: { t: number; text: string }[] = [];
  levels: Record<string, LevelState> = {};
  dungeons: Record<string, DungeonState> = {};
  run: RunState | null = null;
  runSeq = 0;
  /** carte des destinations : dernière destination choisie */
  lastDest = 'bois';
  hotbar: Hotbar = emptyHotbar();
  hotbarSeen = new Set<string>();
  pinned: string | null = null;
  markers: MapMarker[] = [];
  nextMarkerId = 1;
  tutorialSkipped = false;
  /** migration d'une ancienne partie : message d'explication à montrer une fois */
  migrationNote: string | null = null;
  // ---- état de la carte courante
  spawns: SpawnPoint[] = [];
  bossPoints: BossPoint[] = [];
  bossActive: { id: number; name: string } | null = null;
  forcedTarget: { key: string; until: number } | null = null;
  lastTargetKey = '';
  lastHarvestType = '';
  lastHarvestAt = -99;
  private attackBuffer = 0;
  private interactBuffer = 0;
  events: GameEvent[] = [];
  target: Target | null = null;
  private timers = { fog: 0, objectives: 0, autosave: SAVE.autosaveEvery, step: 0, hotbar: 0, area: 0 };
  harvestCd = 0;
  view = { hw: 15 * TILE, hh: 9 * TILE };
  openContainer: { kind: 'obj' | 'building' | 'bag'; id: number; world?: 'camp' | 'house' } | null = null;
  lastArea = '';

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.rng = new Rng(seed ^ 0x5bd1e995);
    this.campWorld = buildWorld(mapDef('camp'), 'main', 1).world;
    this.houseWorld = buildWorld(mapDef('house'), 'main', 1).world;
    this.world = this.campWorld;
    this.player = makePlayer((this.world.start.x + 0.5) * TILE, (this.world.start.y + 0.5) * TILE);
  }

  /** Nouvelle partie : camp et maison avec leurs installations de départ. */
  static newGame(seed: number): Game {
    const g = new Game(seed);
    for (const [w, id] of [[g.campWorld, 'camp'], [g.houseWorld, 'house']] as const) {
      for (const b of buildWorld(mapDef(id), 'main', 1).buildings) w.addBuilding(b.type, b.x, b.y);
    }
    // coffre de départ près de la maison
    const chest = [...g.campWorld.buildings.values()].find((b) => b.type === 'chest');
    if (chest?.items) for (const s of START_CHEST) addItem(chest.items, s.id, s.qty);
    g.player.hp = maxHp(g);
    g.world.discover(g.player.x, g.player.y, 30);
    return g;
  }

  get mapId(): string {
    return this.world.id;
  }

  get atCamp(): boolean {
    return this.world === this.campWorld || this.world === this.houseWorld;
  }

  level(map: string): LevelState {
    return (this.levels[map] ??= newLevelState());
  }

  dungeon(id: string): DungeonState {
    return (this.dungeons[id] ??= { unlocked: 1, cleared: [], lastWin: null, runs: 0 });
  }

  newId(): number {
    return this.nextId++;
  }

  emit(e: GameEvent): void {
    this.events.push(e);
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }

  toast(text: string, kind: 'info' | 'warn' | 'good' = 'info'): void {
    this.emit({ type: 'toast', text, kind });
  }

  log(text: string): void {
    this.journal.push({ t: Math.round(this.stats.playTime), text });
    if (this.journal.length > 80) this.journal.shift();
  }

  // ---------------------------------------------------------------- inventaire
  /** Ajoute au sac ; le surplus tombe au sol dans un sac. Jamais de perte silencieuse. */
  give(id: string, qty: number, opts: { collected?: boolean; ench?: string } = {}): void {
    const left = addItem(this.player.inv, id, qty, opts.ench);
    const got = qty - left;
    if (opts.collected && got > 0) this.stats.collected[id] = (this.stats.collected[id] ?? 0) + got;
    // ressources de sortie (région de ressources) : traçabilité de la provenance
    if (this.run && this.run.kind === 'farm' && got > 0 && (item(id).kind === 'resource' || item(id).kind === 'rare' || item(id).kind === 'food')) {
      this.run.gains[id] = (this.run.gains[id] ?? 0) + got;
    }
    if (left > 0) {
      this.dropNear(this.player.x, this.player.y, [newStack(id, left, opts.ench)]);
      this.toast(`Sac plein : ${left} × ${item(id).name} déposé(s) au sol dans un sac.`, 'warn');
    }
  }

  dropNear(x: number, y: number, stacks: Stack[]): void {
    for (const bag of this.world.bags.values()) {
      if (Math.hypot(bag.x - x, bag.y - y) < 24) {
        const rest: Stack[] = [];
        for (const st of stacks) {
          const left = addItem(bag.items, st.id, st.qty, st.ench);
          if (left > 0) rest.push({ ...st, qty: left });
        }
        stacks = rest;
        if (!stacks.length) {
          this.emit({ type: 'bagsChanged' });
          return;
        }
      }
    }
    const slots: Slots = makeSlots(Math.max(8, stacks.length));
    stacks.forEach((s, i) => (slots[i] = { ...s }));
    this.world.addBag(x, y, slots, 'drop');
    this.emit({ type: 'bagsChanged' });
  }

  noise(x: number, y: number, radius: number): void {
    for (const e of enemiesNear(this, x, y, radius)) {
      if (e.state === 'idle' || e.state === 'wander') {
        e.state = 'chase';
        e.aggro = true;
        e.repathT = 0;
      }
    }
  }

  movePlayer(dx: number, dy: number): void {
    const p = this.player;
    const r = PLAYER.radius;
    const w = this.world;
    const blocked = (x: number, y: number) => {
      const x0 = Math.floor((x - r) / TILE);
      const x1 = Math.floor((x + r) / TILE);
      const y0 = Math.floor((y - r * 0.6) / TILE);
      const y1 = Math.floor((y + r * 0.4) / TILE);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (!w.passableForPlayer(tx, ty)) return true;
      return false;
    };
    if (dx) {
      const nx = p.x + dx;
      if (!blocked(nx, p.y)) p.x = nx;
    }
    if (dy) {
      const ny = p.y + dy;
      if (!blocked(p.x, ny)) p.y = ny;
    }
  }

  // ---------------------------------------------------------------- boucle
  step(dt: number, input: InputState): void {
    this.clock += dt;
    this.stats.playTime += dt;
    this.harvestCd = Math.max(0, this.harvestCd - dt);
    // recharges des compétences : elles avancent même quand la famille n'est pas équipée
    for (const k in this.cooldowns) {
      this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
      if (this.cooldowns[k] <= 0) delete this.cooldowns[k];
    }
    this.updatePlayer(dt, input);
    updateEnemies(this, dt);
    updateAllies(this, dt);
    updateProjectiles(this, dt);
    updateZones(this, dt);
    this.updateBuildings(dt);
    this.periodic(dt);
    this.target = this.player.dead ? null : interactionTarget(this);
  }

  private updatePlayer(dt: number, input: InputState): void {
    const p = this.player;
    if (p.dead) {
      p.deathT -= dt;
      return;
    }
    const mhp = maxHp(this);
    p.invuln = Math.max(0, p.invuln - dt);
    p.attackCd = Math.max(0, p.attackCd - dt);
    p.weakT = Math.max(0, p.weakT - dt);
    p.boostT = Math.max(0, p.boostT - dt);
    p.sinceHurt += dt;
    tickStatuses(this, p.st, dt, null);

    // faim : seulement en expédition, effets progressifs
    if (this.run) {
      p.hunger = Math.max(0, p.hunger - HUNGER.drainPerSec * dt);
      if (p.hunger <= 0 && p.hp > HUNGER.starveFloor) p.hp = Math.max(HUNGER.starveFloor, p.hp - HUNGER.starveDps * dt);
    }
    // soins
    if (p.healT > 0) {
      p.healT -= dt;
      p.hp = Math.min(mhp, p.hp + p.healRate * dt);
    }
    if (p.regenT > 0) {
      p.regenT -= dt;
      p.hp = Math.min(mhp, p.hp + p.regenRate * dt);
    }
    if (this.atCamp) p.hp = Math.min(mhp, p.hp + PLAYER.campRegenPerSec * dt);
    else if (p.hunger >= HUNGER.noRegenBelow && p.sinceHurt > PLAYER.regenCombatDelay) p.hp = Math.min(mhp, p.hp + PLAYER.regenPerSec * dt);
    if (p.hp > mhp) p.hp = mhp;

    // endurance et mana
    p.staminaDelay = Math.max(0, p.staminaDelay - dt);
    p.manaDelay = Math.max(0, p.manaDelay - dt);
    const len = Math.hypot(input.mx, input.my);
    p.moving = len > 0.15 && p.st.rootT <= 0 && p.st.stunT <= 0;
    const wantSprint = input.sprint && p.moving && !p.exhausted;
    p.sprinting = wantSprint && p.stamina > 0;
    if (p.sprinting) {
      p.stamina = Math.max(0, p.stamina - PLAYER.sprintCostPerSec * dt);
      p.staminaDelay = PLAYER.staminaRegenDelay;
      if (p.stamina <= 0) p.exhausted = true;
    }
    if (p.staminaDelay <= 0) p.stamina = Math.min(PLAYER.maxStamina, p.stamina + PLAYER.staminaRegenPerSec * staminaRegenMul(this) * dt);
    if (p.manaDelay <= 0) p.mana = Math.min(PLAYER.maxMana, p.mana + PLAYER.manaRegenPerSec * manaRegenMul(this) * dt);
    if (p.exhausted && p.stamina > 30) p.exhausted = false;

    // esquive (interrompt une incantation d'ultime en visée)
    if (input.dodge) {
      input.dodge = false;
      if (p.dodgeT <= 0 && p.stamina >= PLAYER.dodgeCost && p.st.stunT <= 0 && p.st.rootT <= 0 && !p.combo) {
        const dx = p.moving ? input.mx / len : p.aimX;
        const dy = p.moving ? input.my / len : p.aimY;
        p.dodgeT = PLAYER.dodgeDuration;
        p.dodgeX = dx;
        p.dodgeY = dy;
        p.stamina -= PLAYER.dodgeCost;
        p.staminaDelay = PLAYER.staminaRegenDelay;
        this.emit({ type: 'sound', key: 'swing_1' });
      } else if (p.stamina < PLAYER.dodgeCost) {
        this.emit({ type: 'float', x: p.x, y: p.y - 44, text: 'Trop fatigué', color: '#f5d76e' });
      }
    }
    const slow = p.st.slowT > 0 ? p.st.slowMul : 1;
    if (p.dodgeT > 0) {
      p.dodgeT -= dt;
      this.movePlayer(p.dodgeX * PLAYER.dodgeSpeed * dt, 0);
      this.movePlayer(0, p.dodgeY * PLAYER.dodgeSpeed * dt);
    } else if (p.dashT > 0 || p.combo) {
      // déplacement géré par le combat (fente, danse des ombres, tempête d'acier)
    } else if (p.moving) {
      const k = Math.min(1, len);
      const actionSlow = p.actionT > 0 ? 0.55 : 1;
      const sp = PLAYER.speed * speedMul(this) * k * (p.sprinting ? PLAYER.sprintMult : 1) * actionSlow * slow * (input.ultAiming ? 0.5 : 1);
      const nx = input.mx / len;
      const ny = input.my / len;
      this.movePlayer(nx * sp * dt, 0);
      this.movePlayer(0, ny * sp * dt);
      if (p.actionT <= 0 && !input.ultAiming) {
        p.aimX = nx;
        p.aimY = ny;
        p.facing = Math.abs(nx) > Math.abs(ny) ? (nx < 0 ? 'left' : 'right') : ny < 0 ? 'up' : 'down';
      }
      this.timers.step -= dt * (p.sprinting ? 1.5 : 1);
      if (this.timers.step <= 0) {
        this.timers.step = 0.36;
        this.emit({ type: 'sound', key: this.stepSound() });
      }
    }

    if (p.actionT > 0) p.actionT -= dt;
    else if (p.action !== 'none') {
      p.action = 'none';
      p.actionLook = null;
    }
    // appuis ponctuels mis en attente brièvement : jamais perdus
    if (input.attackTap) {
      input.attackTap = false;
      this.attackBuffer = INPUT_BUFFER;
    }
    if (input.interactTap) {
      input.interactTap = false;
      this.interactBuffer = INPUT_BUFFER;
    }
    this.attackBuffer = Math.max(0, this.attackBuffer - dt);
    this.interactBuffer = Math.max(0, this.interactBuffer - dt);
    const wantAttack = input.attack || this.attackBuffer > 0;
    const wantInteract = input.interact || this.interactBuffer > 0;
    const acted = tickPlayerCombat(this, dt, input, wantAttack);
    if (acted === 'attack') this.attackBuffer = 0;
    else if (acted === 'harvest') {
      // sans ennemi à portée, le bouton d'attaque récolte aussi
      this.attackBuffer = 0;
      if (p.actionT <= 0 && this.harvestCd <= 0) this.interact();
    } else if (wantInteract && p.actionT <= 0 && this.harvestCd <= 0 && !p.combo && p.dashT <= 0) {
      this.interactBuffer = 0;
      this.interact();
    }
  }

  private stepSound(): string {
    const p = this.player;
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor(p.y / TILE);
    const w = this.world;
    const i = w.inBounds(tx, ty) ? w.idx(tx, ty) : 0;
    const r = this.rng.int(0, 1);
    if (w.bridge[i] || w.floor[i] === 2) return `step_wood_${r}`;
    if (w.floor[i] === 1) return `step_stone_${r}`;
    if (w.def.id === 'marais') return `step_water_${r}`;
    if (!w.isGrassTile(tx, ty)) return `step_dirt_${r}`;
    return `step_${this.rng.int(0, 2)}`;
  }

  /** Niveau de la station la plus proche à portée (0 si aucune). */
  stationLevel(st: Station): number {
    if (st === 'hand') return 1;
    const p = this.player;
    let lvl = 0;
    for (const b of this.nearbyBuildings(p.x, p.y, 4 * TILE)) {
      const d = BUILDING_BY_ID[b.type];
      if (d.station !== st) continue;
      const dx = Math.max(b.x * TILE - p.x, 0, p.x - (b.x + d.w) * TILE);
      const dy = Math.max(b.y * TILE - p.y, 0, p.y - (b.y + d.h) * TILE);
      if (Math.hypot(dx, dy) <= 1.8 * TILE) lvl = Math.max(lvl, b.level ?? 1);
    }
    return lvl;
  }

  nearbyBuildings(x: number, y: number, r: number): Building[] {
    const out: Building[] = [];
    const w = this.world;
    const seen = new Set<number>();
    for (let ty = Math.floor((y - r) / TILE); ty <= Math.floor((y + r) / TILE); ty++)
      for (let tx = Math.floor((x - r) / TILE); tx <= Math.floor((x + r) / TILE); tx++) {
        const b = w.buildingAtTile(tx, ty);
        if (!b || seen.has(b.id)) continue;
        seen.add(b.id);
        const c = w.buildingCenter(b);
        if (Math.hypot(c.x - x, c.y - y) <= r) out.push(b);
      }
    return out;
  }

  nearStation(st: Station): boolean {
    return this.stationLevel(st) > 0;
  }

  /** Coffres du camp et de la maison (fabrication au camp : le sac d'abord, puis les coffres). */
  campChests(): Slots[] {
    if (!this.atCamp) return [];
    const out: Slots[] = [];
    for (const w of [this.campWorld, this.houseWorld]) for (const b of w.buildings.values()) if (b.items) out.push(b.items);
    return out;
  }

  // ---------------------------------------------------------------- interaction
  interact(): void {
    const t = this.target;
    if (!t) return;
    t.run(this);
    if (t.kind !== 'harvest') this.harvestCd = Math.max(this.harvestCd, 0.6);
  }

  /** Coup de récolte sur un objet du monde. */
  harvest(o: WObj): void {
    const p = this.player;
    const needs: Record<string, 'axe' | 'pick' | null> = {
      tree: 'axe', rock: 'pick', ore_iron: 'pick', ore_coal: 'pick', crystal: 'pick', bush: null, grass: null, morel: null, herb: null, blackmoss: null, glowcap: null,
    };
    const toolType = needs[o.type];
    let power = 1;
    let toolId: string | null = null;
    if (toolType) {
      for (const s of p.inv) {
        if (!s) continue;
        const d = item(s.id);
        if (d.tool?.type === toolType && d.tool.power > power) {
          power = d.tool.power;
          toolId = s.id;
        }
      }
      if ((o.type === 'ore_iron' || o.type === 'ore_coal' || o.type === 'crystal') && !toolId) {
        this.emit({ type: 'float', x: (o.fx + o.fw / 2) * TILE, y: o.fy * TILE - 10, text: 'Il faut une masse ou une pioche', color: '#f5d76e' });
        this.harvestCd = 0.6;
        return;
      }
    }
    p.action = toolId ? 'chop' : 'slash';
    p.actionLook = toolId ? (item(toolId).tool!.type === 'axe' ? 'axe' : toolId === 'iron_pick' ? 'pick' : 'hammer') : null;
    p.actionT = toolId ? 0.4 : 0.34;
    this.harvestCd = toolType ? 0.46 : 0.3;
    this.lastHarvestType = o.type;
    this.lastHarvestAt = this.clock;
    const cx = (o.fx + o.fw / 2) * TILE;
    const cy = (o.fy + o.fh) * TILE - 8;
    const dx = cx - p.x;
    const dy = cy - p.y;
    const d = Math.hypot(dx, dy) || 1;
    p.aimX = dx / d;
    p.aimY = dy / d;
    p.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    o.hp = (o.hp ?? 1) - power;
    const sound = o.type === 'tree' ? `chop_${this.rng.int(0, 2)}` : toolType === 'pick' ? `mine_${this.rng.int(0, 2)}` : `pick_${this.rng.int(0, 1)}`;
    this.emit({ type: 'sound', key: sound, x: cx, y: cy });
    this.emit({ type: 'objChanged', id: o.id });
    this.emit({ type: 'harvestHit', objId: o.id, hp: Math.max(0, o.hp ?? 0), maxHp: o.maxHp ?? 1, power, tool: toolId });
    if (toolType) this.noise(cx, cy, HARVEST.noiseRadius);
    if (toolType === 'axe' && !toolId && (o.maxHp ?? 1) > 1) this.emit({ type: 'hint', id: 'axe', text: 'À mains nues, un arbre demande 6 coups. Une hache de pierre (dans le sac) le coupe en 3.' });
    if (toolType === 'pick' && !toolId && (o.maxHp ?? 1) > 1) this.emit({ type: 'hint', id: 'pick', text: 'Une masse de carrier dans le sac casse la roche deux fois plus vite et extrait le minerai.' });
    if ((o.hp ?? 0) > 0) return;

    const yields: [string, number][] = [];
    switch (o.type) {
      case 'tree':
        yields.push(['wood', o.label === 'dead' ? 3 : 4 + (this.rng.chance(0.4) ? 1 : 0)]);
        break;
      case 'rock':
        yields.push(['stone', o.label === 'big' ? 5 : 3]);
        if (this.rng.chance(0.15)) yields.push(['coal', 1]);
        break;
      case 'ore_iron':
        yields.push(['iron_ore', 2], ['stone', 1]);
        break;
      case 'ore_coal':
        yields.push(['coal', 2]);
        break;
      case 'crystal':
        yields.push(['crystal', 1 + (this.rng.chance(0.3) ? 1 : 0)], ['stone', 1]);
        break;
      case 'bush':
        yields.push(['berries', 3 + (this.rng.chance(0.3) ? 1 : 0)]);
        break;
      case 'grass':
        yields.push(['fiber', 2 + (this.rng.chance(0.3) ? 1 : 0)]);
        break;
      case 'morel':
        yields.push(['morel', 1 + (this.rng.chance(0.35) ? 1 : 0)]);
        break;
      case 'herb':
        yields.push(['herb', 1 + (this.rng.chance(0.4) ? 1 : 0)]);
        break;
      case 'blackmoss':
        yields.push(['blackmoss', 1 + (this.rng.chance(0.3) ? 1 : 0)]);
        break;
      case 'glowcap':
        yields.push(['glowcap', 1 + (this.rng.chance(0.3) ? 1 : 0)]);
        break;
    }
    let fy = cy - 30;
    for (const [id, n] of yields) {
      this.give(id, n, { collected: true });
      this.emit({ type: 'float', x: cx, y: fy, text: `+${n} ${item(id).name}`, color: '#d9f7a6' });
      this.emit({ type: 'collect', id, n });
      fy -= 14;
    }
    this.depleteObject(o);
  }

  depleteObject(o: WObj): void {
    o.depleted = true;
    if (o.type === 'tree' || o.type === 'bush') o.solid = true;
    else {
      o.solid = false;
      this.world.unstampObject(o);
    }
    if (this.run && !this.run.depleted.includes(o.key)) this.run.depleted.push(o.key);
    this.emit({ type: 'objChanged', id: o.id });
  }

  /** Contenu d'un coffre du monde : tiré une seule fois par instance (ou une seule fois pour toujours). */
  openWorldContainer(o: WObj): Slots {
    if (!o.items) {
      const slots = makeSlots(10);
      const r = new Rng(hashSeed(`${this.seed}:${o.key}:${o.renew ? this.run?.id ?? 0 : 0}`));
      const t = o.loot ? LOOT[o.loot] : undefined;
      if (t) {
        for (const gi of t.guaranteed ?? []) addItem(slots, gi.id, gi.qty);
        const rolls = r.int(t.rolls[0], t.rolls[1]);
        for (let i = 0; i < rolls; i++) {
          const e = r.weighted(t.entries);
          addItem(slots, e.id, r.int(e.min, e.max));
        }
        if (t.rare && r.chance(t.rare.chance) && !this.ownsAnywhere(t.rare.id)) {
          addItem(slots, t.rare.id, 1);
          this.toast('Trouvaille exceptionnelle !', 'good');
        }
      }
      o.items = slots;
      o.opened = true;
      this.recordChest(o);
      this.emit({ type: 'objChanged', id: o.id });
    }
    this.emit({ type: 'sound', key: 'chest' });
    return o.items;
  }

  /** Mémorise le contenu restant d'un coffre (persistant ou de l'instance). */
  recordChest(o: WObj): void {
    if (!o.items) return;
    if (o.renew || o.key.startsWith('reward:')) {
      if (this.run) this.run.chests[o.key] = o.items;
    } else if (!this.atCamp) this.level(this.mapId).chests[o.key] = o.items;
  }

  /** L'objet unique est-il déjà possédé (sac, équipement, coffres du camp) ? */
  ownsAnywhere(id: string): boolean {
    const p = this.player;
    if (countItem(p.inv, id) > 0) return true;
    if ([p.equip.weapon, p.equip.armor, p.equip.accessory].some((s) => s?.id === id)) return true;
    for (const w of [this.campWorld, this.houseWorld]) for (const b of w.buildings.values()) if (b.items && countItem(b.items, id) > 0) return true;
    return false;
  }

  // ---------------------------------------------------------------- constructions
  private updateBuildings(dt: number): void {
    if (this.world !== this.campWorld) return;
    for (const b of this.world.buildings.values()) {
      if (b.type !== 'trap') continue;
      b.trapTimer = (b.trapTimer ?? 0) + dt;
      if (b.trapTimer >= TRAP.checkEvery) {
        b.trapTimer = 0;
        if ((b.meat ?? 0) < TRAP.maxMeat && this.rng.chance(TRAP.chance)) {
          b.meat = (b.meat ?? 0) + 1;
          this.emit({ type: 'buildChanged' });
        }
      }
    }
  }

  // ---------------------------------------------------------------- carte courante
  /** Ennemis présents : points d'apparition non vaincus de l'instance. */
  spawnFromPoints(variant: Variant): void {
    this.enemies = [];
    resetEnemyGrid();
    this.bossActive = null;
    const run = this.run;
    if (!run) return;
    for (const sp of this.spawns) {
      if (run.kind === 'dungeon') continue; // les donjons composent leurs rencontres (travel.ts)
      sp.group.forEach((t, i) => {
        const key = `${sp.key}#${i}`;
        if (run.killed.includes(key)) return;
        const x = (sp.x + 0.5) * TILE + (i ? (i % 2 ? 14 : -14) : 0);
        const y = (sp.y + 0.5) * TILE + (i > 1 ? 14 : 0);
        spawnEnemy(this, t, x, y, { key, asleep: sp.asleep });
      });
    }
    for (const bp of this.bossPoints) {
      if (variant === 'dungeon') continue;
      if (this.level(this.mapId).bosses.includes(bp.key) || run.killed.includes(bp.key)) continue;
      spawnEnemy(this, bp.type, (bp.x + 0.5) * TILE, (bp.y + 0.5) * TILE, { key: bp.key, boss: true });
    }
  }

  /** Lanterne votive active à proximité : zone sûre temporaire (les créatures s'en écartent). */
  safeAt(x: number, y: number): boolean {
    const run = this.run;
    if (!run) return false;
    for (const [key, until] of Object.entries(run.votive)) {
      if (this.clock > until) continue;
      const o = this.world.byKey.get(key);
      if (!o) continue;
      if (Math.hypot((o.fx + 0.5) * TILE - x, (o.fy + 0.5) * TILE - y) < CHECKPOINT.votiveRadius) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- périodique
  private periodic(dt: number): void {
    const t = this.timers;
    const p = this.player;
    t.fog -= dt;
    if (t.fog <= 0) {
      t.fog = 0.4;
      this.world.discover(p.x, p.y, 10);
      for (const lm of this.world.landmarks) {
        if (!lm.discovered && Math.hypot((lm.x + 0.5) * TILE - p.x, (lm.y + 0.5) * TILE - p.y) < 7 * TILE) {
          lm.discovered = true;
          this.emit({ type: 'landmark', name: lm.name });
        }
      }
      const a = this.world.areaAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
      const an = a?.name ?? '';
      if (an !== this.lastArea) {
        this.lastArea = an;
        if (a?.landmark) this.emit({ type: 'landmark', name: a.name });
      }
    }
    t.objectives -= dt;
    if (t.objectives <= 0) {
      t.objectives = 0.5;
      for (const id of evaluateObjectives(this)) {
        const o = OBJECTIVES.find((x) => x.id === id)!;
        this.toast(`Objectif accompli : ${o.title}`, 'good');
        this.log(`Objectif accompli : ${o.title}`);
        this.emit({ type: 'sound', key: 'objective' });
        this.emit({ type: 'objective', id });
        this.emit({ type: 'save', reason: 'objective' });
      }
    }
    t.hotbar -= dt;
    if (t.hotbar <= 0) {
      t.hotbar = 0.25;
      autoAssignHotbar(this);
    }
    t.autosave -= dt;
    if (t.autosave <= 0) {
      t.autosave = SAVE.autosaveEvery;
      this.emit({ type: 'save', reason: 'periodic' });
    }
  }
}
