// Simulation du jeu, indépendante du rendu (testable sans navigateur).
import { DAY, DEATH, HARVEST, PLAYER, SAVE, TILE, TRAP } from '../config/balance';
import { BUILDING_BY_ID } from '../data/buildings';
import { item, type ItemDef, type Station } from '../data/items';
import { GUARANTEED, LOOT } from '../data/loot';
import { createWorld } from '../world/generate';
import type { Building, World, WObj } from '../world/world';
import { addItem, countItem, makeSlots, newStack, removeItem, type Slots, type Stack } from './inventory';
import { evaluateObjectives, nightChecklist, OBJECTIVES } from './objectives';
import { Rng } from './rng';
import type { Assault, Enemy, FinalState, GameEvent, InputState, PlayerState, Projectile, Stats } from './types';
import { updateEnemies, updateSpawning, damageEnemy, enemiesNear } from './enemies';
import { interactionTarget, type Target } from './interact';
import { autoAssignHotbar, emptyHotbar, type Hotbar } from './hotbar';
import type { MapMarker } from './types';

export type Phase = 'day' | 'dusk' | 'night' | 'dawn';

/** durée pendant laquelle un appui ponctuel reste en attente (s) */
const INPUT_BUFFER = 0.3;

export const PHASE_NAMES: Record<Phase, string> = { day: 'Jour', dusk: 'Crépuscule', night: 'Nuit', dawn: 'Aube' };

export function makePlayer(x: number, y: number): PlayerState {
  return {
    x, y, facing: 'down', aimX: 0, aimY: 1,
    hp: PLAYER.maxHealth, hunger: 85, stamina: PLAYER.maxStamina,
    inv: makeSlots(24), equip: { weapon: null, tool: null, armor: null },
    invuln: 0, attackCd: 0, actionT: 0, action: 'none', actionItem: null, pendingHit: 0,
    dodgeT: 0, dodgeX: 0, dodgeY: 0, staminaDelay: 0, sinceHurt: 99,
    regenT: 0, regenRate: 0, healT: 0, healRate: 0,
    dead: false, deathT: 0, moving: false, sprinting: false, exhausted: false,
  };
}

export class Game {
  world: World;
  player: PlayerState;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  nextEnemyId = 1;
  rng: Rng;
  clock = 0; // temps de jeu total (s)
  day = 1;
  dayTime: number = DAY.startTime;
  assault: Assault | null = null;
  final: FinalState = { state: 'locked', wave: 0, pause: 0, spawnedWave: false };
  freed = false;
  stats: Stats = {
    collected: {}, crafted: {}, built: {}, ate: 0, kills: 0, deaths: 0,
    nightsSurvived: 0, notesRead: [], cursedVisited: [], guardiansSpawned: [], playTime: 0,
    craftedBy: {}, scenesVisited: [],
  };
  /** barre rapide indépendante du sac */
  hotbar: Hotbar = emptyHotbar();
  /** objets déjà proposés automatiquement en raccourci */
  hotbarSeen = new Set<string>();
  /** recette suivie (épinglée) */
  pinned: string | null = null;
  markers: MapMarker[] = [];
  nextMarkerId = 1;
  /** version du générateur de monde (les anciennes parties gardent leur monde) */
  genVersion = 2;
  tutorialSkipped = false;
  /** cible choisie explicitement au toucher (prioritaire quelques secondes) */
  forcedTarget: { key: string; until: number } | null = null;
  /** dernière cible, pour éviter qu'elle change trop vite entre deux objets voisins */
  lastTargetKey = '';
  lastHarvestType = '';
  lastHarvestAt = -99;
  /** appuis ponctuels en attente (s restantes) */
  private attackBuffer = 0;
  private interactBuffer = 0;
  completed = new Set<string>();
  fragmentsTaken: string[] = [];
  depleted = new Set<number>();
  events: GameEvent[] = [];
  target: Target | null = null;
  private timers = { fog: 0, objectives: 0, regrow: 0, spawn: 0, autosave: 0, step: 0, hotbar: 0 };
  lastPhase: Phase = 'day';
  deathBagId = -1;
  sanctuaryRestored = false;
  victorySeen = false;
  harvestCd = 0;
  spawnTimer = 0;
  /** demi-dimensions de la vue caméra (px), fournies par le rendu */
  view = { hw: 15 * TILE, hh: 9 * TILE };
  openContainer: { kind: 'obj' | 'building' | 'bag'; id: number } | null = null;

  constructor(world: World, seed: number) {
    this.world = world;
    this.rng = new Rng(seed ^ 0x5bd1e995);
    this.player = makePlayer((world.start.x + 0.5) * TILE, (world.start.y + 0.5) * TILE);
    this.lastPhase = this.phase();
  }

  static newGame(seed: number, genVersion = 2): Game {
    const { world } = createWorld(seed, genVersion);
    const g = new Game(world, world.seed);
    g.genVersion = genVersion;
    g.world.discover(g.player.x, g.player.y, 10);
    return g;
  }

  emit(e: GameEvent): void {
    this.events.push(e);
    if (this.events.length > 300) this.events.splice(0, this.events.length - 300);
  }

  toast(text: string, kind: 'info' | 'warn' | 'good' = 'info'): void {
    this.emit({ type: 'toast', text, kind });
  }

  // ---------------------------------------------------------------- temps
  phase(t = this.dayTime): Phase {
    if (t >= DAY.dawnStart) return 'dawn';
    if (t >= DAY.nightStart) return 'night';
    if (t >= DAY.duskStart) return 'dusk';
    return 'day';
  }

  isDark(): boolean {
    const p = this.phase();
    return p === 'night' || p === 'dusk';
  }

  /** 0 = plein jour, 1 = pleine nuit */
  darkness(): number {
    const t = this.dayTime;
    if (t < DAY.duskStart) return 0;
    if (t < DAY.nightStart) return (t - DAY.duskStart) / (DAY.nightStart - DAY.duskStart);
    if (t < DAY.dawnStart) return 1;
    return 1 - (t - DAY.dawnStart) / (DAY.length - DAY.dawnStart);
  }

  // ---------------------------------------------------------------- joueur
  weaponDef(): ItemDef | null {
    const w = this.player.equip.weapon;
    if (w && w.dur !== 0) return item(w.id);
    const t = this.player.equip.tool;
    if (!w && t && t.dur !== 0 && item(t.id).weapon) return item(t.id);
    return null;
  }

  lightRadius(): number {
    const t = this.player.equip.tool;
    if (t && t.dur !== 0 && item(t.id).light) return item(t.id).light!;
    return 0;
  }

  armorReduction(): number {
    const a = this.player.equip.armor;
    if (!a || a.dur === 0) return 0;
    return item(a.id).armor?.reduction ?? 0;
  }

  fragmentsFound(): number {
    return this.fragmentsTaken.length;
  }

  /** Ajoute au sac ; le surplus tombe au sol dans un sac. Jamais de perte silencieuse. */
  give(id: string, qty: number, dur?: number, countAsCollected = false): void {
    const left = addItem(this.player.inv, id, qty, dur);
    const got = qty - left;
    if (countAsCollected && got > 0) this.stats.collected[id] = (this.stats.collected[id] ?? 0) + got;
    if (left > 0) {
      this.dropNear(this.player.x, this.player.y, [newStack(id, left, dur)]);
      this.toast(`Inventaire plein : ${left} × ${item(id).name} déposé(s) au sol dans un sac.`, 'warn');
    }
  }

  dropNear(x: number, y: number, stacks: Stack[]): void {
    // fusionne avec un sac proche si possible
    for (const bag of this.world.bags.values()) {
      if (Math.hypot(bag.x - x, bag.y - y) < 24) {
        const rest: Stack[] = [];
        for (const st of stacks) {
          const left = addItem(bag.items, st.id, st.qty, st.dur);
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
    for (const e of enemiesNear(this, x, y, radius * 1.4)) {
      const d = Math.hypot(e.x - x, e.y - y);
      const hearing = radius * (e.type === 'affame' ? 1.3 : e.type === 'brute' ? 0.8 : 1);
      if (d <= hearing && (e.state === 'wander' || e.state === 'search')) {
        e.state = 'investigate';
        e.tx = x;
        e.ty = y;
        e.repathT = 0;
      }
    }
  }

  hurtPlayer(amount: number, fromX: number, fromY: number, source: string): void {
    const p = this.player;
    if (p.dead || p.invuln > 0 || p.dodgeT > 0) return;
    const dmg = Math.max(1, Math.round(amount * (1 - this.armorReduction())));
    p.hp -= dmg;
    p.invuln = PLAYER.hurtInvuln;
    p.sinceHurt = 0;
    const a = this.player.equip.armor;
    if (a && a.dur && a.dur > 0) {
      a.dur = Math.max(0, a.dur - 1);
      if (a.dur === 0) this.toast(`${item(a.id).name} est hors d’usage : réparez-la.`, 'warn');
    }
    const d = Math.hypot(p.x - fromX, p.y - fromY) || 1;
    this.movePlayer(((p.x - fromX) / d) * 14, ((p.y - fromY) / d) * 14);
    this.emit({ type: 'float', x: p.x, y: p.y - 40, text: `-${dmg}`, color: '#ff6b5b' });
    this.emit({ type: 'sound', key: 'hurt' });
    this.emit({ type: 'shake', strength: 0.006 });
    if (p.hp <= 0) this.killPlayer(source);
  }

  killPlayer(reason: string): void {
    const p = this.player;
    if (p.dead) return;
    p.hp = 0;
    p.dead = true;
    p.deathT = 2.2;
    p.action = 'none';
    this.stats.deaths++;
    this.emit({ type: 'sound', key: 'defeat' });
    // perte partielle récupérable : la moitié de chaque pile (hors quête) dans un sac
    const lost: Stack[] = [];
    for (let i = 0; i < p.inv.length; i++) {
      const st = p.inv[i];
      if (!st || item(st.id).kind === 'quest') continue;
      const n = st.qty === 1 ? (i % 2 === 0 ? 1 : 0) : Math.ceil(st.qty * DEATH.dropFraction);
      if (n <= 0) continue;
      if (n >= st.qty) {
        lost.push({ ...st });
        p.inv[i] = null;
      } else {
        lost.push({ ...st, qty: n });
        st.qty -= n;
      }
    }
    let hasBag = false;
    if (lost.length) {
      const slots = makeSlots(Math.max(12, lost.length));
      lost.forEach((s, i) => (slots[i] = s));
      const bag = this.world.addBag(p.x, p.y, slots, 'death');
      this.deathBagId = bag.id;
      hasBag = true;
      this.emit({ type: 'bagsChanged' });
    }
    // un assaut final en cours échoue sans perte de progression
    if (this.final.state === 'active') {
      this.final = { state: 'ready', wave: 0, pause: 0, spawnedWave: false };
      this.enemies = this.enemies.filter((e) => e.kind !== 'final');
      reason += ' L’assaut final a échoué, mais le sceau tient : vous pourrez le relancer.';
    }
    const bed = this.findBed();
    this.emit({ type: 'death', reason, lost: lost.reduce((n, s) => n + s.qty, 0), hasBag, atBed: !!bed });
  }

  findBed(): Building | null {
    for (const b of this.world.buildings.values()) if (b.type === 'bed') return b;
    return null;
  }

  respawnPoint(): { x: number; y: number } {
    const bed = this.findBed();
    if (bed) {
      // tuile libre à côté de la paillasse
      const d = BUILDING_BY_ID.bed;
      for (const [dx, dy] of [[0, d.h], [1, d.h], [-1, 0], [d.w, 0], [0, -1], [d.w, 1], [-1, 1]]) {
        const tx = bed.x + dx;
        const ty = bed.y + dy;
        if (this.world.passableForPlayer(tx, ty)) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
      }
    }
    return { x: (this.world.start.x + 0.5) * TILE, y: (this.world.start.y + 0.5) * TILE };
  }

  respawn(): void {
    const p = this.player;
    const pt = this.respawnPoint();
    p.x = pt.x;
    p.y = pt.y;
    p.dead = false;
    p.hp = DEATH.respawnHealth;
    p.hunger = Math.max(p.hunger, DEATH.respawnMinHunger);
    p.stamina = PLAYER.maxStamina;
    p.invuln = PLAYER.respawnInvuln;
    p.action = 'none';
    p.actionT = 0;
    // pas de boucle de morts : les ennemis proches du point de retour s'en vont
    this.enemies = this.enemies.filter((e) => e.kind === 'final' || Math.hypot(e.x - p.x, e.y - p.y) > 14 * TILE);
    for (const e of this.enemies) if (e.state === 'chase') e.state = 'search';
    this.emit({ type: 'save', reason: 'respawn' });
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
    this.updateTime(dt);
    this.updatePlayer(dt, input);
    updateEnemies(this, dt);
    this.updateProjectiles(dt);
    this.updateBuildings(dt);
    updateSpawning(this, dt);
    this.updateFinal(dt);
    this.periodic(dt);
    this.target = this.player.dead ? null : interactionTarget(this);
  }

  private updateTime(dt: number): void {
    const speed = this.day === 1 && this.dayTime < DAY.duskStart ? DAY.firstDaySpeed : 1;
    this.dayTime += dt * speed;
    if (this.dayTime >= DAY.length) {
      this.dayTime -= DAY.length;
      this.day++;
    }
    const ph = this.phase();
    if (ph !== this.lastPhase) {
      this.onPhase(ph);
      this.lastPhase = ph;
    }
  }

  private onPhase(ph: Phase): void {
    if (ph === 'dusk') {
      // liste indicative : ce qui manque encore pour la nuit (non bloquant)
      const miss = nightChecklist(this).filter((x) => !x.done).map((x) => x.label.split(' :')[0].split(' (')[0].toLowerCase());
      this.toast(`Le crépuscule tombe : une horde approchera à la nuit. Rentrez au camp !${miss.length ? ` À prévoir : ${miss.join(', ')}.` : ''}`, 'warn');
      this.emit({ type: 'sound', key: 'bell' });
    } else if (ph === 'night') {
      this.toast('La nuit est là. Restez près de la lumière.', 'warn');
    } else if (ph === 'dawn') {
      if (!this.player.dead) {
        this.stats.nightsSurvived++;
        this.toast(`L’aube se lève. Nuit ${this.stats.nightsSurvived} survécue.`, 'good');
      }
      // la horde se retire : pas de siège interminable
      for (const e of this.enemies) if (e.kind === 'assault') e.state = 'retreat';
      if (this.assault) this.assault.done = true;
      this.emit({ type: 'save', reason: 'dawn' });
    }
  }

  private updatePlayer(dt: number, input: InputState): void {
    const p = this.player;
    if (p.dead) {
      p.deathT -= dt;
      return;
    }
    p.invuln = Math.max(0, p.invuln - dt);
    p.attackCd = Math.max(0, p.attackCd - dt);
    p.sinceHurt += dt;

    // faim
    p.hunger = Math.max(0, p.hunger - PLAYER.hungerDrainPerSec * dt);
    if (p.hunger <= 0) {
      p.hp -= PLAYER.starvingDamagePerSec * dt;
      if (p.hp <= 0) this.killPlayer('Vous êtes mort de faim. Mangez régulièrement : baies, morilles, viande cuite.');
    }
    // soins
    if (p.healT > 0) {
      p.healT -= dt;
      p.hp = Math.min(PLAYER.maxHealth, p.hp + p.healRate * dt);
    }
    if (p.regenT > 0) {
      p.regenT -= dt;
      p.hp = Math.min(PLAYER.maxHealth, p.hp + p.regenRate * dt);
    }
    if (p.hunger >= PLAYER.regenMinHunger && p.sinceHurt > PLAYER.regenCombatDelay && p.hp < PLAYER.maxHealth) {
      const fire = this.nearLitFire();
      const mult = fire === 2 ? PLAYER.regenRestMult * 1.5 : fire ? PLAYER.regenRestMult : 1;
      p.hp = Math.min(PLAYER.maxHealth, p.hp + PLAYER.regenFedPerSec * mult * dt);
    }

    // endurance
    p.staminaDelay = Math.max(0, p.staminaDelay - dt);
    const len = Math.hypot(input.mx, input.my);
    p.moving = len > 0.15;
    const wantSprint = input.sprint && p.moving && !p.exhausted;
    p.sprinting = wantSprint && p.stamina > 0;
    if (p.sprinting) {
      p.stamina = Math.max(0, p.stamina - PLAYER.sprintCostPerSec * dt);
      p.staminaDelay = PLAYER.staminaRegenDelay;
      if (p.stamina <= 0) p.exhausted = true;
    }
    if (p.staminaDelay <= 0) {
      const regen = PLAYER.staminaRegenPerSec * (p.hunger < PLAYER.hungerWarn ? 0.5 : 1);
      p.stamina = Math.min(PLAYER.maxStamina, p.stamina + regen * dt);
    }
    if (p.exhausted && p.stamina > 30) p.exhausted = false;

    // esquive
    if (input.dodge) {
      input.dodge = false;
      if (p.dodgeT <= 0 && p.stamina >= PLAYER.dodgeCost) {
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
    if (p.dodgeT > 0) {
      p.dodgeT -= dt;
      this.movePlayer(p.dodgeX * PLAYER.dodgeSpeed * dt, 0);
      this.movePlayer(0, p.dodgeY * PLAYER.dodgeSpeed * dt);
    } else if (p.moving) {
      const k = Math.min(1, len);
      const hungerSlow = p.hunger <= 0 ? 0.8 : 1;
      const actionSlow = p.actionT > 0 ? 0.55 : 1;
      const sp = PLAYER.speed * k * (p.sprinting ? PLAYER.sprintMult : 1) * hungerSlow * actionSlow;
      const nx = input.mx / len;
      const ny = input.my / len;
      this.movePlayer(nx * sp * dt, 0);
      this.movePlayer(0, ny * sp * dt);
      if (p.actionT <= 0) {
        p.aimX = nx;
        p.aimY = ny;
        p.facing = Math.abs(nx) > Math.abs(ny) ? (nx < 0 ? 'left' : 'right') : ny < 0 ? 'up' : 'down';
      }
      this.timers.step -= dt * (p.sprinting ? 1.5 : 1);
      if (this.timers.step <= 0) {
        this.timers.step = 0.36;
        this.emit({ type: 'sound', key: `step_${this.rng.int(0, 2)}` });
      }
    }

    // actions
    if (p.actionT > 0) p.actionT -= dt;
    else if (p.action !== 'none') {
      p.action = 'none';
      p.actionItem = null;
    }
    if (p.pendingHit > 0) {
      p.pendingHit -= dt;
      if (p.pendingHit <= 0) this.resolveMelee();
    }
    // appui ponctuel : mis en attente brièvement pour ne jamais être perdu (ex. appui et
    // relâchement entre deux pas de simulation, ou pendant la fin d'une animation)
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
    if (wantAttack && p.attackCd <= 0 && p.actionT <= 0) {
      this.attackBuffer = 0;
      this.attack();
    } else if (wantInteract && p.actionT <= 0 && this.harvestCd <= 0) {
      this.interactBuffer = 0;
      this.interact();
    }

    // torche : se consume la nuit
    const t = p.equip.tool;
    if (t && t.id === 'torch' && t.dur && t.dur > 0 && this.isDark()) {
      t.dur = Math.max(0, t.dur - dt);
      if (t.dur === 0) this.toast('Votre torche s’est éteinte.', 'warn');
    }
  }

  /** 0 = aucun feu proche, 1 = feu de camp, 2 = feu amélioré (zone plus large) */
  nearLitFire(): 0 | 1 | 2 {
    const p = this.player;
    let best: 0 | 1 | 2 = 0;
    for (const b of this.nearbyBuildings(p.x, p.y, 4.5 * TILE)) {
      if (b.type !== 'campfire') continue;
      const c = this.world.buildingCenter(b);
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if ((b.level ?? 1) >= 2 && d <= 4.5 * TILE) best = 2;
      else if (d <= 3.2 * TILE && best === 0) best = 1;
    }
    return best;
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
    const t0x = Math.floor((x - r) / TILE);
    const t1x = Math.floor((x + r) / TILE);
    const t0y = Math.floor((y - r) / TILE);
    const t1y = Math.floor((y + r) / TILE);
    const seen = new Set<number>();
    for (let ty = t0y; ty <= t1y; ty++)
      for (let tx = t0x; tx <= t1x; tx++) {
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

  // ---------------------------------------------------------------- combat
  private attack(): void {
    const p = this.player;
    const wd = this.weaponDef();
    const w = wd?.weapon ?? { damage: 6, reach: 32, cooldown: 0.42, stamina: 8, knockback: 80, anim: 'slash' as const };
    // sans ennemi à portée, le bouton d'attaque sert aussi à récolter
    const enemyNear = enemiesNear(this, p.x, p.y, (w.ranged ? w.reach : w.reach + 40)).some((e) => e.dying <= 0);
    if (!enemyNear && this.target && this.target.kind === 'harvest') {
      this.interact();
      return;
    }
    const cost = p.stamina >= w.stamina ? w.stamina : 0;
    const tired = cost === 0;
    // aide à la visée : ennemi le plus proche dans un cône devant
    const aimAt = this.autoAim(w.ranged ? w.reach : w.reach + 36, w.ranged ? 80 : 70, w.ranged ? 0 : w.reach + 12);
    if (aimAt) {
      const d = Math.hypot(aimAt.x - p.x, aimAt.y - p.y) || 1;
      p.aimX = (aimAt.x - p.x) / d;
      p.aimY = (aimAt.y - p.y) / d;
      p.facing = Math.abs(p.aimX) > Math.abs(p.aimY) ? (p.aimX < 0 ? 'left' : 'right') : p.aimY < 0 ? 'up' : 'down';
    }
    p.actionItem = this.player.equip.weapon?.id ?? (wd ? this.player.equip.tool?.id ?? null : null);
    if (w.ranged) {
      if (countItem(p.inv, 'arrow') <= 0) {
        this.toast('Plus de flèches ! Fabriquez-en à l’établi.', 'warn');
        p.attackCd = 0.5;
        return;
      }
      removeItem(p.inv, 'arrow', 1);
      const sp = 420;
      this.projectiles.push({ x: p.x + p.aimX * 12, y: p.y - 18 + p.aimY * 12, vx: p.aimX * sp, vy: p.aimY * sp, life: w.reach / sp, damage: w.damage });
      p.action = 'shoot';
      p.actionT = 0.45;
      p.attackCd = w.cooldown * (tired ? 1.8 : 1);
      this.useDurability('weapon');
      this.emit({ type: 'sound', key: 'bow' });
    } else {
      // outil utilisé comme arme (hache, masse, pioche) : geste d'outil, coup porté un peu plus tard
      const toolSwing = !!wd?.tool && !this.player.equip.weapon;
      p.action = w.anim === 'thrust' ? 'thrust' : toolSwing ? 'chop' : 'slash';
      p.actionT = toolSwing ? 0.4 : 0.36;
      p.pendingHit = toolSwing ? 0.2 : 0.14;
      p.attackCd = w.cooldown * (tired ? 1.8 : 1);
      this.emit({ type: 'sound', key: `swing_${this.rng.int(0, 1)}` });
      this.emit({ type: 'swing', x: p.x + p.aimX * 22, y: p.y - 16 + p.aimY * 18, angle: Math.atan2(p.aimY, p.aimX) });
    }
    p.stamina -= cost;
    p.staminaDelay = PLAYER.staminaRegenDelay;
    this.noise(p.x, p.y, HARVEST.combatNoiseRadius * 0.5);
  }

  /**
   * Aide à la visée : ennemi devant soi (cône), ou n'importe où à portée réelle de l'arme
   * (un zombie de côté, à portée de lance, est visé plutôt que de frapper dans le vide).
   */
  autoAim(range: number, coneDeg: number, anyDirWithin = 34): Enemy | null {
    const p = this.player;
    let best: Enemy | null = null;
    let bestScore = Infinity;
    const cos = Math.cos((coneDeg * Math.PI) / 180);
    for (const e of enemiesNear(this, p.x, p.y, range)) {
      if (e.dying > 0) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const dot = (dx * p.aimX + dy * p.aimY) / d;
      if (dot < cos && d > Math.max(34, anyDirWithin)) continue;
      const score = d * (2 - dot);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private resolveMelee(): void {
    const p = this.player;
    if (p.dead) return;
    const wd = this.weaponDef();
    const w = wd?.weapon ?? { damage: 6, reach: 32, knockback: 80 };
    const tired = p.stamina <= 1;
    let hit = 0;
    for (const e of enemiesNear(this, p.x, p.y, w.reach + 30)) {
      if (e.dying > 0) continue;
      const dx = e.x - p.x;
      const dy = e.y - (p.y - 4);
      const d = Math.hypot(dx, dy) || 1;
      if (d > w.reach + 14) continue;
      const dot = (dx * p.aimX + dy * p.aimY) / d;
      if (dot < 0.2 && d > 20) continue;
      const dmg = Math.round(w.damage * (tired ? 0.6 : 1));
      damageEnemy(this, e, dmg, (dx / d) * w.knockback, (dy / d) * w.knockback);
      hit++;
    }
    if (hit) {
      this.useDurability(this.player.equip.weapon ? 'weapon' : 'tool');
      this.noise(p.x, p.y, HARVEST.combatNoiseRadius);
    }
  }

  useDurability(slot: 'weapon' | 'tool' | 'armor'): void {
    const st = this.player.equip[slot];
    if (!st || st.dur === undefined || st.dur <= 0) return;
    st.dur = Math.max(0, st.dur - 1);
    if (st.dur === 0) this.toast(`${item(st.id).name} est cassé(e). Réparez-le à la station indiquée.`, 'warn');
  }

  private updateProjectiles(dt: number): void {
    const w = this.world;
    this.projectiles = this.projectiles.filter((pr) => {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      if (pr.life <= 0) return false;
      if (w.staticSolid(Math.floor(pr.x / TILE), Math.floor((pr.y + 18) / TILE))) return false;
      for (const e of enemiesNear(this, pr.x, pr.y + 18, 26)) {
        if (e.dying > 0) continue;
        if (Math.hypot(e.x - pr.x, e.y - 16 - pr.y) < 20) {
          const sp = Math.hypot(pr.vx, pr.vy) || 1;
          damageEnemy(this, e, pr.damage, (pr.vx / sp) * 80, (pr.vy / sp) * 80);
          return false;
        }
      }
      return true;
    });
  }

  // ---------------------------------------------------------------- interaction
  interact(): void {
    const t = this.target;
    if (!t) return;
    t.run(this);
    // maintenir le bouton ne répète que la récolte (pas les ouvertures ni les messages)
    if (t.kind !== 'harvest') this.harvestCd = Math.max(this.harvestCd, 0.6);
  }

  /** Coup de récolte sur un objet du monde. */
  harvest(o: WObj): void {
    const p = this.player;
    const needs: Record<string, 'axe' | 'pick' | null> = {
      tree: 'axe', rock: 'pick', ore_iron: 'pick', ore_coal: 'pick', bush: null, grass: null, morel: null,
    };
    const toolType = needs[o.type];
    let power = 1;
    let toolStack: Stack | null = null;
    if (toolType) {
      // choisit automatiquement le meilleur outil adapté (équipé ou dans le sac)
      const candidates: Stack[] = [];
      if (p.equip.tool) candidates.push(p.equip.tool);
      for (const s of p.inv) if (s) candidates.push(s);
      for (const s of candidates) {
        const d = item(s.id);
        if (d.tool?.type === toolType && s.dur !== 0 && d.tool.power > power) {
          power = d.tool.power;
          toolStack = s;
        }
      }
      if ((o.type === 'ore_iron' || o.type === 'ore_coal') && !toolStack) {
        this.emit({ type: 'float', x: (o.fx + o.fw / 2) * TILE, y: o.fy * TILE - 10, text: 'Il faut une masse ou une pioche', color: '#f5d76e' });
        this.harvestCd = 0.6;
        return;
      }
    }
    // avec un outil : geste de bûcheron / carrier (animation dédiée du pack d'outils LPC)
    p.action = toolStack ? 'chop' : 'slash';
    p.actionItem = toolStack ? toolStack.id : null;
    p.actionT = toolStack ? 0.4 : 0.34;
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
    if (toolStack && toolStack.dur !== undefined) {
      toolStack.dur = Math.max(0, toolStack.dur - 1);
      if (toolStack.dur === 0) this.toast(`${item(toolStack.id).name} est cassé(e). Réparez-le.`, 'warn');
    }
    const sound = o.type === 'tree' ? `chop_${this.rng.int(0, 2)}` : toolType === 'pick' ? `mine_${this.rng.int(0, 2)}` : `pick_${this.rng.int(0, 1)}`;
    this.emit({ type: 'sound', key: sound, x: cx, y: cy });
    this.emit({ type: 'hitfx', x: cx, y: cy - 12 });
    this.emit({ type: 'objChanged', id: o.id });
    this.emit({ type: 'harvestHit', objId: o.id, hp: Math.max(0, o.hp ?? 0), maxHp: o.maxHp ?? 1, power, tool: toolStack?.id ?? null });
    if (toolType) this.noise(cx, cy, HARVEST.noiseRadius);
    // l'avantage d'un outil est annoncé au bon moment (une seule fois)
    if (toolType === 'axe' && !toolStack && (o.maxHp ?? 1) > 1) this.emit({ type: 'hint', id: 'axe', text: 'À mains nues, un arbre demande 6 coups. Une hache de pierre le coupe en 3.' });
    if (toolType === 'pick' && !toolStack && (o.maxHp ?? 1) > 1) this.emit({ type: 'hint', id: 'pick', text: 'Une masse de carrier casse les rochers deux fois plus vite et extrait le minerai.' });
    if (toolStack && power >= 2) this.emit({ type: 'hint', id: `tool_${toolStack.id}`, text: `${item(toolStack.id).name} : ${Math.ceil((o.maxHp ?? 1) / power)} coups au lieu de ${o.maxHp ?? 1}.` });
    if ((o.hp ?? 0) > 0) return;

    // ressource obtenue
    const yields: [string, number][] = [];
    switch (o.type) {
      case 'tree':
        yields.push(['wood', o.sprite.includes('dead') ? 3 : 4 + (this.rng.chance(0.4) ? 1 : 0)]);
        break;
      case 'rock':
        yields.push(['stone', o.sprite.includes('pebble') ? 1 : o.sprite.includes('big') ? 5 : 3]);
        if (this.rng.chance(0.15)) yields.push(['coal', 1]);
        break;
      case 'ore_iron':
        yields.push(['iron_ore', 2], ['stone', 1]);
        break;
      case 'ore_coal':
        yields.push(['coal', 2]);
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
    }
    let fy = cy - 30;
    for (const [id, n] of yields) {
      this.give(id, n, undefined, true);
      this.emit({ type: 'float', x: cx, y: fy, text: `+${n} ${item(id).name}`, color: '#d9f7a6' });
      this.emit({ type: 'collect', id, n });
      fy -= 14;
    }
    this.depleteObject(o);
  }

  depleteObject(o: WObj): void {
    const w = this.world;
    o.depleted = true;
    o.regrowAt = this.clock + (HARVEST.regrow[o.type === 'ore_iron' || o.type === 'ore_coal' ? 'ore' : o.type] ?? 600);
    this.depleted.add(o.id);
    if (o.type === 'tree') {
      // la souche reste un obstacle bas
      o.solid = true;
    } else if (o.type === 'bush') {
      o.solid = true;
    } else {
      o.solid = false;
      w.unstampObject(o);
    }
    w.outsideDirty = true;
    this.emit({ type: 'objChanged', id: o.id });
  }

  private regrow(): void {
    const p = this.player;
    for (const id of [...this.depleted]) {
      const o = this.world.objects[id];
      if (!o.regrowAt || this.clock < o.regrowAt) continue;
      const cx = (o.fx + 0.5) * TILE;
      const cy = (o.fy + 0.5) * TILE;
      if (Math.hypot(cx - p.x, cy - p.y) < HARVEST.regrowMinPlayerDist) continue;
      // pas de repousse sous une construction ou un sac
      let blocked = false;
      for (let y = o.fy; y < o.fy + o.fh; y++) for (let x = o.fx; x < o.fx + o.fw; x++) if (this.world.buildingAtTile(x, y)) blocked = true;
      if (blocked) {
        o.regrowAt = this.clock + 120;
        continue;
      }
      o.depleted = false;
      o.hp = o.maxHp;
      o.regrowAt = undefined;
      o.solid = !['grass', 'morel'].includes(o.type) && !o.sprite.includes('pebble');
      this.world.stampObject(o);
      this.depleted.delete(id);
      this.world.outsideDirty = true;
      this.emit({ type: 'objChanged', id });
    }
  }

  openWorldContainer(o: WObj): Slots {
    if (!o.items) {
      const slots = makeSlots(8);
      // tirage déterministe (graine du monde + objet) : recharger ne change rien
      const r = new Rng((this.world.seed ^ Math.imul(o.id + 1, 2654435761)) >>> 0);
      if (o.guaranteed) for (const g of GUARANTEED[o.guaranteed]) addItem(slots, g.id, g.qty);
      if (o.loot) {
        const t = LOOT[o.loot];
        const rolls = r.int(t.rolls[0], t.rolls[1]);
        for (let i = 0; i < rolls; i++) {
          const e = r.weighted(t.entries);
          addItem(slots, e.id, r.int(e.min, e.max));
        }
      }
      o.items = slots;
      o.opened = true;
      this.emit({ type: 'objChanged', id: o.id });
    }
    this.emit({ type: 'sound', key: 'chest' });
    return o.items;
  }

  // ---------------------------------------------------------------- constructions
  private updateBuildings(dt: number): void {
    for (const b of this.world.buildings.values()) {
      if (b.type === 'trap') {
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
  }

  damageBuilding(b: Building, dmg: number): void {
    b.hp -= dmg;
    const c = this.world.buildingCenter(b);
    this.emit({ type: 'hitfx', x: c.x, y: c.y });
    this.emit({ type: 'sound', key: 'build', x: c.x, y: c.y });
    if (b.hp <= 0) this.destroyBuilding(b, false);
    else this.emit({ type: 'buildChanged' });
  }

  destroyBuilding(b: Building, demolished: boolean): void {
    const c = this.world.buildingCenter(b);
    this.world.removeBuilding(b.id);
    if (b.items && b.items.some((s) => s)) {
      // le contenu d'un coffre détruit reste récupérable dans un sac
      this.world.addBag(c.x, c.y, b.items, 'chest');
      this.emit({ type: 'bagsChanged' });
      if (!demolished) this.toast('Un coffre a été détruit : son contenu est dans un sac au sol.', 'warn');
    }
    if (!demolished) this.toast(`${BUILDING_BY_ID[b.type].name} détruit(e) !`, 'warn');
    this.emit({ type: 'buildChanged' });
  }

  // ---------------------------------------------------------------- assaut final
  private updateFinal(dt: number): void {
    const f = this.final;
    if (f.state !== 'active') return;
    const alive = this.enemies.filter((e) => e.kind === 'final' && e.dying <= 0).length;
    if (!f.spawnedWave) return;
    if (alive > 0) return;
    f.pause -= dt;
    if (f.pause > 0) return;
    if (f.wave >= 2) {
      f.state = 'won';
      this.freed = true;
      this.enemies = this.enemies.filter((e) => e.kind === 'final' || e.dying > 0);
      this.emit({ type: 'sound', key: 'victory' });
      this.emit({ type: 'victory' });
      this.emit({ type: 'save', reason: 'victory' });
      return;
    }
    f.wave++;
    f.spawnedWave = false;
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
        if (!lm.discovered && Math.hypot((lm.x + 0.5) * TILE - p.x, (lm.y + 0.5) * TILE - p.y) < (lm.scene ? 8 : 13) * TILE) {
          lm.discovered = true;
          if (lm.scene && !this.stats.scenesVisited.includes(lm.id)) this.stats.scenesVisited.push(lm.id);
          this.emit({ type: 'landmark', name: lm.name });
          this.toast(`Lieu découvert : ${lm.name}`, 'good');
        }
      }
      for (const id of ['hamlet', 'cemetery', 'stones']) {
        const lm = this.world.landmarks.find((l) => l.id === id)!;
        if (!this.stats.cursedVisited.includes(id) && Math.hypot((lm.x + 0.5) * TILE - p.x, (lm.y + 0.5) * TILE - p.y) < 11 * TILE) {
          this.stats.cursedVisited.push(id);
        }
      }
    }
    t.objectives -= dt;
    if (t.objectives <= 0) {
      t.objectives = 0.5;
      for (const id of evaluateObjectives(this)) {
        const o = OBJECTIVES.find((x) => x.id === id)!;
        this.toast(`Objectif accompli : ${o.title}`, 'good');
        this.emit({ type: 'sound', key: 'objective' });
        this.emit({ type: 'objective', id });
        this.emit({ type: 'save', reason: 'objective' });
      }
    }
    t.hotbar -= dt;
    if (t.hotbar <= 0) {
      t.hotbar = 0.2;
      autoAssignHotbar(this);
    }
    t.regrow -= dt;
    if (t.regrow <= 0) {
      t.regrow = 5;
      this.regrow();
    }
    t.autosave -= dt;
    if (t.autosave <= 0) {
      t.autosave = SAVE.autosaveEvery;
      this.emit({ type: 'save', reason: 'periodic' });
    }
  }
}
