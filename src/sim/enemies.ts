// IA du bestiaire : chaque rôle a son comportement ; toutes les attaques sont annoncées
// (télégraphes lisibles) puis suivies d'une fenêtre de récupération (riposte possible).
import { ENEMY, TILE } from '../config/balance';
import { ENEMIES, type AttackDef, type EnemyDef, type EnemyType } from '../data/enemies';
import type { Game } from './game';
import { findPath } from './pathfinding';
import { newStatuses, type Enemy, type Facing } from './types';
import { clearShot, enemyShot, hurtPlayer, makeZone, tickStatuses } from './combat';

// ------------------------------------------------------------ recherche spatiale
const CELL = 4 * TILE;
const grid = new Map<number, Enemy[]>();
let gridDirty = true;
function key(cx: number, cy: number): number {
  return cy * 4096 + cx;
}
function rebuildGrid(g: Game): void {
  grid.clear();
  for (const e of g.enemies) {
    const k = key(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
    let arr = grid.get(k);
    if (!arr) grid.set(k, (arr = []));
    arr.push(e);
  }
  gridDirty = false;
}

export function resetEnemyGrid(): void {
  grid.clear();
  gridDirty = true;
}

export function enemiesNear(g: Game, x: number, y: number, r: number): Enemy[] {
  if (gridDirty) rebuildGrid(g);
  const out: Enemy[] = [];
  for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++)
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      const arr = grid.get(key(cx, cy));
      if (!arr) continue;
      for (const e of arr) if (Math.hypot(e.x - x, e.y - y) <= r) out.push(e);
    }
  return out;
}

// ------------------------------------------------------------ création
export interface SpawnOpts {
  key?: string;
  boss?: boolean;
  asleep?: boolean;
  elite?: boolean;
  hpMul?: number;
  dmgMul?: number;
  minion?: boolean;
}

export function spawnEnemy(g: Game, type: EnemyType, x: number, y: number, o: SpawnOpts = {}): Enemy {
  const d = ENEMIES[type];
  const hp = Math.round(d.hp * (o.hpMul ?? 1));
  const e: Enemy = {
    id: g.newId(), type, key: o.key ?? `dyn:${g.nextId}`, x, y, hp, maxHp: hp, dmgMul: o.dmgMul ?? 1, elite: !!o.elite, boss: !!d.boss || !!o.boss, phase: 1,
    state: o.asleep && d.ai === 'ambush' ? 'hidden' : d.ai === 'static' ? 'idle' : 'wander', facing: 'down', homeX: x, homeY: y, tx: x, ty: y,
    path: [], pathIdx: 0, repathT: g.rng.next() * 0.5, atk: null, cds: d.attacks.map(() => g.rng.next() * 1.2),
    kbx: 0, kby: 0, hurtT: 0, dying: 0, moving: false, lostT: 0, perceiveT: g.rng.next() * 0.3, soundT: 2 + g.rng.next() * 6,
    wanderT: g.rng.next() * 3, stuckT: 0, lastX: x, lastY: y, aggro: false, st: newStatuses(), minion: o.minion,
  };
  g.enemies.push(e);
  gridDirty = true;
  return e;
}

function facingOf(dx: number, dy: number): Facing {
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
}

function floats(d: EnemyDef): boolean {
  return d.ai === 'caster';
}

function blockedFor(g: Game, d: EnemyDef, tx: number, ty: number): boolean {
  const w = g.world;
  if (floats(d)) {
    if (!w.inBounds(tx, ty) || w.wall[w.idx(tx, ty)]) return true;
    const o = w.objectAtTile(tx, ty);
    return !!o && o.solid && o.type !== 'tree';
  }
  return !w.passableForEnemy(tx, ty);
}

function moveEnemy(g: Game, e: Enemy, d: EnemyDef, dx: number, dy: number): void {
  const r = d.radius * 0.8;
  const blocked = (x: number, y: number) => {
    const x0 = Math.floor((x - r) / TILE);
    const x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - r * 0.6) / TILE);
    const y1 = Math.floor((y + r * 0.4) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (blockedFor(g, d, tx, ty)) return true;
    return false;
  };
  if (dx && !blocked(e.x + dx, e.y)) e.x += dx;
  if (dy && !blocked(e.x, e.y + dy)) e.y += dy;
}

/** Se dirige vers un point en suivant un chemin (A*) recalculé à fréquence limitée. */
function steer(g: Game, e: Enemy, d: EnemyDef, gx: number, gy: number, speed: number, dt: number): void {
  const w = g.world;
  let mx = gx - e.x;
  let my = gy - e.y;
  if (!floats(d) && !clearShot(g, e.x, e.y - 8, gx, gy - 8)) {
    e.repathT -= dt;
    if (e.repathT <= 0) {
      e.repathT = 0.6 + g.rng.next() * 0.4;
      const sx = Math.floor(e.x / TILE);
      const sy = Math.floor(e.y / TILE);
      const tx = Math.max(0, Math.min(w.w - 1, Math.floor(gx / TILE)));
      const ty = Math.max(0, Math.min(w.h - 1, Math.floor(gy / TILE)));
      const res = findPath(w, sx, sy, tx, ty, { breakCost: Infinity, budget: 1400 });
      e.path = res.path;
      e.pathIdx = 0;
    }
    if (e.path.length && e.pathIdx < e.path.length) {
      const n = e.path[e.pathIdx];
      const cx = (n.x + 0.5) * TILE;
      const cy = (n.y + 0.5) * TILE;
      if (Math.hypot(cx - e.x, cy - e.y) < 6) e.pathIdx++;
      mx = cx - e.x;
      my = cy - e.y;
    }
  } else e.path = [];
  const ml = Math.hypot(mx, my);
  e.moving = ml > 3;
  if (!e.moving) return;
  const sp = speed * (e.st.slowT > 0 ? e.st.slowMul : 1);
  moveEnemy(g, e, d, (mx / ml) * sp * dt, (my / ml) * sp * dt);
  e.facing = facingOf(mx, my);
}

// ------------------------------------------------------------ mise à jour
export function updateEnemies(g: Game, dt: number): void {
  rebuildGrid(g);
  const p = g.player;
  const playerSafe = g.safeAt(p.x, p.y);
  for (const e of g.enemies) {
    const d = ENEMIES[e.type];
    if (e.dying > 0) {
      e.dying -= dt;
      continue;
    }
    const distP = Math.hypot(p.x - e.x, p.y - e.y);
    // ennemis lointains et calmes : pas de simulation détaillée
    if (distP > ENEMY.activeRadius && !e.boss && e.state !== 'chase') continue;
    tickStatuses(g, e.st, dt, e);
    if (e.dying > 0) continue;
    e.hurtT = Math.max(0, e.hurtT - dt);
    for (let i = 0; i < e.cds.length; i++) e.cds[i] = Math.max(0, e.cds[i] - dt);
    if (Math.abs(e.kbx) + Math.abs(e.kby) > 1) {
      moveEnemy(g, e, d, e.kbx * dt, e.kby * dt);
      e.kbx *= Math.pow(0.0005, dt);
      e.kby *= Math.pow(0.0005, dt);
    }
    if (e.st.stunT > 0) {
      e.moving = false;
      continue;
    }
    // boss : seconde phase à mi-vie
    if (e.boss && e.phase === 1 && e.hp <= e.maxHp * 0.5) {
      e.phase = 2;
      g.emit({ type: 'toast', text: `${d.name} entre en rage !`, kind: 'warn' });
      g.emit({ type: 'sound', key: d.sound?.alert ?? 'roar_0' });
      g.emit({ type: 'shake', strength: 0.01 });
    }
    if (e.atk) {
      runAttack(g, e, d, dt);
      continue;
    }
    // embuscade : enfoui sous un monticule visible, surgit à l'approche
    if (e.state === 'hidden') {
      if (!p.dead && distP < d.sight) {
        e.state = 'emerge';
        e.lostT = 0.9;
        g.emit({ type: 'spotted', enemyId: e.id });
        g.emit({ type: 'sound', key: d.sound?.alert ?? 'zgroan_1', x: e.x, y: e.y });
      }
      continue;
    }
    if (e.state === 'emerge') {
      e.lostT -= dt;
      if (e.lostT <= 0) {
        e.state = 'chase';
        e.aggro = true;
        e.lostT = 0;
      }
      continue;
    }
    perceive(g, e, d, dt, distP);
    const home = Math.hypot(e.x - e.homeX, e.y - e.homeY);
    if (e.state === 'chase' && d.leash > 0 && home > d.leash) {
      e.state = 'return';
      e.aggro = false;
    }
    if (playerSafe && !e.boss && e.state === 'chase' && d.ai !== 'static') e.state = 'return';
    switch (e.state) {
      case 'return':
        steer(g, e, d, e.homeX, e.homeY, d.speed * 0.9, dt);
        if (home < 14) {
          e.state = d.ai === 'static' ? 'idle' : 'wander';
          e.hp = e.maxHp;
          e.st = newStatuses();
        } else e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.15 * dt);
        break;
      case 'flee': {
        const ax = e.x - p.x;
        const ay = e.y - p.y;
        const al = Math.hypot(ax, ay) || 1;
        moveEnemy(g, e, d, (ax / al) * d.speed * dt, (ay / al) * d.speed * dt);
        e.moving = true;
        e.facing = facingOf(ax, ay);
        if (distP > d.sight * 1.6) e.state = 'wander';
        break;
      }
      case 'chase':
        chase(g, e, d, dt, distP);
        break;
      case 'idle':
        e.moving = false;
        if (d.ai === 'static' && distP <= d.attacks[0].range && !p.dead && !playerSafe) tryAttack(g, e, d, distP);
        break;
      default:
        wander(g, e, d, dt);
    }
    // séparation (pas pour les boss)
    if (!e.boss) {
      for (const o of enemiesNear(g, e.x, e.y, 22)) {
        if (o === e || o.dying > 0) continue;
        const sx = e.x - o.x;
        const sy = e.y - o.y;
        const sd = Math.hypot(sx, sy) || 1;
        if (sd < 18) moveEnemy(g, e, d, (sx / sd) * 30 * dt, (sy / sd) * 30 * dt);
      }
    }
    // bruits : grognements et cris, repère directionnel si hors de vue
    e.soundT -= dt;
    if (e.soundT <= 0) {
      e.soundT = 5 + g.rng.next() * 8;
      if (distP < 10 * TILE && e.state === 'chase' && d.sound?.alert) {
        g.emit({ type: 'sound', key: d.sound.alert, x: e.x, y: e.y });
        g.emit({ type: 'threat', x: e.x, y: e.y, kind: 'sound' });
      }
    }
  }
  g.enemies = g.enemies.filter((e) => e.hp > 0 || e.dying > 0);
  gridDirty = true;
}

function perceive(g: Game, e: Enemy, d: EnemyDef, dt: number, distP: number): void {
  const p = g.player;
  e.perceiveT -= dt;
  if (e.perceiveT > 0) return;
  e.perceiveT = 0.25;
  if (p.dead) {
    if (e.state === 'chase') e.state = 'return';
    return;
  }
  const sees = distP < d.sight && clearShot(g, e.x, e.y - 16, p.x, p.y - 16);
  if (d.ai === 'prey') {
    if (sees && distP < d.sight) e.state = 'flee';
    return;
  }
  if (d.ai === 'skittish') {
    // n'attaque que de très près, ou en groupe ; blessé, il fuit
    const friends = enemiesNear(g, e.x, e.y, 3 * TILE).filter((o) => o !== e && o.type === e.type && o.dying <= 0).length;
    if (e.hp < e.maxHp * 0.5) e.state = 'flee';
    else if (sees && (distP < 1.6 * TILE || (friends > 0 && distP < 3.2 * TILE) || e.aggro)) e.state = 'chase';
    else if (sees && distP < 3 * TILE && e.state !== 'chase') e.state = 'flee';
    return;
  }
  if (sees) {
    if (e.state !== 'chase' && e.state !== 'return') {
      e.repathT = 0;
      g.emit({ type: 'spotted', enemyId: e.id });
      g.emit({ type: 'threat', x: e.x, y: e.y, kind: 'seen' });
      if (d.sound?.alert) g.emit({ type: 'sound', key: d.sound.alert, x: e.x, y: e.y });
      if (e.boss) g.emit({ type: 'boss', name: d.name, active: true });
    }
    if (e.state !== 'return') {
      e.state = 'chase';
      e.aggro = true;
    }
    e.lostT = 0;
  } else if (e.state === 'chase') {
    e.lostT += 0.25;
    if (e.lostT > ENEMY.loseSightTime && !e.boss) e.state = 'return';
  }
}

function wander(g: Game, e: Enemy, d: EnemyDef, dt: number): void {
  if (d.ai === 'static' || d.speed <= 0) return;
  e.wanderT -= dt;
  if (e.wanderT <= 0) {
    e.wanderT = 3 + g.rng.next() * 4;
    const a = g.rng.next() * Math.PI * 2;
    const r = (d.ai === 'guard' || e.boss ? 2 : 3.5) * TILE;
    e.tx = e.homeX + Math.cos(a) * r;
    e.ty = e.homeY + Math.sin(a) * r;
  }
  const dx = e.tx - e.x;
  const dy = e.ty - e.y;
  const dl = Math.hypot(dx, dy);
  e.moving = dl > 6;
  if (e.moving) {
    moveEnemy(g, e, d, (dx / dl) * d.speed * 0.35 * dt, (dy / dl) * d.speed * 0.35 * dt);
    e.facing = facingOf(dx, dy);
  }
  if (Math.hypot(e.x - e.lastX, e.y - e.lastY) < 1 * dt) e.stuckT += dt;
  else e.stuckT = 0;
  if (e.stuckT > 1) {
    e.stuckT = 0;
    e.wanderT = 0;
  }
  e.lastX = e.x;
  e.lastY = e.y;
}

function chase(g: Game, e: Enemy, d: EnemyDef, dt: number, distP: number): void {
  const p = g.player;
  const speed = d.speed * (e.st.rootT > 0 ? 0 : 1);
  if (tryAttack(g, e, d, distP)) return;
  const keep = d.ai === 'ranged' ? [3.5 * TILE, 6.5 * TILE] : d.ai === 'caster' ? [3 * TILE, 5.5 * TILE] : null;
  if (keep) {
    const sees = clearShot(g, e.x, e.y - 16, p.x, p.y - 16);
    if (distP < keep[0] && sees) {
      // trop près : recule en gardant la cible en vue
      const ax = e.x - p.x;
      const ay = e.y - p.y;
      const al = Math.hypot(ax, ay) || 1;
      moveEnemy(g, e, d, (ax / al) * speed * 0.8 * dt, (ay / al) * speed * 0.8 * dt);
      e.moving = true;
      e.facing = facingOf(p.x - e.x, p.y - e.y);
      return;
    }
    if (distP > keep[1] || !sees) {
      steer(g, e, d, p.x, p.y, speed, dt);
      return;
    }
    // à bonne distance : pas de côté
    const s = e.id % 2 ? 1 : -1;
    const ax = -(p.y - e.y) / distP;
    const ay = (p.x - e.x) / distP;
    moveEnemy(g, e, d, ax * s * speed * 0.35 * dt, ay * s * speed * 0.35 * dt);
    e.moving = true;
    e.facing = facingOf(p.x - e.x, p.y - e.y);
    return;
  }
  if (d.ai === 'hitrun' && e.lostT < 0) {
    // repli après une morsure, puis nouveau passage
    e.lostT += dt;
    const ax = e.x - p.x;
    const ay = e.y - p.y;
    const al = Math.hypot(ax, ay) || 1;
    moveEnemy(g, e, d, (ax / al) * speed * 0.9 * dt, (ay / al) * speed * 0.9 * dt);
    e.moving = true;
    return;
  }
  // meute : léger contournement
  let gx = p.x;
  let gy = p.y;
  if (d.ai === 'pack' && distP > 50) {
    const s = e.id % 2 ? 1 : -1;
    gx += (-(p.y - e.y) / distP) * 30 * s;
    gy += ((p.x - e.x) / distP) * 30 * s;
  }
  if (distP < d.radius + 14) {
    e.moving = false;
    e.facing = facingOf(p.x - e.x, p.y - e.y);
    return;
  }
  steer(g, e, d, gx, gy, speed, dt);
}

/** Choisit une attaque disponible (portée, recharge, phase) et commence son annonce. */
function tryAttack(g: Game, e: Enemy, d: EnemyDef, distP: number): boolean {
  const p = g.player;
  if (p.dead || !d.attacks.length) return false;
  const options: number[] = [];
  let total = 0;
  d.attacks.forEach((a, i) => {
    if (e.cds[i] > 0) return;
    if ((a.phase ?? 1) > e.phase) return;
    if (distP > a.range) return;
    if ((a.kind === 'leap' || a.kind === 'charge') && distP < 60) return;
    if ((a.kind === 'shoot' || a.kind === 'spit' || a.kind === 'zone' || a.kind === 'bomb') && !clearShot(g, e.x, e.y - 16, p.x, p.y - 16)) return;
    if (a.kind === 'summon' && g.enemies.filter((x) => x.minion && x.dying <= 0).length >= 2) return;
    options.push(i);
    total += a.weight ?? 1;
  });
  if (!options.length) return false;
  let r = g.rng.next() * total;
  let pick = options[0];
  for (const i of options) {
    r -= d.attacks[i].weight ?? 1;
    if (r <= 0) {
      pick = i;
      break;
    }
  }
  startAttack(g, e, d, pick);
  return true;
}

function startAttack(g: Game, e: Enemy, d: EnemyDef, index: number): void {
  const p = g.player;
  const a = d.attacks[index];
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const dl = Math.hypot(dx, dy) || 1;
  e.facing = facingOf(dx, dy);
  e.moving = false;
  const windup = a.windup * (e.phase === 2 ? 0.85 : 1);
  e.atk = { index, t: 0, phase: 'windup', tx: p.x, ty: p.y, dx: dx / dl, dy: dy / dl, step: 0, hit: false };
  if (d.sound?.attack) g.emit({ type: 'sound', key: d.sound.attack, x: e.x, y: e.y });
  const dmg = a.damage * e.dmgMul;
  // attaques de zone : le cercle d'annonce est la zone elle-même
  switch (a.kind) {
    case 'zone':
      g.zones.push(makeZone(g, 'enemy_blast', p.x, p.y, (a.radius ?? 40) * (e.elite ? 1.3 : 1), windup, 0.1, 'enemy', dmg, 0));
      break;
    case 'bomb':
      g.zones.push(makeZone(g, 'enemy_blast', p.x, p.y, a.radius ?? 50, windup + 0.5, 0.1, 'enemy', dmg, 0));
      g.emit({ type: 'toast', text: 'Une bombe ! Sortez du cercle.', kind: 'warn' });
      break;
    case 'rockfall':
      for (let i = 0; i < (a.count ?? 3); i++) {
        const ang = g.rng.next() * Math.PI * 2;
        const r = i === 0 ? 0 : 40 + g.rng.next() * 90;
        g.zones.push(makeZone(g, 'rock', p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r, a.radius ?? 40, windup + i * 0.25, 0.1, 'enemy', dmg, 0));
      }
      break;
    case 'burrow':
      e.burrowed = true;
      g.zones.push(makeZone(g, 'enemy_blast', p.x, p.y, a.radius ?? 60, windup, 0.1, 'enemy', dmg, 0));
      break;
    case 'roar':
      g.zones.push(makeZone(g, 'roar', e.x, e.y, a.radius ?? 100, windup, 0.1, 'enemy', dmg, 0));
      break;
  }
}

function runAttack(g: Game, e: Enemy, d: EnemyDef, dt: number): void {
  const p = g.player;
  const atk = e.atk!;
  const a: AttackDef = d.attacks[atk.index];
  const windup = a.windup * (e.phase === 2 ? 0.85 : 1);
  const dmg = a.damage * e.dmgMul;
  atk.t += dt;
  if (atk.phase === 'windup') {
    if (a.kind === 'melee' || a.kind === 'combo' || a.kind === 'slam') {
      // les coups au corps à corps suivent légèrement la cible pendant l'annonce
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dl = Math.hypot(dx, dy) || 1;
      atk.dx = atk.dx * 0.9 + (dx / dl) * 0.1;
      atk.dy = atk.dy * 0.9 + (dy / dl) * 0.1;
      e.facing = facingOf(atk.dx, atk.dy);
    }
    if (atk.t < windup) return;
    atk.phase = 'active';
    atk.t = 0;
    if (a.kind === 'leap') {
      atk.tx = Math.min(Math.max(atk.tx, e.x - a.range), e.x + a.range);
    }
  }
  if (atk.phase === 'active') {
    switch (a.kind) {
      case 'melee':
        meleeHit(g, e, d, a, dmg);
        endActive(e);
        break;
      case 'combo': {
        const count = (a.count ?? 2) + (e.elite ? 1 : 0);
        if (atk.t >= atk.step * 0.3) {
          meleeHit(g, e, d, a, dmg);
          atk.step++;
          // petit pas en avant entre deux coups
          moveEnemy(g, e, d, atk.dx * 8, atk.dy * 8);
          if (atk.step >= count) endActive(e);
        }
        break;
      }
      case 'slam': {
        const cx = e.x + atk.dx * (a.range * 0.55);
        const cy = e.y + atk.dy * (a.range * 0.55);
        if (Math.hypot(p.x - cx, p.y - cy) <= (a.radius ?? 40) + 8) hurtPlayer(g, dmg, cx, cy, `Vous avez été écrasé par ${d.name.toLowerCase()}.`, { attacker: e, knock: 26 });
        g.emit({ type: 'fx', kind: 'dust', x: cx, y: cy, scale: (a.radius ?? 40) / 30 });
        g.emit({ type: 'shake', strength: 0.006 });
        endActive(e);
        break;
      }
      case 'leap':
      case 'charge': {
        const speed = a.kind === 'leap' ? 520 : 380;
        const ox = e.x;
        const oy = e.y;
        moveEnemy(g, e, d, atk.dx * speed * dt, atk.dy * speed * dt);
        const moved = Math.hypot(e.x - ox, e.y - oy);
        const toGo = a.kind === 'leap' ? Math.hypot(atk.tx - e.x, atk.ty - e.y) : a.range - atk.t * speed;
        if (!atk.hit && Math.hypot(p.x - e.x, p.y - e.y) < (a.radius ?? 24) + d.radius) {
          atk.hit = true;
          hurtPlayer(g, dmg, e.x, e.y, `Vous avez été renversé par ${d.name.toLowerCase()}.`, { attacker: e, knock: (a.knockback ?? 120) / 6 });
        }
        if (moved < speed * dt * 0.3 || toGo < 10 || atk.t > 1.2) {
          if (a.kind === 'leap') g.emit({ type: 'fx', kind: 'dust', x: e.x, y: e.y });
          if (moved < speed * dt * 0.3 && a.kind === 'charge') {
            // la charge heurte un mur : sonné un instant (belle fenêtre de riposte)
            e.st.stunT = e.boss ? 0.8 : 1.2;
            g.emit({ type: 'fx', kind: 'shock', x: e.x, y: e.y - 30 });
            g.emit({ type: 'sound', key: 'thud', x: e.x, y: e.y });
          }
          endActive(e);
        }
        break;
      }
      case 'shoot':
      case 'spit': {
        const count = (a.count ?? 1) + (e.elite && a.kind === 'shoot' ? 2 : 0);
        const base = Math.atan2(p.y - e.y, p.x - e.x);
        for (let i = 0; i < count; i++) {
          const spread = count > 1 ? (i - (count - 1) / 2) * 0.16 : 0;
          enemyShot(g, e, a.kind === 'shoot' ? 'enemy_arrow' : 'spit', dmg, a.speed ?? 300, base + spread, a.range + 80);
        }
        g.emit({ type: 'sound', key: a.kind === 'shoot' ? 'bow' : 'slime', x: e.x, y: e.y });
        endActive(e);
        break;
      }
      case 'burrow':
        // resurgit là où le cercle était annoncé
        e.x = atk.tx;
        e.y = atk.ty;
        e.burrowed = false;
        g.emit({ type: 'fx', kind: 'dust', x: e.x, y: e.y, scale: 2.5 });
        g.emit({ type: 'shake', strength: 0.012 });
        endActive(e);
        break;
      case 'summon': {
        const n = a.count ?? 2;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + g.rng.next();
          const x = e.x + Math.cos(ang) * 3 * TILE;
          const y = e.y + Math.sin(ang) * 3 * TILE;
          if (g.world.passableForEnemy(Math.floor(x / TILE), Math.floor(y / TILE))) {
            const m = spawnEnemy(g, i % 2 ? 'archer' : 'merc', x, y, { minion: true, dmgMul: e.dmgMul });
            m.state = 'chase';
            m.aggro = true;
          }
        }
        g.emit({ type: 'toast', text: 'Des renforts accourent !', kind: 'warn' });
        endActive(e);
        break;
      }
      default:
        // zones (explosion gérée par la zone elle-même)
        endActive(e);
    }
    return;
  }
  // récupération : fenêtre de riposte
  if (atk.t >= a.recover) {
    e.cds[atk.index] = a.cooldown * (e.elite ? 0.7 : 1) * (e.phase === 2 ? 0.8 : 1);
    e.atk = null;
    if (d.ai === 'hitrun') e.lostT = -0.9;
  }
}

function endActive(e: Enemy): void {
  if (!e.atk) return;
  e.atk.phase = 'recover';
  e.atk.t = 0;
}

function meleeHit(g: Game, e: Enemy, d: EnemyDef, a: AttackDef, dmg: number): void {
  const p = g.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const dot = (dx * e.atk!.dx + dy * e.atk!.dy) / dist;
  if (dist <= a.range + d.radius * 0.5 + 8 && (dot > 0.3 || dist < 16)) hurtPlayer(g, dmg, e.x, e.y, `Vous avez été tué par ${d.name.toLowerCase()}.`, { attacker: e, knock: (a.knockback ?? 60) / 5 });
  g.emit({ type: 'swing', x: e.x + e.atk!.dx * 20, y: e.y - 16 + e.atk!.dy * 16, angle: Math.atan2(e.atk!.dy, e.atk!.dx) });
}
