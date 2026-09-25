// Terrain : tuiles LPC (herbe / terre) choisies par les coins (autotuilage),
// jeu de tuiles « été » ou « automne » selon la zone.
import Phaser from 'phaser';
import { TILE } from '../config/balance';
import type { World } from '../world/world';

const COLS = 16;
const PER_SET = 16 * 26;

// masque des coins (TL=8, TR=4, BL=2, BR=1 ; 1 = herbe) -> [col, ligne]
const EDGE: Record<number, [number, number]> = {
  1: [6, 0], 3: [7, 0], 2: [8, 0],
  5: [6, 1], 10: [8, 1],
  4: [6, 2], 12: [7, 2], 8: [8, 2],
  14: [6, 3], 13: [7, 3], 11: [6, 4], 7: [7, 4],
};
const GRASS: [number, number][] = [[3, 1], [4, 1], [5, 1], [3, 2], [4, 2], [5, 2]];
const DIRT: [number, number][] = [[3, 3], [4, 3], [5, 3], [3, 4], [4, 4], [5, 4]];

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function tileFor(w: World, x: number, y: number): number {
  const m = (w.vertex(x, y) << 3) | (w.vertex(x + 1, y) << 2) | (w.vertex(x, y + 1) << 1) | w.vertex(x + 1, y + 1);
  let cr: [number, number];
  if (m === 15 || m === 6 || m === 9) {
    // herbe : variantes pondérées (la plus unie domine)
    const h = hash(x, y) % 20;
    cr = h < 12 ? GRASS[4] : GRASS[h % 6];
  } else if (m === 0) cr = DIRT[hash(x, y) % 6];
  else cr = EDGE[m];
  const set = w.palette[w.idx(x, y)];
  return 1 + set * PER_SET + cr[1] * COLS + cr[0];
}

export function buildTerrain(scene: Phaser.Scene, w: World): Phaser.Tilemaps.TilemapLayer {
  const map = scene.make.tilemap({ width: w.w, height: w.h, tileWidth: TILE, tileHeight: TILE });
  const summer = map.addTilesetImage('summer', 'terrain_summer', TILE, TILE, 0, 0, 1)!;
  const autumn = map.addTilesetImage('autumn', 'terrain_autumn', TILE, TILE, 0, 0, 1 + PER_SET)!;
  const layer = map.createBlankLayer('ground', [summer, autumn], 0, 0)!;
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) layer.putTileAt(tileFor(w, x, y), x, y, false);
  layer.setDepth(-100000);
  layer.setCullPadding(2, 2);
  return layer;
}
