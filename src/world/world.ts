// Monde d'une carte (camp, maison, région ou donjon) : terrain, obstacles, objets, constructions.
import { TILE } from '../config/balance';
import { BUILDING_BY_ID } from '../data/buildings';
import type { Slots } from '../sim/inventory';
import type { AreaDef, MapDef } from '../maps/types';

export type ObjType =
  | 'tree' | 'rock' | 'ore_iron' | 'ore_coal' | 'crystal' | 'bush' | 'grass' | 'morel' | 'herb' | 'blackmoss' | 'glowcap'
  | 'decor' | 'prop' | 'container' | 'note' | 'checkpoint' | 'exit' | 'gate' | 'lever' | 'barricade' | 'shortcut'
  | 'house' | 'door' | 'travel' | 'rack' | 'reserved' | 'lodge' | 'mound';

export const HARVEST_TYPES: ObjType[] = ['tree', 'rock', 'ore_iron', 'ore_coal', 'crystal', 'bush', 'grass', 'morel', 'herb', 'blackmoss', 'glowcap'];

export interface WObj {
  id: number;
  /** identifiant stable (coffres, leviers, portes, points de halte…) ; les ressources : « x,y » */
  key: string;
  type: ObjType;
  fx: number; // empreinte (tuiles)
  fy: number;
  fw: number;
  fh: number;
  sprite: string; // "atlas:frame"
  solid: boolean;
  hp?: number;
  maxHp?: number;
  depleted?: boolean;
  loot?: string;
  renew?: boolean; // coffre renouvelé à chaque sortie
  items?: Slots | null; // null = pas encore ouvert
  opened?: boolean;
  noteId?: string;
  label?: string;
  occluder?: boolean;
  flat?: boolean;
  light?: number;
  /** porte, herse, raccourci : ouvert */
  open?: boolean;
  /** levier : identifiant de la porte actionnée ; raccourci : côté d'où on l'active */
  target?: string;
  side?: 'north' | 'south' | 'east' | 'west';
  /** raccourci : cases d'eau ou de mur rendues praticables à l'ouverture */
  cells?: { x: number; y: number }[];
  votive?: boolean;
  /** porte ouverte par la mort du boss / de l'intérieur */
  openedBy?: 'lever' | 'boss' | 'inside';
  destination?: string;
}

export interface Building {
  id: number;
  type: string;
  x: number; // tuile en haut à gauche
  y: number;
  level?: number; // 2 = amélioré
  items?: Slots;
  meat?: number;
  trapTimer?: number;
}

export interface Bag {
  id: number;
  x: number; // px
  y: number;
  items: Slots;
  kind: 'drop' | 'loot';
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
  readonly def: MapDef;
  seed: number;
  ground: Uint8Array; // sommets (w+1)*(h+1) : 1 = herbe, 0 = terre
  palette: Uint8Array; // par tuile : 0 été, 1 automne
  water: Uint8Array;
  bridge: Uint8Array;
  wall: Uint8Array; // 1 = mur avec face, 2 = dessus de mur seul
  floor: Uint8Array; // 0 aucun, 1 pavés, 2 plancher
  area: Uint8Array; // index de zone + 1
  cave: Uint8Array;
  reserved: Uint8Array; // pas de construction
  objects: WObj[] = [];
  objAt: Int32Array;
  byKey = new Map<string, WObj>();
  buildings = new Map<number, Building>();
  buildingAt: Int32Array;
  nextBuildingId = 1;
  bags = new Map<number, Bag>();
  nextBagId = 1;
  fog: Uint8Array;
  landmarks: Landmark[] = [];
  start = { x: 0, y: 0 };
  buildVersion = 0;
  /** incrémenté quand un obstacle change (portes, raccourcis) : invalide les chemins */
  version = 0;

  constructor(def: MapDef, w: number, h: number, seed: number) {
    this.def = def;
    this.w = w;
    this.h = h;
    this.seed = seed;
    this.ground = new Uint8Array((w + 1) * (h + 1)).fill(1);
    this.palette = new Uint8Array(w * h);
    this.water = new Uint8Array(w * h);
    this.bridge = new Uint8Array(w * h);
    this.wall = new Uint8Array(w * h);
    this.floor = new Uint8Array(w * h);
    this.area = new Uint8Array(w * h);
    this.cave = new Uint8Array(w * h);
    this.reserved = new Uint8Array(w * h);
    this.objAt = new Int32Array(w * h).fill(-1);
    this.buildingAt = new Int32Array(w * h).fill(-1);
    this.fog = new Uint8Array(Math.ceil(w / FOG_CELL) * Math.ceil(h / FOG_CELL));
  }

  get id(): string {
    return this.def.id;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  idx(tx: number, ty: number): number {
    return ty * this.w + tx;
  }

  areaAt(tx: number, ty: number): AreaDef | null {
    if (!this.inBounds(tx, ty)) return null;
    const a = this.area[this.idx(tx, ty)];
    return a ? this.def.areas[a - 1] : null;
  }

  isCave(tx: number, ty: number): boolean {
    return this.inBounds(tx, ty) && this.cave[this.idx(tx, ty)] === 1;
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

  /** Terrain infranchissable : mur, falaise, eau (hors pont). */
  terrainBlocked(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    const i = this.idx(tx, ty);
    if (this.wall[i]) return true;
    return this.water[i] === 1 && this.bridge[i] === 0;
  }

  /** Obstacle statique (terrain ou objet solide). */
  staticSolid(tx: number, ty: number): boolean {
    if (this.terrainBlocked(tx, ty)) return true;
    const o = this.objectAtTile(tx, ty);
    return !!o && o.solid;
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
    return !this.buildingAtTile(tx, ty);
  }

  /** Bloque la vue et les projectiles : murs, grands objets solides (pas l'eau). */
  blocksSight(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    const i = this.idx(tx, ty);
    if (this.wall[i]) return true;
    const o = this.objectAtTile(tx, ty);
    if (!o || !o.solid) return false;
    return o.type === 'tree' || o.type === 'house' || o.type === 'lodge' || o.type === 'gate' || o.type === 'rock' || o.type === 'barricade' || (o.type === 'prop' && o.fh >= 2) || o.type === 'shortcut';
  }

  registerObject(o: WObj): void {
    o.id = this.objects.length;
    this.objects.push(o);
    if (o.key) this.byKey.set(o.key, o);
    this.stampObject(o);
  }

  stampObject(o: WObj): void {
    for (let y = o.fy; y < o.fy + o.fh; y++)
      for (let x = o.fx; x < o.fx + o.fw; x++)
        if (this.inBounds(x, y)) this.objAt[this.idx(x, y)] = o.id;
  }

  unstampObject(o: WObj): void {
    for (let y = o.fy; y < o.fy + o.fh; y++)
      for (let x = o.fx; x < o.fx + o.fw; x++)
        if (this.inBounds(x, y) && this.objAt[this.idx(x, y)] === o.id) this.objAt[this.idx(x, y)] = -1;
  }

  addBuilding(type: string, x: number, y: number, id?: number): Building {
    const d = BUILDING_BY_ID[type];
    const b: Building = { id: id ?? this.nextBuildingId++, type, x, y };
    if (id !== undefined) this.nextBuildingId = Math.max(this.nextBuildingId, id + 1);
    if (d.storage) b.items = Array.from({ length: d.storage }, () => null);
    if (type === 'trap') {
      b.meat = 0;
      b.trapTimer = 0;
    }
    this.buildings.set(b.id, b);
    this.stampBuilding(b);
    return b;
  }

  stampBuilding(b: Building): void {
    const d = BUILDING_BY_ID[b.type];
    for (let yy = b.y; yy < b.y + d.h; yy++) for (let xx = b.x; xx < b.x + d.w; xx++) if (this.inBounds(xx, yy)) this.buildingAt[this.idx(xx, yy)] = b.id;
    this.buildVersion++;
  }

  unstampBuilding(b: Building): void {
    const d = BUILDING_BY_ID[b.type];
    for (let yy = b.y; yy < b.y + d.h; yy++)
      for (let xx = b.x; xx < b.x + d.w; xx++)
        if (this.inBounds(xx, yy) && this.buildingAt[this.idx(xx, yy)] === b.id) this.buildingAt[this.idx(xx, yy)] = -1;
    this.buildVersion++;
  }

  removeBuilding(id: number): Building | null {
    const b = this.buildings.get(id);
    if (!b) return null;
    this.unstampBuilding(b);
    this.buildings.delete(id);
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
