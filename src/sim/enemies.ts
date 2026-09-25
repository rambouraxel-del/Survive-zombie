// IA des zombies, apparitions, hordes nocturnes et vagues finales.
import { ASSAULT, ENEMY_CAP, FINAL, SPAWN, TILE } from '../config/balance';
import { BUILDING_BY_ID } from '../data/buildings';
import { ENEMIES, type EnemyType } from '../data/enemies';
import type { Game } from './game';
import { findPath } from './pathfinding';
import type { Enemy, Facing } from './types';
import { POI } from '../world/generate';

// ------------------------------------------------------------ recherche spatiale
const CELL = 4 * TILE;
const grid = new Map<number, Enemy[]>();
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
}

export function enemiesNear(g: Game, x: number, y: number, r: number): Enemy[] {
  if (!grid.size && g.enemies.length) rebuildGrid(g);
  const out: Enemy[] = [];
  const x0 = Math.floor((x - r) / CELL);
  const x1 = Math.floor((x + r) / CELL);
  const y0 = Math.floor((y - r) / CELL);
  const y1 = Math.floor((y + r) / CELL);
  for (let cy = y0; cy <= y1; cy++)
    for (let cx = x0; cx <= x1; cx++) {
      const arr = grid.get(key(cx, cy));
      if (!arr) continue;
      for (const e of arr) if (Math.hypot(e.x - x, e.y - y) <= r) out.push(e);
    }
  return out;
}

// ------------------------------------------------------------ création
export function spawnEnemy(g: Game, type: EnemyType, x: number, y: number, kind: Enemy['kind']): Enemy {
  const d = ENEMIES[type];
  const e: Enemy = {
    id: g.nextEnemyId++, type, x, y, hp: d.hp, state: kind === 'ambient' || kind === 'guardian' ? 'wander' : 'chase',
    facing: 'down', tx: x, ty: y, path: [], pathIdx: 0, repathT: Math.random() * 0.5, blockerId: -1,
    windup: 0, windupTarget: 'player', cooldown: 0, wanderT: 0, searchT: 0, lostT: 0,
    lastSeenX: g.player.x, lastSeenY: g.player.y, kbx: 0, kby: 0, hurtT: 0, dying: 0, kind,
    perceiveT: Math.random() * 0.3, groanT: 3 + Math.random() * 8, stuckT: 0, lastX: x, lastY: y, moving: false,
  };
  g.enemies.push(e);
  grid.clear();
  return e;
}

export function damageEnemy(g: Game, e: Enemy, dmg: number, kx: number, ky: number): void {
  const d = ENEMIES[e.type];
  e.hp -= dmg;
  e.hurtT = 0.2;
  e.kbx += kx * (1 - d.knockbackResist);
  e.kby += ky * (1 - d.knockbackResist);
  e.windup = Math.max(0, e.windup - 0.15); // un coup retarde légèrement l'attaque annoncée
  if (e.state !== 'chase' && e.kind !== 'final') {
    e.state = 'chase';
    e.repathT = 0;
  }
  g.emit({ type: 'float', x: e.x, y: e.y - 48, text: `${dmg}`, color: '#ffffff' });
  g.emit({ type: 'hitfx', x: e.x, y: e.y - 20 });
  g.emit({ type: 'sound', key: `hit_${g.rng.int(0, 2)}`, x: e.x, y: e.y });
  if (e.hp <= 0 && e.dying <= 0) {
    e.dying = 0.9;
    e.windup = 0;
    g.stats.kills++;
    g.emit({ type: 'sound', key: 'zdeath', x: e.x, y: e.y });
  }
}

function facingOf(dx: number, dy: number): Facing {
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
}

function lineOfSight(g: Game, x0: number, y0: number, x1: number, y1: number): boolean {
  const w = g.world;
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE / 2));
  for (let i = 1; i < steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = y0 + ((y1 - y0) * i) / steps;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const o = w.objectAtTile(tx, ty);
    if (o && o.solid && (o.type === 'house' || o.type === 'rock')) return false;
    const b = w.buildingAtTile(tx, ty);
    if (b && (b.type === 'palisade' || b.type === 'door')) return false;
  }
  return true;
}

function moveEnemy(g: Game, e: Enemy, dx: number, dy: number, r: number): void {
  const w = g.world;
  const blocked = (x: number, y: number) => {
    const x0 = Math.floor((x - r) / TILE);
    const x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - r * 0.6) / TILE);
    const y1 = Math.floor((y + r * 0.4) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (!w.passableForEnemy(tx, ty)) return true;
    return false;
  };
  if (dx && !blocked(e.x + dx, e.y)) e.x += dx;
  if (dy && !blocked(e.x, e.y + dy)) e.y += dy;
}

// ------------------------------------------------------------ mise à jour
export function updateEnemies(g: Game, dt: number): void {
  rebuildGrid(g);
  const p = g.player;
  const night = g.isDark();
  for (const e of g.enemies) {
    const d = ENEMIES[e.type];
    if (e.dying > 0) {
      e.dying -= dt;
      continue;
    }
    e.hurtT = Math.max(0, e.hurtT - dt);
    e.cooldown = Math.max(0, e.cooldown - dt);
    // recul
    if (Math.abs(e.kbx) + Math.abs(e.kby) > 1) {
      moveEnemy(g, e, e.kbx * dt, e.kby * dt, d.radius);
      e.kbx *= Math.pow(0.0005, dt);
      e.kby *= Math.pow(0.0005, dt);
    }

    // contact avec des pieux
    for (const b of g.nearbyBuildings(e.x, e.y, 1.3 * TILE)) {
      const bd = BUILDING_BY_ID[b.type];
      if (bd.contactDamage) {
        e.hp -= bd.contactDamage * dt;
        if (e.hp <= 0) {
          e.dying = 0.9;
          g.stats.kills++;
          g.emit({ type: 'sound', key: 'zdeath', x: e.x, y: e.y });
        }
      }
    }
    if (e.dying > 0) continue;

    // attaque annoncée
    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0) {
        e.cooldown = d.recover;
        if (e.windupTarget === 'player') {
          const dist = Math.hypot(p.x - e.x, p.y - e.y);
          if (dist <= d.attackRange + 10 && !p.dead) g.hurtPlayer(d.damage, e.x, e.y, `Vous avez été tué par un ${d.name.toLowerCase()}.`);
        } else {
          const b = g.world.buildings.get(e.windupTarget);
          if (b) {
            g.damageBuilding(b, d.buildingDamage);
            const bd = BUILDING_BY_ID[b.type];
            if (bd.contactDamage) {
              e.hp -= 4;
              if (e.hp <= 0) {
                e.dying = 0.9;
                g.stats.kills++;
              }
            }
          }
        }
      }
      continue;
    }

    // perception
    e.perceiveT -= dt;
    const distP = Math.hypot(p.x - e.x, p.y - e.y);
    if (e.perceiveT <= 0) {
      e.perceiveT = 0.25;
      const sight = d.sight * (night ? 1.35 : 1);
      if (!p.dead && e.state !== 'retreat' && distP < sight && lineOfSight(g, e.x, e.y - 16, p.x, p.y - 16)) {
        if (e.state !== 'chase') e.repathT = 0;
        e.state = 'chase';
        e.lostT = 0;
        e.lastSeenX = p.x;
        e.lastSeenY = p.y;
      } else if (e.state === 'chase' && e.kind !== 'assault' && e.kind !== 'final') {
        e.lostT += 0.25;
        if (e.lostT > 3 || p.dead) {
          e.state = 'search';
          e.searchT = 6;
          e.tx = e.lastSeenX;
          e.ty = e.lastSeenY;
          e.repathT = 0;
        }
      }
      e.groanT -= 0.25;
      if (e.groanT <= 0 && distP < 12 * TILE) {
        e.groanT = 5 + Math.random() * 9;
        g.emit({ type: 'sound', key: `zgroan_${g.rng.int(0, 3)}`, x: e.x, y: e.y });
      }
    }
    if (p.dead && e.state === 'chase') {
      e.state = 'wander';
    }

    // cible courante
    let speed = d.wanderSpeed;
    let goalX = e.tx;
    let goalY = e.ty;
    const w = g.world;
    if (e.state === 'chase') {
      speed = d.speed * (night ? 1.1 : 1);
      goalX = p.x;
      goalY = p.y;
      e.lastSeenX = p.x;
      e.lastSeenY = p.y;
      // attaque du joueur
      if (distP <= d.attackRange && e.cooldown <= 0 && !p.dead) {
        e.windup = d.windup;
        e.windupTarget = 'player';
        e.facing = facingOf(p.x - e.x, p.y - e.y);
        g.emit({ type: 'sound', key: 'zattack', x: e.x, y: e.y });
        continue;
      }
    } else if (e.state === 'retreat') {
      speed = d.wanderSpeed * 1.4;
      if (distP > SPAWN.minDist) {
        e.hp = 0;
        e.dying = 0.01;
        continue;
      }
      goalX = e.x + (e.x - p.x);
      goalY = e.y + (e.y - p.y);
    } else if (e.state === 'wander') {
      e.wanderT -= dt;
      if (e.wanderT <= 0) {
        e.wanderT = 3 + Math.random() * 5;
        const a = Math.random() * Math.PI * 2;
        e.tx = e.x + Math.cos(a) * 4 * TILE;
        e.ty = e.y + Math.sin(a) * 4 * TILE;
        // les gardiens restent près de leur lieu
        if (e.kind === 'guardian' && Math.hypot(e.tx - e.lastSeenX, e.ty - e.lastSeenY) > 8 * TILE) {
          e.tx = e.lastSeenX;
          e.ty = e.lastSeenY;
        }
      }
      goalX = e.tx;
      goalY = e.ty;
    } else if (e.state === 'investigate' || e.state === 'search') {
      speed = d.speed * 0.7;
      goalX = e.tx;
      goalY = e.ty;
      if (Math.hypot(goalX - e.x, goalY - e.y) < 20) {
        e.searchT -= dt;
        if (e.state === 'investigate') {
          e.state = 'search';
          e.searchT = 4;
        }
        if (e.searchT <= 0) e.state = 'wander';
      }
    }

    // chemin (recalculé à fréquence limitée)
    const usePath = e.state === 'chase' || e.state === 'investigate' || e.state === 'search';
    let mx = goalX - e.x;
    let my = goalY - e.y;
    if (usePath) {
      e.repathT -= dt;
      if (e.repathT <= 0) {
        e.repathT = 0.7 + Math.random() * 0.4;
        const sx = Math.floor(e.x / TILE);
        const sy = Math.floor(e.y / TILE);
        const tx = Math.max(0, Math.min(w.w - 1, Math.floor(goalX / TILE)));
        const ty = Math.max(0, Math.min(w.h - 1, Math.floor(goalY / TILE)));
        if (Math.abs(sx - tx) + Math.abs(sy - ty) <= 1) {
          e.path = [];
        } else {
          const res = findPath(w, sx, sy, tx, ty, { breakCost: e.type === 'brute' ? 5 : 14, budget: e.state === 'chase' ? 2600 : 900 });
          e.path = res.path;
          e.pathIdx = 0;
          e.blockerId = res.blockerId;
        }
      }
      if (e.path.length && e.pathIdx < e.path.length) {
        const n = e.path[e.pathIdx];
        const b = w.buildingAtTile(n.x, n.y);
        if (b && BUILDING_BY_ID[b.type].blocks) {
          // passage bloqué par une construction : on l'attaque
          const c = w.buildingCenter(b);
          if (Math.hypot(c.x - e.x, c.y - e.y) < TILE * 1.1 + d.radius) {
            if (e.cooldown <= 0) {
              e.windup = d.windup;
              e.windupTarget = b.id;
              e.facing = facingOf(c.x - e.x, c.y - e.y);
            }
            continue;
          }
        }
        const cx = (n.x + 0.5) * TILE;
        const cy = (n.y + 0.5) * TILE;
        if (Math.hypot(cx - e.x, cy - e.y) < 6) e.pathIdx++;
        mx = cx - e.x;
        my = cy - e.y;
      }
    }
    let ml = Math.hypot(mx, my);
    // ne se colle pas au joueur : garde une petite distance
    if (e.state === 'chase' && distP < 18) ml = 0;
    e.moving = ml > 3;
    if (e.moving) {
      const vx = (mx / ml) * speed * dt;
      const vy = (my / ml) * speed * dt;
      moveEnemy(g, e, vx, vy, d.radius);
      e.facing = facingOf(mx, my);
    }
    // séparation entre zombies
    for (const o of enemiesNear(g, e.x, e.y, 22)) {
      if (o === e || o.dying > 0) continue;
      const sx = e.x - o.x;
      const sy = e.y - o.y;
      const sd = Math.hypot(sx, sy) || 1;
      if (sd < 18) moveEnemy(g, e, (sx / sd) * 30 * dt, (sy / sd) * 30 * dt, d.radius);
    }
    // blocage : nouvelle destination d'errance
    if (e.state === 'wander') {
      if (Math.hypot(e.x - e.lastX, e.y - e.lastY) < 2 * dt) e.stuckT += dt;
      else e.stuckT = 0;
      if (e.stuckT > 1) {
        e.stuckT = 0;
        e.wanderT = 0;
      }
    }
    e.lastX = e.x;
    e.lastY = e.y;
  }
  g.enemies = g.enemies.filter((e) => e.hp > 0 || e.dying > 0);
  grid.clear();
}

// ------------------------------------------------------------ apparitions
function pickType(g: Game, zone: string, kind: 'ambient' | 'assault'): EnemyType {
  const r = g.rng.next();
  const late = g.day >= 3;
  if (kind === 'assault') {
    if (g.day >= 3 && r < 0.14) return 'brute';
    if (g.day >= 2 && r < 0.42) return 'affame';
    return 'rodeur';
  }
  switch (zone) {
    case 'corrupt':
    case 'sanctuary':
      return r < 0.2 ? 'brute' : r < 0.5 ? 'affame' : 'rodeur';
    case 'cemetery':
      return r < 0.1 ? 'brute' : r < 0.4 ? 'affame' : 'rodeur';
    case 'hamlet':
      return r < 0.06 ? 'brute' : r < 0.32 ? 'affame' : 'rodeur';
    default:
      return late && r < 0.04 ? 'brute' : r < (late ? 0.3 : 0.15) ? 'affame' : 'rodeur';
  }
}

/** Cherche un point d'apparition hors de vue, hors des enclos et loin du départ. */
export function findSpawnPoint(g: Game, cx: number, cy: number, minD: number, maxD: number): { x: number; y: number } | null {
  const w = g.world;
  const outside = w.outsideMask();
  const p = g.player;
  for (let k = 0; k < 40; k++) {
    const a = g.rng.range(0, Math.PI * 2);
    const d = g.rng.range(minD, maxD);
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (!w.inBounds(tx, ty) || !outside[w.idx(tx, ty)]) continue;
    if (Math.hypot(tx - w.start.x, ty - w.start.y) < SPAWN.safeRadiusTiles) continue;
    if (Math.hypot(x - p.x, y - p.y) < SPAWN.minDist * 0.8) continue;
    // jamais dans le champ de vision réel de la caméra
    if (Math.abs(x - p.x) < g.view.hw + 2 * TILE && Math.abs(y - p.y) < g.view.hh + 3 * TILE) continue;
    return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  return null;
}

const ambientTarget: Record<string, number> = { start: 2, forest: 5, hamlet: 7, cemetery: 7, corrupt: 10, sanctuary: 8 };

export function updateSpawning(g: Game, dt: number): void {
  const p = g.player;
  if (p.dead) return;
  const alive = g.enemies.filter((e) => e.dying <= 0);

  // disparition des errants trop éloignés
  g.enemies = g.enemies.filter((e) => {
    if (e.kind !== 'ambient') return true;
    if (e.state === 'chase') return true;
    return Math.hypot(e.x - p.x, e.y - p.y) < SPAWN.despawnDist;
  });

  // gardiens des lieux maudits (une seule fois par lieu)
  for (const lm of g.world.landmarks) {
    if (!['hamlet', 'cemetery', 'stones'].includes(lm.id) || g.stats.guardiansSpawned.includes(lm.id)) continue;
    const lx = (lm.x + 0.5) * TILE;
    const ly = (lm.y + 0.5) * TILE;
    if (Math.hypot(lx - p.x, ly - p.y) < 22 * TILE) {
      g.stats.guardiansSpawned.push(lm.id);
      const group: EnemyType[] = lm.id === 'hamlet' ? ['rodeur', 'rodeur', 'affame', 'rodeur'] : lm.id === 'cemetery' ? ['rodeur', 'affame', 'affame', 'brute'] : ['brute', 'affame', 'affame', 'rodeur', 'rodeur'];
      for (const t of group) {
        for (let k = 0; k < 20; k++) {
          const x = lx + g.rng.range(-5, 5) * TILE;
          const y = ly + g.rng.range(-5, 5) * TILE;
          if (g.world.passableForEnemy(Math.floor(x / TILE), Math.floor(y / TILE))) {
            const e = spawnEnemy(g, t, x, y, 'guardian');
            e.lastSeenX = lx;
            e.lastSeenY = ly;
            break;
          }
        }
      }
    }
  }

  // population ambiante
  g.spawnTimer -= dt;
  if (g.spawnTimer <= 0 && g.clock > 150) {
    g.spawnTimer = SPAWN.ambientCheckEvery;
    const zone = g.world.zoneAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
    let target = ambientTarget[zone] ?? 5;
    if (g.isDark()) target = Math.round(target * 1.5);
    if (g.freed) target = Math.ceil(target / 2);
    const ambient = alive.filter((e) => e.kind === 'ambient').length;
    if (ambient < target && alive.length < ENEMY_CAP) {
      const pt = findSpawnPoint(g, p.x, p.y, SPAWN.minDist, SPAWN.maxDist);
      if (pt) spawnEnemy(g, pickType(g, g.world.zoneAt(Math.floor(pt.x / TILE), Math.floor(pt.y / TILE)), 'ambient'), pt.x, pt.y, 'ambient');
    }
  }

  // horde nocturne
  const ph = g.phase();
  if (ph === 'night' && (!g.assault || g.assault.night !== g.day)) {
    const total = g.freed ? ASSAULT.postVictoryCount : ASSAULT.count(g.day);
    g.assault = { night: g.day, total, spawned: 0, timer: 4, announced: true, done: false };
    g.toast(`La horde arrive : ${total} zombies approchent !`, 'warn');
    g.emit({ type: 'sound', key: 'zgroan_0' });
  }
  const a = g.assault;
  if (a && !a.done && a.night === g.day && ph === 'night') {
    a.timer -= dt;
    if (a.spawned < a.total && a.timer <= 0 && alive.length < ENEMY_CAP) {
      a.timer = ASSAULT.spawnWindow / a.total;
      const pt = findSpawnPoint(g, p.x, p.y, 18 * TILE, 25 * TILE);
      if (pt) {
        spawnEnemy(g, pickType(g, 'forest', 'assault'), pt.x, pt.y, 'assault');
        a.spawned++;
      }
    }
    if (a.spawned >= a.total && !g.enemies.some((e) => e.kind === 'assault' && e.dying <= 0)) {
      a.done = true;
      g.toast('La horde de cette nuit est repoussée. Vous pouvez dormir.', 'good');
      g.emit({ type: 'save', reason: 'assault' });
    }
  }

  // vagues de l'assaut final
  const f = g.final;
  if (f.state === 'active' && !f.spawnedWave) {
    const wave = FINAL.waves[f.wave];
    const sx = (POI.sanctuary.x + 1) * TILE;
    const sy = (POI.sanctuary.y + 1) * TILE;
    let n = 0;
    for (const [t, count] of Object.entries(wave) as [EnemyType, number][]) {
      for (let i = 0; i < count; i++) {
        const pt = findSpawnPoint(g, sx, sy, 13 * TILE, 19 * TILE) ?? findSpawnPoint(g, p.x, p.y, 14 * TILE, 22 * TILE);
        if (pt) {
          spawnEnemy(g, t, pt.x, pt.y, 'final');
          n++;
        }
      }
    }
    f.spawnedWave = true;
    f.pause = FINAL.pauseBetween;
    g.toast(`Vague ${f.wave + 1}/3 : ${n} ennemis convergent vers le sanctuaire !`, 'warn');
    g.emit({ type: 'sound', key: 'bell' });
  }
}
