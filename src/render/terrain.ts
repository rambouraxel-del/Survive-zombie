// Terrain : sol herbe/terre autotuilé par les coins (LPC Revised), sols posés (pavés, plancher),
// eau autotuilée (berges d'herbe ou de terre), murs et falaises rendus par colonnes (dessus,
// crête, face, pied), ponts. Les collisions correspondent aux tuiles dessinées.
import Phaser from 'phaser';
import { TILE } from '../config/balance';
import type { World } from '../world/world';

interface SetDef {
  key: string;
  cols: number;
  count: number;
}

const SETS: SetDef[] = [
  { key: 'terrain_summer', cols: 16, count: 416 },
  { key: 'terrain_autumn', cols: 16, count: 416 },
  { key: 'castlewalls', cols: 12, count: 180 },
  { key: 'cliff_summer', cols: 16, count: 224 },
  { key: 'dungeon', cols: 13, count: 104 },
  { key: 'castlefloors', cols: 10, count: 100 },
  { key: 'interior', cols: 16, count: 256 },
];
const FIRST: Record<string, number> = {};
{
  let gid = 1;
  for (const s of SETS) {
    FIRST[s.key] = gid;
    gid += s.count;
  }
}
const gidOf = (set: string, c: number, r: number) => FIRST[set] + r * SETS.find((s) => s.key === set)!.cols + c;

// masque des coins (TL=8, TR=4, BL=2, BR=1) -> [col, ligne] relatifs au bloc de transition
const EDGE: Record<number, [number, number]> = {
  1: [0, 0], 3: [1, 0], 2: [2, 0],
  5: [0, 1], 15: [1, 1], 10: [2, 1],
  4: [0, 2], 12: [1, 2], 8: [2, 2],
  14: [0, 3], 13: [1, 3], 11: [0, 4], 7: [1, 4],
};
const GRASS: [number, number][] = [[3, 1], [4, 1], [5, 1], [3, 2], [4, 2], [5, 2]];
const DIRT: [number, number][] = [[3, 3], [4, 3], [5, 3], [3, 4], [4, 4], [5, 4]];

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function groundTile(w: World, x: number, y: number): number {
  const m = (w.vertex(x, y) << 3) | (w.vertex(x + 1, y) << 2) | (w.vertex(x, y + 1) << 1) | w.vertex(x + 1, y + 1);
  let cr: [number, number];
  if (m === 15 || m === 6 || m === 9) {
    const h = hash(x, y) % 20;
    cr = h < 12 ? GRASS[4] : GRASS[h % 6];
  } else if (m === 0) cr = DIRT[hash(x, y) % 6];
  else cr = [6 + EDGE[m][0], EDGE[m][1]];
  const set = w.palette[w.idx(x, y)] ? 'terrain_autumn' : 'terrain_summer';
  return gidOf(set, cr[0], cr[1]);
}

/** Masque d'eau aux coins : un coin est « eau » si les quatre tuiles qui le touchent sont de l'eau. */
function waterTile(w: World, x: number, y: number): number {
  const wat = (tx: number, ty: number) => {
    const cx = Math.min(w.w - 1, Math.max(0, tx));
    const cy = Math.min(w.h - 1, Math.max(0, ty));
    return w.water[w.idx(cx, cy)] === 1;
  };
  const corner = (vx: number, vy: number) => (wat(vx - 1, vy - 1) && wat(vx, vy - 1) && wat(vx - 1, vy) && wat(vx, vy) ? 1 : 0);
  let m = (corner(x, y) << 3) | (corner(x + 1, y) << 2) | (corner(x, y + 1) << 1) | corner(x + 1, y + 1);
  if (m === 6 || m === 9 || m === 0) m = 15;
  // berge d'herbe (bloc 0,10) ou de terre (bloc 6,10)
  const grassy = w.def.base === '.';
  const [c0, r0] = grassy ? [0, 10] : [6, 10];
  const e = EDGE[m];
  const set = w.palette[w.idx(x, y)] ? 'terrain_autumn' : 'terrain_summer';
  return gidOf(set, c0 + e[0], r0 + e[1]);
}

function wallTiles(w: World, x: number, y0: number, y1: number): { y: number; gid: number }[] {
  const L = y1 - y0 + 1;
  const out: { y: number; gid: number }[] = [];
  const style = w.def.wall;
  const v = hash(x, y1);
  // colonne du bas vers le haut : pied, face, crête, puis dessus
  let stack: number[];
  if (style === 'castle') {
    const col = v % 5 === 0 ? 2 : 1;
    const faces = L === 1 ? [gidOf('castlewalls', col, 8)] : L === 2 ? [gidOf('castlewalls', col, 8), gidOf('castlewalls', col, 6)] : [gidOf('castlewalls', col, 8), gidOf('castlewalls', v % 11 === 0 ? 0 : col, 7), gidOf('castlewalls', col, 6)];
    stack = faces;
    for (let i = faces.length; i < L; i++) stack.push(gidOf('castlewalls', 2, 1));
  } else if (style === 'brick') {
    stack = L === 1 ? [gidOf('dungeon', 1, 2)] : L === 2 ? [gidOf('dungeon', 1, 2), gidOf('dungeon', 1, 0)] : [gidOf('dungeon', 1, 2), gidOf('dungeon', 1, 1), gidOf('dungeon', 1, 0)];
    for (let i = stack.length; i < L; i++) stack.push(-1);
  } else {
    const grassy = w.def.base === '.';
    const c = grassy ? 3 + (v % 3) : 2;
    stack = grassy ? [gidOf('cliff_summer', c, 12), gidOf('cliff_summer', c, 9)] : [gidOf('cliff_summer', 2, 4), gidOf('cliff_summer', 2, 3)];
    if (L === 1) stack = [stack[0]];
    for (let i = stack.length; i < L; i++) stack.push(gidOf('cliff_summer', 1, 1));
  }
  for (let i = 0; i < L; i++) out.push({ y: y1 - i, gid: stack[i] });
  return out;
}

export interface TerrainLayers {
  ground: Phaser.Tilemaps.TilemapLayer;
  overlay: Phaser.Tilemaps.TilemapLayer;
  walls: Phaser.Tilemaps.TilemapLayer;
  voidGfx: Phaser.GameObjects.Graphics;
  bridges: Phaser.GameObjects.Image[];
  map: Phaser.Tilemaps.Tilemap;
}

export function buildTerrain(scene: Phaser.Scene, w: World): TerrainLayers {
  const map = scene.make.tilemap({ width: w.w, height: w.h, tileWidth: TILE, tileHeight: TILE });
  const sets = SETS.map((s) => map.addTilesetImage(s.key, s.key, TILE, TILE, 0, 0, FIRST[s.key])!);
  const ground = map.createBlankLayer('ground', sets, 0, 0)!;
  const overlay = map.createBlankLayer('overlay', sets, 0, 0)!;
  const walls = map.createBlankLayer('walls', sets, 0, 0)!;
  ground.setDepth(-100000);
  overlay.setDepth(-99990);
  walls.setDepth(-99980);
  for (const l of [ground, overlay, walls]) l.setCullPadding(2, 2);
  const voidGfx = scene.add.graphics().setDepth(-99975);
  const tint = w.def.id === 'bastion' ? 0x9d9aa6 : w.def.id === 'carriere' ? 0xd8c8b0 : 0xffffff;
  for (let y = 0; y < w.h; y++)
    for (let x = 0; x < w.w; x++) {
      const i = w.idx(x, y);
      ground.putTileAt(groundTile(w, x, y), x, y, false);
      if (w.floor[i] === 1) overlay.putTileAt(gidOf('castlefloors', 5 + (hash(x, y) % 3), 5 + (hash(y, x) % 3)), x, y, false);
      else if (w.floor[i] === 2) overlay.putTileAt(gidOf('interior', hash(x, y) % 17 === 0 ? 1 : 0, 3), x, y, false);
      else if (w.water[i]) overlay.putTileAt(waterTile(w, x, y), x, y, false);
    }
  // murs : par colonnes
  for (let x = 0; x < w.w; x++) {
    let y = 0;
    while (y < w.h) {
      if (w.wall[w.idx(x, y)] !== 1) {
        if (w.wall[w.idx(x, y)] === 2) voidGfx.fillStyle(0x16110d, 1).fillRect(x * TILE, y * TILE, TILE, TILE);
        y++;
        continue;
      }
      let y1 = y;
      while (y1 + 1 < w.h && w.wall[w.idx(x, y1 + 1)] === 1) y1++;
      for (const t of wallTiles(w, x, y, y1)) {
        if (t.gid < 0) {
          voidGfx.fillStyle(0x16110d, 1).fillRect(x * TILE, t.y * TILE, TILE, TILE);
          continue;
        }
        const tile = walls.putTileAt(t.gid, x, t.y, false);
        if (tint !== 0xffffff) tile.tint = tint;
      }
      y = y1 + 1;
    }
  }
  const bridges = drawBridges(scene, w);
  return { ground, overlay, walls, voidGfx, bridges, map };
}

/** Planches des ponts (et raccourcis ouverts) posées sur l'eau. */
export function drawBridges(scene: Phaser.Scene, w: World): Phaser.GameObjects.Image[] {
  const out: Phaser.GameObjects.Image[] = [];
  for (let y = 0; y < w.h; y++)
    for (let x = 0; x < w.w; x++) {
      const i = w.idx(x, y);
      if (w.water[i] && w.bridge[i]) out.push(scene.add.image(x * TILE, y * TILE, 'props', 'bridge_deck').setOrigin(0, 0).setDepth(-99970));
    }
  return out;
}

/** Couleur moyenne d'une tuile pour la carte (vue d'ensemble). */
export function tileColor(w: World, x: number, y: number): number {
  const i = w.idx(x, y);
  if (w.wall[i]) return w.def.wall === 'castle' ? 0x4b4658 : w.def.wall === 'brick' ? 0x4a2420 : 0x5a3b28;
  if (w.water[i]) return w.bridge[i] ? 0x8b6a45 : 0x2c5e7a;
  if (w.floor[i] === 1) return 0x77726c;
  if (w.floor[i] === 2) return 0x8a6440;
  const grass = w.isGrassTile(x, y);
  if (w.palette[i]) return grass ? 0x6b6a3a : 0x7a5e3e;
  return grass ? 0x4f7d3a : 0x8a6a45;
}
