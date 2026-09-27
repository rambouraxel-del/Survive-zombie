// Construction d'une carte jouable à partir de sa définition ASCII (déterministe : même
// définition, même monde ; les objets persistants ont des clés stables).
import type { EnemyType } from '../data/enemies';
import type { MapDef, Marker } from '../maps/types';
import { World, type ObjType, type WObj } from './world';

export interface SpawnPoint {
  key: string;
  x: number; // tuile
  y: number;
  group: EnemyType[];
  slot?: string;
  asleep?: boolean;
}

export interface BossPoint {
  key: string;
  x: number;
  y: number;
  type: EnemyType;
}

export interface BuildResult {
  world: World;
  spawns: SpawnPoint[];
  bosses: BossPoint[];
  /** constructions initiales (camp et maison d'une nouvelle partie) */
  buildings: { type: string; x: number; y: number }[];
}

export type Variant = 'main' | 'dungeon';

const GRASSY = new Set(['.', 'T', 't', '*', '"', 'b', 'm', 'h', 'k', 'g', 'f', 'j', 'r', 'R', 'o', 'c', 'x', 'p', 's', 'w']);

function hash(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function pick<T>(arr: readonly T[], x: number, y: number, s = 0): T {
  return arr[hash(x, y, s) % arr.length];
}

export function mapSize(def: MapDef): { w: number; h: number } {
  return { w: def.rows[0].length, h: def.rows.length };
}

export function buildWorld(def: MapDef, variant: Variant = 'main', seed = 1): BuildResult {
  const { w, h } = mapSize(def);
  for (const r of def.rows) if (r.length !== w) throw new Error(`Carte ${def.id} : lignes de longueurs différentes`);
  const world = new World(def, w, h, seed);
  const spawns: SpawnPoint[] = [];
  const bosses: BossPoint[] = [];
  const buildings: BuildResult['buildings'] = [];
  const grassBase = def.base === '.';
  const dark = def.palette === 'autumn';

  // ------------------------------------------------ terrain
  const grass = new Uint8Array(w * h); // 1 = tuile d'herbe
  const markerAt = (ch: string): (Marker & { ground?: string }) | undefined => def.legend[ch] as (Marker & { ground?: string }) | undefined;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let ch = def.rows[y][x];
      const i = world.idx(x, y);
      world.palette[i] = def.palette === 'autumn' ? 1 : 0;
      const mk = markerAt(ch);
      if (mk) ch = mk.ground ?? def.base;
      switch (ch) {
        case '~':
          world.water[i] = 1;
          grass[i] = grassBase ? 1 : 0;
          break;
        case '=':
          world.water[i] = 1;
          world.bridge[i] = 1;
          grass[i] = grassBase ? 1 : 0;
          break;
        case '#':
          world.wall[i] = 1;
          grass[i] = grassBase ? 1 : 0;
          break;
        case '%':
          world.wall[i] = 2;
          grass[i] = 0;
          break;
        case ':':
          world.floor[i] = 1;
          break;
        case '_':
          world.floor[i] = 2;
          break;
        case ',':
          break;
        default:
          grass[i] = GRASSY.has(ch) && grassBase ? 1 : 0;
      }
    }
  // sommets : herbe seulement si les quatre tuiles voisines sont en herbe (la terre l'emporte)
  for (let vy = 0; vy <= h; vy++)
    for (let vx = 0; vx <= w; vx++) {
      let g = 1;
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const tx = Math.min(w - 1, Math.max(0, vx + dx));
        const ty = Math.min(h - 1, Math.max(0, vy + dy));
        if (!grass[world.idx(tx, ty)]) g = 0;
      }
      world.ground[vy * (w + 1) + vx] = g;
    }
  fixDiagonals(world);

  // zones nommées (les petites zones sont déclarées après les grandes)
  def.areas.forEach((a, ai) => {
    for (let y = a.y; y < a.y + a.h; y++)
      for (let x = a.x; x < a.x + a.w; x++)
        if (world.inBounds(x, y)) {
          world.area[world.idx(x, y)] = ai + 1;
          if (a.cave) world.cave[world.idx(x, y)] = 1;
        }
    if (a.landmark) world.landmarks.push({ id: `${def.id}:${ai}`, name: a.name, x: a.x + Math.floor(a.w / 2), y: a.y + Math.floor(a.h / 2), icon: 'items:i_map', discovered: false });
  });

  // ------------------------------------------------ objets
  const add = (type: ObjType, sprite: string, x: number, y: number, fw: number, fh: number, solid: boolean, extra: Partial<WObj> = {}): WObj => {
    const o: WObj = { id: -1, key: extra.key ?? `${x},${y}`, type, sprite, fx: x, fy: y, fw, fh, solid, ...extra };
    world.registerObject(o);
    return o;
  };
  const reserve = (x0: number, y0: number, ww: number, hh: number) => {
    for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + ww; x++) if (world.inBounds(x, y)) world.reserved[world.idx(x, y)] = 1;
  };
  const rockSmall = def.id === 'carriere' ? 'props:rock_small_s' : dark ? 'world:rock_dark_small' : 'world:rock_small';
  const rockBig = def.id === 'carriere' ? 'props:boulder_flat_s' : dark ? 'world:rock_dark_big' : 'world:rock_big';

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = def.rows[y][x];
      switch (ch) {
        case 'T':
          if (def.trees.length) add('tree', pick(def.trees, x, y), x, y, 1, 1, true, { hp: 6, maxHp: 6, occluder: true });
          break;
        case 't':
          add('tree', pick(def.deadTrees.length ? def.deadTrees : ['world:tree_dead'], x, y, 1), x, y, 1, 1, true, { hp: 4, maxHp: 4, occluder: true, label: 'dead' });
          break;
        case '*':
          add('decor', pick(['world:bush_round', 'world:bush_leafy', 'world:bush_cypress'], x, y), x, y, 1, 1, true);
          break;
        case '"':
          add('grass', pick(['world:grass_tall', 'world:grass_tall_b'], x, y), x, y, 1, 1, false, { hp: 1, maxHp: 1 });
          break;
        case 'b':
          add('bush', 'world:bush_berry', x, y, 1, 1, true, { hp: 1, maxHp: 1 });
          break;
        case 'm':
          add('morel', 'world:morel', x, y, 1, 1, false, { hp: 1, maxHp: 1 });
          break;
        case 'h':
          add('herb', 'world:bush_fern', x, y, 1, 1, false, { hp: 1, maxHp: 1 });
          break;
        case 'k':
          add('blackmoss', 'props:puddle_green', x, y, 1, 1, false, { hp: 1, maxHp: 1, flat: true });
          break;
        case 'g':
          add('glowcap', 'props:glowcap_node', x, y, 1, 1, false, { hp: 1, maxHp: 1, light: 40 });
          break;
        case 'r':
          add('rock', rockSmall, x, y, 1, 1, true, { hp: 5, maxHp: 5 });
          break;
        case 'R':
          if (isRockStart(def.rows[y], x) && def.rows[y][x + 1] === 'R') add('rock', rockBig, x, y, 2, 1, true, { hp: 8, maxHp: 8, label: 'big' });
          else if (isRockStart(def.rows[y], x)) add('rock', rockSmall, x, y, 1, 1, true, { hp: 5, maxHp: 5 });
          break;
        case 'o':
          add('ore_iron', pick(['world:ore_iron', 'world:ore_iron_b'], x, y), x, y, 1, 1, true, { hp: 6, maxHp: 6 });
          break;
        case 'c':
          add('ore_coal', 'world:ore_coal', x, y, 1, 1, true, { hp: 6, maxHp: 6 });
          break;
        case 'x':
          add('crystal', 'props:ore_crystal', x, y, 1, 1, true, { hp: 8, maxHp: 8, light: 50 });
          break;
        case 'f':
          add('decor', pick(['world:flower_a', 'world:flower_b', 'world:flower_c', 'world:grass_short'], x, y), x, y, 1, 1, false, { flat: true });
          break;
        case 'p':
          add('decor', 'world:rock_pebble', x, y, 1, 1, false, { flat: true });
          break;
        case 's':
          add('decor', pick(['world:skull', 'world:bones'], x, y), x, y, 1, 1, false, { flat: true });
          break;
        case 'j':
          add('decor', world.water[world.idx(x, y)] ? 'props:reeds_water' : 'props:reeds', x, y, 1, 1, false);
          break;
        case 'w':
          add('decor', 'props:cobweb', x, y, 1, 1, false, { flat: true });
          break;
        default: {
          const mk = def.legend[ch];
          if (!mk) break;
          if (mk.only && mk.only !== variant) break;
          placeMarker(mk, x, y);
        }
      }
    }

  function placeMarker(mk: Marker, x: number, y: number): void {
    switch (mk.kind) {
      case 'start':
        world.start = { x, y };
        break;
      case 'exit':
        add('exit', 'items:signpost', x, y, 1, 1, true, { key: `exit:${x},${y}`, label: mk.name ?? 'Poteau du retour' });
        reserve(x - 1, y - 1, 3, 3);
        break;
      case 'checkpoint':
        add('checkpoint', mk.votive ? 'world:lamp_off' : 'world:campfire_off', x, y, 1, 1, true, { key: mk.id, label: mk.name, votive: !!mk.votive });
        break;
      case 'chest':
        add('container', mk.sprite ?? 'world:chest_closed', x, y, 1, 1, true, { key: mk.id, loot: mk.loot, renew: !!mk.renew, items: null, label: mk.name ?? 'Coffre' });
        break;
      case 'note':
        add('note', 'world:paper', x, y, 1, 1, false, { key: mk.id, noteId: mk.id, flat: true });
        break;
      case 'spawn':
        spawns.push({ key: `${def.id}:${x},${y}`, x, y, group: mk.group, slot: mk.slot, asleep: mk.asleep });
        break;
      case 'boss':
        bosses.push({ key: mk.id, x, y, type: mk.type });
        break;
      case 'prop':
        add('prop', mk.sprite, x, y, mk.w, mk.h, !!mk.solid, { key: `prop:${x},${y}`, occluder: mk.occluder, light: mk.light, label: mk.name, flat: mk.flat });
        break;
      case 'gate':
        add('gate', mk.sprite, x, y, mk.w, mk.h, true, { key: `${mk.id}#${x},${y}`, target: mk.id, label: mk.name, openedBy: mk.openedBy, open: variant === 'dungeon' && !!mk.dungeonOpen });
        break;
      case 'lever':
        add('lever', 'props:chains', x, y, 1, 1, true, { key: mk.id, target: mk.opens, label: mk.name });
        break;
      case 'barricade':
        add('barricade', 'world:crate_stack', x, y, 1, 1, true, { key: mk.id, hp: 30, maxHp: 30, label: 'Barricade' });
        break;
      case 'shortcut': {
        const cells: { x: number; y: number }[] = [];
        for (let yy = y + mk.cells.dy; yy < y + mk.cells.dy + mk.cells.h; yy++)
          for (let xx = x + mk.cells.dx; xx < x + mk.cells.dx + mk.cells.w; xx++) cells.push({ x: xx, y: yy });
        add('shortcut', mk.sprite, x, y, 1, 1, false, { key: mk.id, label: mk.name, side: mk.from, cells, open: false });
        break;
      }
      case 'house':
        add('house', 'world:house_a', x, y, 7, 3, true, { key: 'house', occluder: true, label: 'Votre maison' });
        reserve(x - 1, y - 3, 9, 7);
        break;
      case 'door':
        add('door', '', x, y, 1, 1, false, { key: `door:${x},${y}`, destination: mk.to, label: mk.to === 'house' ? 'Maison' : 'Porte' });
        reserve(x - 1, y - 1, 3, 3);
        break;
      case 'travel':
        add('travel', 'items:signpost', x, y, 1, 1, true, { key: 'travel', label: 'Carrefour des expéditions' });
        reserve(x - 1, y - 1, 3, 3);
        break;
      case 'rack':
        add('rack', 'props:weapon_rack', x, y, 1, 1, true, { key: 'rack', label: 'Râtelier d’armes' });
        reserve(x - 1, y - 1, 3, 3);
        break;
      case 'reserved':
        add('reserved', 'world:hay_pile', x, y, 1, 1, false, { key: `reserved:${x},${y}`, label: mk.name, flat: true });
        reserve(x - 1, y - 1, 3, 3);
        break;
      case 'lodge':
        add('lodge', mk.sprite, x, y, mk.w, mk.h, true, { key: `lodge:${x},${y}`, occluder: true, label: mk.name });
        break;
      case 'building':
        buildings.push({ type: mk.type, x, y });
        break;
      case 'mound':
        break;
    }
  }

  return { world, spawns, bosses, buildings };
}

/** Un « RR » commence à cette position (gros rochers consécutifs appariés de gauche à droite). */
function isRockStart(row: string, x: number): boolean {
  let n = 0;
  for (let i = x; i >= 0 && row[i] === 'R'; i--) n++;
  return n % 2 === 1;
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
