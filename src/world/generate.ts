// Génération procédurale du monde (déterministe à partir d'une graine),
// avec validation de connectivité et corridors de secours déterministes.
import { WORLD_H, WORLD_W } from '../config/balance';
import { NOTES } from '../data/notes';
import { Rng } from '../sim/rng';
import { World, ZONES, type ObjType, type WObj, type Zone } from './world';

interface P {
  x: number;
  y: number;
}

export const POI = {
  start: { x: 80, y: 140 },
  hamlet: { x: 128, y: 90 },
  cemetery: { x: 31, y: 88 },
  stones: { x: 40, y: 27 },
  sanctuary: { x: 80, y: 15 },
  crossroad: { x: 80, y: 96 },
};

const ZI: Record<Zone, number> = Object.fromEntries(ZONES.map((z, i) => [z, i])) as Record<Zone, number>;

export interface GenReport {
  ok: boolean;
  carved: number;
  unreachable: string[];
  ironReachable: number;
  coalReachable: number;
}

function dist(a: P, b: P): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

class Builder {
  w: World;
  r: Rng;
  constructor(w: World, r: Rng) {
    this.w = w;
    this.r = r;
  }

  free(fx: number, fy: number, fw: number, fh: number, allowRoad = false, margin = 0): boolean {
    for (let y = fy - margin; y < fy + fh + margin; y++)
      for (let x = fx - margin; x < fx + fw + margin; x++) {
        if (x < 1 || y < 1 || x >= this.w.w - 1 || y >= this.w.h - 1) return false;
        const i = this.w.idx(x, y);
        if (this.w.objAt[i] >= 0) return false;
        if (y >= fy && y < fy + fh && x >= fx && x < fx + fw) {
          if (this.w.reserved[i]) return false;
          if (!allowRoad && this.w.road[i]) return false;
        }
      }
    return true;
  }

  add(type: ObjType, sprite: string, fx: number, fy: number, fw: number, fh: number, solid: boolean, extra: Partial<WObj> = {}): WObj {
    const o: WObj = {
      id: -1, type, sprite, fx, fy, fw, fh, solid,
      zone: this.w.zoneAt(fx, fy),
      ...extra,
    };
    this.w.registerObject(o);
    return o;
  }

  reserve(cx: number, cy: number, r: number): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if (this.w.inBounds(x, y) && Math.hypot(x - cx, y - cy) <= r) this.w.reserved[this.w.idx(x, y)] = 1;
  }

  dirtDisc(cx: number, cy: number, r: number): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r) + 1; y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r) + 1; x++)
        if (x >= 0 && y >= 0 && x <= this.w.w && y <= this.w.h && Math.hypot(x - cx, y - cy) <= r)
          this.w.ground[y * (this.w.w + 1) + x] = 0;
  }

  /** Chemin sinueux en terre battue. */
  road(a: P, b: P, width = 1.3): void {
    const steps = Math.ceil(dist(a, b) * 2);
    const nx = -(b.y - a.y) / dist(a, b);
    const ny = (b.x - a.x) / dist(a, b);
    const amp = this.r.range(2, 5);
    const freq = this.r.range(1, 2.5);
    const phase = this.r.range(0, Math.PI * 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const off = Math.sin(t * Math.PI * freq + phase) * amp * Math.sin(t * Math.PI);
      const x = a.x + (b.x - a.x) * t + nx * off;
      const y = a.y + (b.y - a.y) * t + ny * off;
      this.dirtDisc(x, y, width);
      for (let yy = Math.floor(y - width - 1); yy <= Math.ceil(y + width); yy++)
        for (let xx = Math.floor(x - width - 1); xx <= Math.ceil(x + width); xx++)
          if (this.w.inBounds(xx, yy) && Math.hypot(xx + 0.5 - x, yy + 0.5 - y) <= width + 0.8) this.w.road[this.w.idx(xx, yy)] = 1;
    }
  }
}

function assignZones(w: World, r: Rng): void {
  const n1 = r.range(0, 10);
  for (let y = 0; y < w.h; y++)
    for (let x = 0; x < w.w; x++) {
      let z: Zone = 'forest';
      const p = { x, y };
      const corruptEdge = 50 + Math.sin(x / 9 + n1) * 3 + Math.sin(x / 23) * 3;
      if (y < corruptEdge) z = 'corrupt';
      if (dist(p, POI.sanctuary) < 10) z = 'sanctuary';
      if (dist(p, POI.hamlet) < 18) z = 'hamlet';
      if (dist(p, POI.cemetery) < 15) z = 'cemetery';
      if (dist(p, POI.start) < 13) z = 'start';
      const i = w.idx(x, y);
      w.zone[i] = ZI[z];
      w.palette[i] = z === 'cemetery' || z === 'corrupt' || z === 'sanctuary' ? 1 : 0;
    }
}

/** Supprime les configurations diagonales que le jeu de tuiles ne sait pas dessiner. */
function fixDiagonals(w: World): void {
  const W1 = w.w + 1;
  for (let pass = 0; pass < 12; pass++) {
    let changed = 0;
    for (let y = 0; y < w.h; y++)
      for (let x = 0; x < w.w; x++) {
        const tl = w.ground[y * W1 + x];
        const tr = w.ground[y * W1 + x + 1];
        const bl = w.ground[(y + 1) * W1 + x];
        const br = w.ground[(y + 1) * W1 + x + 1];
        if ((tl && br && !tr && !bl) || (tr && bl && !tl && !br)) {
          w.ground[y * W1 + x] = 0;
          w.ground[y * W1 + x + 1] = 0;
          w.ground[(y + 1) * W1 + x] = 0;
          w.ground[(y + 1) * W1 + x + 1] = 0;
          changed++;
        }
      }
    if (!changed) break;
  }
}

const TREES_SUMMER = ['world:tree_oak_a', 'world:tree_oak_b', 'world:tree_pine_a', 'world:tree_pine_b'];
const TREES_AUTUMN = ['world:tree_autumn_a', 'world:tree_autumn_b'];

function treeSprite(r: Rng, z: Zone): string {
  if (z === 'corrupt') return r.chance(0.7) ? 'world:tree_dead' : r.pick(TREES_AUTUMN);
  if (z === 'cemetery') return r.chance(0.35) ? 'world:tree_dead' : r.pick(TREES_AUTUMN);
  if (z === 'sanctuary') return 'world:tree_dead';
  return r.pick(TREES_SUMMER);
}

function placeHouses(b: Builder): void {
  const c = POI.hamlet;
  const houses: [string, number, number, number, number][] = [
    ['world:house_a', c.x - 12, c.y - 9, 6, 3],
    ['world:house_b', c.x + 3, c.y - 11, 4, 3],
    ['world:house_c', c.x + 9, c.y - 2, 5, 2],
    ['world:house_b', c.x - 13, c.y + 4, 4, 3],
    ['world:house_c', c.x + 1, c.y + 7, 5, 2],
  ];
  for (const [s, x, y, fw, fh] of houses) b.add('house', s, x, y, fw, fh, true, { occluder: true });
}

export function generateWorld(seed: number): { world: World; report: GenReport } {
  const w = new World(WORLD_W, WORLD_H, seed);
  const r = new Rng(seed);
  const b = new Builder(w, r);
  w.start = { ...POI.start };
  assignZones(w, r);

  // Chemins
  b.road(POI.start, POI.crossroad, 1.4);
  b.road(POI.crossroad, POI.hamlet, 1.3);
  b.road(POI.crossroad, POI.cemetery, 1.3);
  b.road(POI.crossroad, { x: 80, y: 50 }, 1.3);
  b.road({ x: 80, y: 50 }, { x: POI.sanctuary.x, y: POI.sanctuary.y + 5 }, 1.2);
  b.road({ x: 80, y: 50 }, POI.stones, 1.1);
  // places en terre battue
  b.dirtDisc(POI.start.x + 0.5, POI.start.y + 0.5, 3.2);
  b.dirtDisc(POI.hamlet.x, POI.hamlet.y, 5.5);
  b.dirtDisc(POI.sanctuary.x + 1, POI.sanctuary.y + 1, 5);
  b.dirtDisc(POI.stones.x + 0.5, POI.stones.y + 0.5, 3.5);
  b.dirtDisc(POI.cemetery.x, POI.cemetery.y, 3);
  // quelques clairières terreuses
  for (let i = 0; i < 40; i++) {
    const x = r.int(8, w.w - 8);
    const y = r.int(8, w.h - 8);
    if (dist({ x, y }, POI.start) > 16) b.dirtDisc(x, y, r.range(1.2, 2.6));
  }
  fixDiagonals(w);

  // Réserves (aucun obstacle, aucune construction)
  b.reserve(POI.start.x, POI.start.y, 2.5);
  b.reserve(POI.sanctuary.x + 1, POI.sanctuary.y + 1, 6);
  b.reserve(POI.stones.x, POI.stones.y, 1.5);

  // --- Camp de départ ---
  const s = POI.start;
  b.add('container', 'world:chest_closed', s.x + 3, s.y - 2, 1, 1, true, { guaranteed: 'start_chest', items: null, label: 'Coffre du camp' });
  b.add('decor', 'world:crate_stack', s.x - 3, s.y - 2, 1, 1, true);
  b.add('decor', 'world:barrel', s.x - 4, s.y - 1, 1, 1, true);
  b.add('decor', 'world:hay_pile', s.x + 4, s.y + 1, 2, 2, false);
  const startNote = NOTES.find((n) => n.id === 'n_camp')!;
  b.add('note', 'world:paper', s.x - 2, s.y + 2, 1, 1, false, { noteId: startNote.id });
  // ressources essentielles garanties près du départ
  const nearStart = (type: ObjType, sprite: string, n: number, rmin: number, rmax: number, solid: boolean, extra: Partial<WObj> = {}) => {
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < n; tries++) {
      const a = r.range(0, Math.PI * 2);
      const d = r.range(rmin, rmax);
      const x = Math.round(s.x + Math.cos(a) * d);
      const y = Math.round(s.y + Math.sin(a) * d);
      if (b.free(x, y, 1, 1, false, 1)) {
        b.add(type, sprite, x, y, 1, 1, solid, extra);
        placed++;
      }
    }
  };
  nearStart('bush', 'world:bush_berry', 6, 4, 11, true, { hp: 1, maxHp: 1 });
  nearStart('grass', 'world:grass_tall', 10, 3, 11, false, { hp: 1, maxHp: 1 });
  nearStart('rock', 'world:rock_small', 5, 4, 11, true, { hp: 5, maxHp: 5 });
  nearStart('rock', 'world:rock_pebble', 5, 3, 10, false, { hp: 1, maxHp: 1 });
  nearStart('morel', 'world:morel', 3, 5, 12, false, { hp: 1, maxHp: 1 });
  nearStart('tree', 'world:tree_oak_a', 7, 6, 12, true, { hp: 6, maxHp: 6, occluder: true });
  nearStart('tree', 'world:tree_pine_a', 5, 7, 12, true, { hp: 6, maxHp: 6, occluder: true });

  // --- Hameau ---
  placeHouses(b);
  const h = POI.hamlet;
  b.add('altar', 'world:pillar', h.x + 1, h.y - 2, 1, 1, true, { frag: 'frag_1', label: 'Pilier de la vieille forge' });
  b.add('decor', 'world:anvil', h.x - 2, h.y - 2, 1, 1, true);
  b.add('container', 'world:chest_closed', h.x - 1, h.y - 3, 1, 1, true, { guaranteed: 'hamlet_forge_chest', items: null, label: 'Coffre du forgeron' });
  b.add('decor', 'world:barrels', h.x + 3, h.y - 3, 2, 1, true);
  b.add('decor', 'world:coal_pile', h.x - 5, h.y + 2, 2, 1, true);
  const hamletChests: P[] = [
    { x: h.x - 8, y: h.y - 5 }, { x: h.x + 6, y: h.y - 7 }, { x: h.x + 12, y: h.y + 1 },
    { x: h.x - 10, y: h.y + 8 }, { x: h.x + 4, y: h.y + 10 },
  ];
  for (const p of hamletChests)
    if (b.free(p.x, p.y, 1, 1, true)) b.add('container', 'world:chest_closed', p.x, p.y, 1, 1, true, { loot: 'hamlet', items: null, label: 'Coffre' });
  for (let i = 0; i < 14; i++) {
    const x = h.x + r.int(-15, 15);
    const y = h.y + r.int(-12, 12);
    if (b.free(x, y, 1, 1, false, 1)) b.add('decor', r.pick(['world:crate', 'world:crate_b', 'world:barrel']), x, y, 1, 1, true);
  }

  // --- Cimetière ---
  const c = POI.cemetery;
  for (let gy = -8; gy <= 8; gy += 3)
    for (let gx = -10; gx <= 10; gx += 3) {
      const x = c.x + gx + r.int(0, 1);
      const y = c.y + gy;
      if (Math.abs(gx) < 3 && Math.abs(gy) < 4) continue;
      if (!b.free(x, y, 2, 1, false)) continue;
      if (r.chance(0.18)) b.add('container', 'world:tomb_slab', x, y, 2, 1, true, { loot: 'crypt', items: null, label: 'Tombe descellée' });
      else if (r.chance(0.6)) b.add('decor', r.pick(['items:grave_cross', 'items:grave_cross_b']), x, y, 1, 1, true);
      else b.add('decor', 'world:tomb_slab_b', x, y, 2, 1, true);
    }
  // crypte : piliers autour de la pierre du loup
  b.add('altar', 'world:pillar', c.x, c.y - 1, 1, 1, true, { frag: 'frag_2', label: 'Autel de la crypte' });
  for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 1], [2, 1]]) if (b.free(c.x + dx, c.y + dy, 1, 1, true)) b.add('decor', 'world:pillar', c.x + dx, c.y + dy, 1, 1, true, { occluder: true });
  for (let i = 0; i < 8; i++) {
    const x = c.x + r.int(-12, 12);
    const y = c.y + r.int(-10, 10);
    if (b.free(x, y, 1, 1, false, 1)) b.add('decor', r.pick(['world:skull', 'world:bones']), x, y, 1, 1, false);
  }

  // --- Pierres noires (bois corrompus) ---
  const st = POI.stones;
  b.add('altar', 'world:pillar_dark', st.x, st.y, 1, 1, true, { frag: 'frag_3', label: 'Cœur des pierres noires' });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.round(st.x + Math.cos(a) * 4);
    const y = Math.round(st.y + Math.sin(a) * 3.5);
    if (b.free(x, y, 1, 1, true)) b.add('decor', 'world:pillar_dark', x, y, 1, 1, true, { occluder: true });
  }
  for (const p of [{ x: st.x + 7, y: st.y - 3 }, { x: st.x - 6, y: st.y + 5 }, { x: st.x + 5, y: st.y + 6 }])
    if (b.free(p.x, p.y, 1, 1, true, 0)) b.add('container', 'world:crate_stack', p.x, p.y, 1, 1, true, { loot: 'corrupt', items: null, label: 'Caisse abandonnée' });

  // --- Sanctuaire ---
  const sa = POI.sanctuary;
  const sanct = b.add('sanctuary', 'world:seal_stone', sa.x, sa.y, 2, 2, true, { label: 'Pierre du Loup' });
  w.sanctuaryId = sanct.id;
  for (const [dx, dy] of [[-3, -2], [4, -2], [-3, 3], [4, 3]]) b.add('decor', 'world:pillar', sa.x + dx, sa.y + dy, 1, 1, true, { occluder: true });

  // --- Notes ---
  const notePos: Record<string, P> = {
    n_road: { x: POI.crossroad.x + 2, y: POI.crossroad.y + 3 },
    n_hunter: { x: s.x - 14, y: s.y - 8 },
    n_hamlet: { x: h.x + 2, y: h.y + 2 },
    n_smith: { x: h.x - 3, y: h.y + 1 },
    n_cemetery: { x: c.x + 1, y: c.y + 2 },
    n_corrupt: { x: st.x - 2, y: st.y + 3 },
    n_sanctuary: { x: sa.x, y: sa.y + 4 },
  };
  for (const [id, p] of Object.entries(notePos)) {
    let placed = false;
    for (let k = 0; k < 30 && !placed; k++) {
      const x = p.x + (k ? r.int(-3, 3) : 0);
      const y = p.y + (k ? r.int(-3, 3) : 0);
      if (b.free(x, y, 1, 1, true)) {
        b.add('note', 'world:paper', x, y, 1, 1, false, { noteId: id });
        placed = true;
      }
    }
  }

  // --- Chargements abandonnés le long des chemins, caches en forêt ---
  const roadTiles: P[] = [];
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (w.road[w.idx(x, y)]) roadTiles.push({ x, y });
  let carts = 0;
  for (let k = 0; k < 800 && carts < 8; k++) {
    const t = r.pick(roadTiles);
    const side = r.chance(0.5) ? 2 : -2;
    const x = t.x + side;
    const y = t.y;
    const z = w.zoneAt(x, y);
    if (z !== 'forest' || dist({ x, y }, s) < 18) continue;
    if (!b.free(x, y, 2, 1, false, 1)) continue;
    b.add('container', 'world:barrels', x, y, 2, 1, true, { loot: 'cart', items: null, label: 'Chargement abandonné' });
    carts++;
  }
  let caches = 0;
  for (let k = 0; k < 2000 && caches < 10; k++) {
    const x = r.int(6, w.w - 7);
    const y = r.int(52, w.h - 6);
    if (w.zoneAt(x, y) !== 'forest' || dist({ x, y }, s) < 16) continue;
    if (!b.free(x, y, 1, 1, false, 1)) continue;
    b.add('container', r.pick(['world:crate', 'world:barrel']), x, y, 1, 1, true, { loot: 'cache', items: null, label: 'Petite cache' });
    caches++;
  }

  // --- Filons (garantis) ---
  const cluster = (center: P, type: 'ore_iron' | 'ore_coal', n: number) => {
    let placed = 0;
    for (let k = 0; k < 300 && placed < n; k++) {
      const x = center.x + r.int(-4, 4);
      const y = center.y + r.int(-4, 4);
      if (b.free(x, y, 1, 1, false, 1)) {
        const sprite = type === 'ore_iron' ? r.pick(['world:ore_iron', 'world:ore_iron_b']) : 'world:ore_coal';
        b.add(type, sprite, x, y, 1, 1, true, { hp: 6, maxHp: 6 });
        placed++;
      }
    }
    for (let k = 0; k < 4; k++) {
      const x = center.x + r.int(-5, 5);
      const y = center.y + r.int(-5, 5);
      if (b.free(x, y, 2, 1, false, 1)) b.add('rock', 'world:rock_big', x, y, 2, 1, true, { hp: 8, maxHp: 8 });
    }
  };
  cluster({ x: 116, y: 108 }, 'ore_iron', 6);
  cluster({ x: 54, y: 114 }, 'ore_iron', 5);
  cluster({ x: 112, y: 62 }, 'ore_iron', 6);
  cluster({ x: 100, y: 128 }, 'ore_coal', 4);
  cluster({ x: 58, y: 66 }, 'ore_coal', 4);
  cluster({ x: 44, y: 100 }, 'ore_coal', 3);

  // --- Remplissage végétal ---
  const order: number[] = [];
  for (let i = 0; i < w.w * w.h; i++) order.push(i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const i of order) {
    const x = i % w.w;
    const y = (i - x) / w.w;
    if (x < 1 || y < 1 || x >= w.w - 1 || y >= w.h - 1) continue;
    const z = w.zoneAt(x, y);
    const p = { x, y };
    if (w.road[i] || w.reserved[i] || w.objAt[i] >= 0) continue;
    const dStart = dist(p, s);
    if (dStart < 5) continue;
    let treeP = 0.16;
    if (z === 'start') treeP = dStart > 9 ? 0.05 : 0;
    if (z === 'hamlet') treeP = 0.03;
    if (z === 'cemetery') treeP = 0.05;
    if (z === 'corrupt') treeP = 0.12;
    if (z === 'sanctuary') treeP = 0.02;
    const roll = r.next();
    // bordure dense aux frontières de la carte
    if (x < 3 || y < 3 || x > w.w - 4 || y > w.h - 4) treeP = 0.6;
    if (roll < treeP) {
      if (b.free(x, y, 1, 1, false, 1)) b.add('tree', treeSprite(r, z), x, y, 1, 1, true, { hp: 6, maxHp: 6, occluder: true });
      continue;
    }
    const r2 = r.next();
    if (z === 'forest' || z === 'start') {
      if (r2 < 0.012 && b.free(x, y, 1, 1, false, 1)) b.add('bush', 'world:bush_berry', x, y, 1, 1, true, { hp: 1, maxHp: 1 });
      else if (r2 < 0.035) b.add('grass', r.pick(['world:grass_tall', 'world:grass_tall_b']), x, y, 1, 1, false, { hp: 1, maxHp: 1 });
      else if (r2 < 0.043) b.add('morel', 'world:morel', x, y, 1, 1, false, { hp: 1, maxHp: 1 });
      else if (r2 < 0.052 && b.free(x, y, 1, 1, false, 1)) b.add('rock', 'world:rock_small', x, y, 1, 1, true, { hp: 5, maxHp: 5 });
      else if (r2 < 0.057 && b.free(x, y, 2, 1, false, 1)) b.add('rock', 'world:rock_big', x, y, 2, 1, true, { hp: 8, maxHp: 8 });
      else if (r2 < 0.066) b.add('rock', 'world:rock_pebble', x, y, 1, 1, false, { hp: 1, maxHp: 1 });
      else if (r2 < 0.085) b.add('decor', r.pick(['world:bush_fern', 'world:grass_short', 'world:flower_a', 'world:flower_b', 'world:flower_c']), x, y, 1, 1, false);
      else if (r2 < 0.09 && b.free(x, y, 1, 1, false, 1)) b.add('decor', r.pick(['world:bush_round', 'world:bush_leafy', 'world:bush_cypress']), x, y, 1, 1, true);
    } else if (z === 'corrupt' || z === 'cemetery' || z === 'sanctuary') {
      if (r2 < 0.012 && b.free(x, y, 2, 1, false, 1)) b.add('rock', 'world:rock_dark_big', x, y, 2, 1, true, { hp: 8, maxHp: 8 });
      else if (r2 < 0.024 && b.free(x, y, 1, 1, false, 1)) b.add('rock', 'world:rock_dark_small', x, y, 1, 1, true, { hp: 5, maxHp: 5 });
      else if (r2 < 0.036) b.add('grass', 'world:grass_tall_b', x, y, 1, 1, false, { hp: 1, maxHp: 1 });
      else if (r2 < 0.042) b.add('decor', r.pick(['world:skull', 'world:bones', 'world:mushroom_red']), x, y, 1, 1, false);
    } else if (z === 'hamlet') {
      if (r2 < 0.03) b.add('grass', 'world:grass_tall', x, y, 1, 1, false, { hp: 1, maxHp: 1 });
      else if (r2 < 0.045) b.add('decor', r.pick(['world:grass_short', 'world:flower_a', 'world:flower_c']), x, y, 1, 1, false);
    }
  }

  const report = validate(w, true);
  // points de repère (carte)
  w.landmarks = [
    { id: 'start', name: 'Camp abandonné', x: s.x, y: s.y, icon: 'world:campfire_1', discovered: true },
    { id: 'hamlet', name: 'Ruines du hameau', x: h.x, y: h.y, icon: 'items:i_frag_1', discovered: false },
    { id: 'cemetery', name: 'Cimetière', x: c.x, y: c.y, icon: 'items:i_frag_2', discovered: false },
    { id: 'stones', name: 'Pierres noires', x: st.x, y: st.y, icon: 'items:i_frag_3', discovered: false },
    { id: 'sanctuary', name: 'Sanctuaire du Loup', x: sa.x + 1, y: sa.y + 1, icon: 'world:seal_stone', discovered: false },
  ];
  return { world: w, report };
}

/** Parcours en largeur depuis le départ (obstacles statiques uniquement). */
export function reachability(w: World): Uint8Array {
  const seen = new Uint8Array(w.w * w.h);
  const q = new Int32Array(w.w * w.h);
  let qh = 0;
  let qt = 0;
  const si = w.idx(w.start.x, w.start.y);
  seen[si] = 1;
  q[qt++] = si;
  while (qh < qt) {
    const i = q[qh++];
    const x = i % w.w;
    const y = (i - x) / w.w;
    const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    for (const [nx, ny] of nb) {
      if (!w.inBounds(nx, ny)) continue;
      const j = w.idx(nx, ny);
      if (seen[j] || w.staticSolid(nx, ny)) continue;
      seen[j] = 1;
      q[qt++] = j;
    }
  }
  return seen;
}

function objReachable(w: World, seen: Uint8Array, o: WObj): boolean {
  for (let y = o.fy - 1; y <= o.fy + o.fh; y++)
    for (let x = o.fx - 1; x <= o.fx + o.fw; x++) {
      if (!w.inBounds(x, y)) continue;
      const inside = x >= o.fx && x < o.fx + o.fw && y >= o.fy && y < o.fy + o.fh;
      if (inside && o.solid) continue;
      if (seen[w.idx(x, y)]) return true;
    }
  return false;
}

/** Retire les obstacles non essentiels sur une ligne pour relier une cible. */
function carve(w: World, o: WObj): void {
  const tx = o.fx + Math.floor(o.fw / 2);
  const ty = o.fy + o.fh; // devant l'objet
  const steps = Math.ceil(Math.hypot(w.start.x - tx, w.start.y - ty));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(tx + ((w.start.x - tx) * i) / steps);
    const y = Math.round(ty + ((w.start.y - ty) * i) / steps);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
      const ob = w.objectAtTile(x + dx, y + dy);
      if (ob && ob !== o && ob.solid && ['tree', 'rock', 'decor', 'bush'].includes(ob.type)) {
        ob.removed = true;
        w.unstampObject(ob);
      }
    }
  }
}

export function validate(w: World, repair: boolean): GenReport {
  const required = () => w.objects.filter((o) => !o.removed && ['altar', 'sanctuary', 'container', 'note', 'house', 'ore_iron', 'ore_coal'].includes(o.type));
  let carved = 0;
  let seen = reachability(w);
  for (let pass = 0; pass < 30; pass++) {
    const bad = required().filter((o) => !objReachable(w, seen, o));
    if (!bad.length || !repair) break;
    for (const o of bad) {
      carve(w, o);
      carved++;
    }
    seen = reachability(w);
  }
  const unreachable = required().filter((o) => !objReachable(w, seen, o)).map((o) => `${o.type}@${o.fx},${o.fy}`);
  const ironReachable = w.objects.filter((o) => !o.removed && o.type === 'ore_iron' && objReachable(w, seen, o)).length;
  const coalReachable = w.objects.filter((o) => !o.removed && o.type === 'ore_coal' && objReachable(w, seen, o)).length;
  return { ok: unreachable.length === 0 && ironReachable >= 8 && coalReachable >= 4, carved, unreachable, ironReachable, coalReachable };
}

/**
 * Point d'entrée : génère le monde ; en cas d'échec de validation malgré les
 * corridors de secours, on essaie des graines dérivées (repli déterministe).
 */
export function createWorld(seed: number): { world: World; report: GenReport; usedSeed: number } {
  let last: { world: World; report: GenReport } | null = null;
  for (let k = 0; k < 6; k++) {
    const s = (seed + k * 7919) >>> 0;
    last = generateWorld(s);
    if (last.report.ok) return { ...last, usedSeed: s };
  }
  return { ...last!, usedSeed: last!.world.seed };
}
