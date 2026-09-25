// A* sur grille (8 directions, sans couper les coins), avec budget de nœuds.
import type { World } from '../world/world';
import { BUILDING_BY_ID } from '../data/buildings';

export interface PathResult {
  path: { x: number; y: number }[];
  /** première construction bloquante rencontrée sur le chemin (à attaquer) */
  blockerId: number;
  complete: boolean;
}

class Heap {
  items: number[] = [];
  prio: number[] = [];
  push(v: number, p: number): void {
    const a = this.items;
    const pr = this.prio;
    a.push(v);
    pr.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (pr[par] <= pr[i]) break;
      [a[par], a[i]] = [a[i], a[par]];
      [pr[par], pr[i]] = [pr[i], pr[par]];
      i = par;
    }
  }
  pop(): number {
    const a = this.items;
    const pr = this.prio;
    const top = a[0];
    const lv = a.pop()!;
    const lp = pr.pop()!;
    if (a.length) {
      a[0] = lv;
      pr[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && pr[l] < pr[m]) m = l;
        if (r < a.length && pr[r] < pr[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        [pr[m], pr[i]] = [pr[i], pr[m]];
        i = m;
      }
    }
    return top;
  }
  get size(): number {
    return this.items.length;
  }
}

// Tampons réutilisés (évite les allocations à chaque recherche)
let gBuf: Float32Array | null = null;
let fromBuf: Int32Array | null = null;
let stampBuf: Uint32Array | null = null;
let stamp = 0;

/**
 * @param breakCost coût supplémentaire pour traverser une construction bloquante
 *                  (Infinity = contourner uniquement).
 */
export function findPath(
  w: World, sx: number, sy: number, tx: number, ty: number,
  opts: { breakCost: number; budget?: number },
): PathResult {
  const N = w.w * w.h;
  if (!gBuf || gBuf.length !== N) {
    gBuf = new Float32Array(N);
    fromBuf = new Int32Array(N);
    stampBuf = new Uint32Array(N);
  }
  const g = gBuf;
  const from = fromBuf!;
  const st = stampBuf!;
  stamp++;
  const budget = opts.budget ?? 2500;
  const start = w.idx(sx, sy);
  const goal = w.idx(tx, ty);
  const heap = new Heap();
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - tx);
    const dy = Math.abs(y - ty);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  const cost = (x: number, y: number): number => {
    if (!w.inBounds(x, y) || w.staticSolid(x, y)) return Infinity;
    const b = w.buildingAtTile(x, y);
    if (b && BUILDING_BY_ID[b.type].blocks) return opts.breakCost;
    return 0;
  };
  st[start] = stamp;
  g[start] = 0;
  from[start] = -1;
  heap.push(start, h(sx, sy));
  let best = start;
  let bestH = h(sx, sy);
  let expanded = 0;
  let found = false;
  while (heap.size && expanded < budget) {
    const cur = heap.pop();
    if (cur === goal) {
      found = true;
      break;
    }
    expanded++;
    const cx = cur % w.w;
    const cy = (cur - cx) / w.w;
    const hc = h(cx, cy);
    if (hc < bestH) {
      bestH = hc;
      best = cur;
    }
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        let c = cost(nx, ny);
        if (c === Infinity) continue;
        if (dx && dy) {
          // pas de coupe de coin
          if (cost(cx + dx, cy) !== 0 || cost(cx, cy + dy) !== 0) continue;
          c += Math.SQRT2;
        } else c += 1;
        const ni = ny * w.w + nx;
        const ng = g[cur] + c;
        if (st[ni] !== stamp || ng < g[ni]) {
          st[ni] = stamp;
          g[ni] = ng;
          from[ni] = cur;
          heap.push(ni, ng + h(nx, ny));
        }
      }
  }
  const end = found ? goal : best;
  const path: { x: number; y: number }[] = [];
  let blockerId = -1;
  for (let i = end; i !== -1 && i !== start; i = from[i]) {
    const x = i % w.w;
    const y = (i - x) / w.w;
    path.push({ x, y });
  }
  path.reverse();
  for (const p of path) {
    const b = w.buildingAtTile(p.x, p.y);
    if (b && BUILDING_BY_ID[b.type].blocks) {
      blockerId = b.id;
      break;
    }
  }
  return { path, blockerId, complete: found };
}
