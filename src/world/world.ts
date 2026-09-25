import { TILE } from '../config/balance';
import { BUILDING_BY_ID } from '../data/buildings';
import type { Slots } from '../sim/inventory';

export type Zone = 'start' | 'forest' | 'hamlet' | 'cemetery' | 'corrupt' | 'sanctuary';
export const ZONES: Zone[] = ['start', 'forest', 'hamlet', 'cemetery', 'corrupt', 'sanctuary'];
export const ZONE_NAMES: Record<Zone, string> = {
  start: 'Clairière du camp',
  forest: 'Forêt et vieux chemins',
  hamlet: 'Ruines du hameau',
  cemetery: 'Cimetière',
  corrupt: 'Bois corrompus',
  sanctuary: 'Sanctuaire du Loup',
};

export type ObjType =
  | 'tree' | 'rock' | 'ore_iron' | 'ore_coal' | 'bush' | 'grass' | 'morel'
  | 'decor' | 'container' | 'note' | 'altar' | 'sanctuary' | 'house';

export interface WObj {
  id: number;
  type: ObjType;
  fx: number; // empreinte (tuiles)
  fy: number;
  fw: number;
  fh: number;
  sprite: string; // "atlas:frame"
  solid: boolean;
  zone: Zone;
  hp?: number;
  maxHp?: number;
  depleted?: boolean;
  regrowAt?: number;
  loot?: string;
  guaranteed?: string;
  items?: Slots | null; // null = pas encore ouvert
  opened?: boolean;
  noteId?: string;
  frag?: string;
  taken?: boolean;
  label?: string;
  removed?: boolean; // retiré pendant la génération (corridor de secours)
  occluder?: boolean; // peut masquer le joueur (arbres, maisons)
}

export interface Building {
  id: number;
  type: string;
  x: number; // tuile en haut à gauche
  y: number;
  hp: number;
  items?: Slots;
  meat?: number;
  trapTimer?: number;
}

export interface Bag {
  id: number;
  x: number; // px
  y: number;
  items: Slots;
  kind: 'death' | 'chest' | 'drop';
}

export interface Landmark {
  id: string;
  name: string;
  x: number; // tuile
  y: number;
  icon: string;
  discovered: boolean;
}

export const FOG_CELL = 4; // tuiles par cellule de brouillard

export class World {
  readonly w: number;
  readonly h: number;
  seed: number;
  ground: Uint8Array; // sommets (w+1)*(h+1) : 1 = herbe, 0 = terre
  palette: Uint8Array; // par tuile : 0 été, 1 automne
  zone: Uint8Array; // index dans ZONES
  road: Uint8Array;
  reserved: Uint8Array; // zones critiques (pas de construction)
  objects: WObj[] = [];
  objAt: Int32Array; // objet occupant la tuile (empreinte), -1 sinon
  buildings = new Map<number, Building>();
  buildingAt: Int32Array;
  nextBuildingId = 1;
  bags = new Map<number, Bag>();
  nextBagId = 1;
  fog: Uint8Array;
  landmarks: Landmark[] = [];
  start = { x: 0, y: 0 };
  sanctuaryId = -1;
  outsideDirty = true;
  private outside: Uint8Array | null = null;
  buildVersion = 0; // incrémenté à chaque pose/retrait (invalide les chemins)

  constructor(w: number, h: number, seed: number) {
    this.w = w;
    this.h = h;
    this.seed = seed;
    this.ground = new Uint8Array((w + 1) * (h + 1)).fill(1);
    this.palette = new Uint8Array(w * h);
    this.zone = new Uint8Array(w * h);
    this.road = new Uint8Array(w * h);
    this.reserved = new Uint8Array(w * h);
    this.objAt = new Int32Array(w * h).fill(-1);
    this.buildingAt = new Int32Array(w * h).fill(-1);
    this.fog = new Uint8Array(Math.ceil(w / FOG_CELL) * Math.ceil(h / FOG_CELL));
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  idx(tx: number, ty: number): number {
    return ty * this.w + tx;
  }

  zoneAt(tx: number, ty: number): Zone {
    if (!this.inBounds(tx, ty)) return 'forest';
    return ZONES[this.zone[this.idx(tx, ty)]];
  }

  vertex(vx: number, vy: number): number {
    return this.ground[vy * (this.w + 1) + vx];
  }

  isGrassTile(tx: number, ty: number): boolean {
    return (
      this.vertex(tx, ty) === 1 && this.vertex(tx + 1, ty) === 1 &&
      this.vertex(tx, ty + 1) === 1 && this.vertex(tx + 1, ty + 1) === 1
    );
  }

  objectAtTile(tx: number, ty: number): WObj | null {
    if (!this.inBounds(tx, ty)) return null;
    const id = this.objAt[this.idx(tx, ty)];
    return id >= 0 ? this.objects[id] : null;
  }

  buildingAtTile(tx: number, ty: number): Building | null {
    if (!this.inBounds(tx, ty)) return null;
    const id = this.buildingAt[this.idx(tx, ty)];
    return id >= 0 ? this.buildings.get(id) ?? null : null;
  }

  /** Obstacle statique (arbre, rocher, maison…). */
  staticSolid(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    const o = this.objectAtTile(tx, ty);
    return !!o && o.solid && !o.removed;
  }

  passableForPlayer(tx: number, ty: number): boolean {
    if (this.staticSolid(tx, ty)) return false;
    const b = this.buildingAtTile(tx, ty);
    if (!b) return true;
    const d = BUILDING_BY_ID[b.type];
    return !d.blocks || !!d.playerPasses;
  }

  passableForEnemy(tx: number, ty: number): boolean {
    if (this.staticSolid(tx, ty)) return false;
    const b = this.buildingAtTile(tx, ty);
    return !b || !BUILDING_BY_ID[b.type].blocks;
  }

  registerObject(o: WObj): void {
    o.id = this.objects.length;
    this.objects.push(o);
    this.stampObject(o);
  }

  stampObject(o: WObj): void {
    for (let y = o.fy; y < o.fy + o.fh; y++)
      for (let x = o.fx; x < o.fx + o.fw; x++)
        if (this.inBounds(x, y)) this.objAt[this.idx(x, y)] = o.removed ? -1 : o.id;
  }

  unstampObject(o: WObj): void {
    for (let y = o.fy; y < o.fy + o.fh; y++)
      for (let x = o.fx; x < o.fx + o.fw; x++)
        if (this.inBounds(x, y) && this.objAt[this.idx(x, y)] === o.id) this.objAt[this.idx(x, y)] = -1;
  }

  addBuilding(type: string, x: number, y: number, hp?: number, id?: number): Building {
    const d = BUILDING_BY_ID[type];
    const b: Building = { id: id ?? this.nextBuildingId++, type, x, y, hp: hp ?? d.hp };
    if (id !== undefined) this.nextBuildingId = Math.max(this.nextBuildingId, id + 1);
    if (d.storage) b.items = Array.from({ length: d.storage }, () => null);
    if (type === 'trap') {
      b.meat = 0;
      b.trapTimer = 0;
    }
    this.buildings.set(b.id, b);
    for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) this.buildingAt[this.idx(xx, yy)] = b.id;
    this.outsideDirty = true;
    this.buildVersion++;
    return b;
  }

  removeBuilding(id: number): Building | null {
    const b = this.buildings.get(id);
    if (!b) return null;
    const d = BUILDING_BY_ID[b.type];
    for (let yy = b.y; yy < b.y + d.h; yy++)
      for (let xx = b.x; xx < b.x + d.w; xx++)
        if (this.buildingAt[this.idx(xx, yy)] === id) this.buildingAt[this.idx(xx, yy)] = -1;
    this.buildings.delete(id);
    this.outsideDirty = true;
    this.buildVersion++;
    return b;
  }

  buildingCenter(b: Building): { x: number; y: number } {
    const d = BUILDING_BY_ID[b.type];
    return { x: (b.x + d.w / 2) * TILE, y: (b.y + d.h / 2) * TILE };
  }

  addBag(x: number, y: number, items: Slots, kind: Bag['kind']): Bag {
    const bag: Bag = { id: this.nextBagId++, x, y, items, kind };
    this.bags.set(bag.id, bag);
    return bag;
  }

  /** Tuiles reliées au bord de la carte sans traverser d'obstacle ni de construction bloquante. */
  outsideMask(): Uint8Array {
    if (this.outside && !this.outsideDirty) return this.outside;
    const out = new Uint8Array(this.w * this.h);
    const q = new Int32Array(this.w * this.h);
    let qh = 0;
    let qt = 0;
    const push = (x: number, y: number) => {
      const i = this.idx(x, y);
      if (out[i] || !this.passableForEnemy(x, y)) return;
      out[i] = 1;
      q[qt++] = i;
    };
    for (let x = 0; x < this.w; x++) {
      push(x, 0);
      push(x, this.h - 1);
    }
    for (let y = 0; y < this.h; y++) {
      push(0, y);
      push(this.w - 1, y);
    }
    while (qh < qt) {
      const i = q[qh++];
      const x = i % this.w;
      const y = (i - x) / this.w;
      if (x > 0) push(x - 1, y);
      if (x < this.w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < this.h - 1) push(x, y + 1);
    }
    this.outside = out;
    this.outsideDirty = false;
    return out;
  }

  discover(px: number, py: number, radiusTiles: number): boolean {
    const cw = Math.ceil(this.w / FOG_CELL);
    const ch = Math.ceil(this.h / FOG_CELL);
    const cx = px / TILE / FOG_CELL;
    const cy = py / TILE / FOG_CELL;
    const r = radiusTiles / FOG_CELL;
    let changed = false;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(ch - 1, Math.floor(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(cw - 1, Math.floor(cx + r)); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r && !this.fog[y * cw + x]) {
          this.fog[y * cw + x] = 1;
          changed = true;
        }
      }
    }
    return changed;
  }

  exploredRatio(): number {
    let n = 0;
    for (let i = 0; i < this.fog.length; i++) n += this.fog[i];
    return n / this.fog.length;
  }
}
