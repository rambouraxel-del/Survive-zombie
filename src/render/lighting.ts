// Éclairage fixe propre à chaque carte (jour au Bois, nuit au Marais, pénombre au Bastion…),
// zones de grotte plus sombres et halos autour des sources de lumière.
// Le voile est une petite texture au quart de la résolution (dégradés doux), agrandie en lissé.
import Phaser from 'phaser';
import { TILE } from '../config/balance';
import { buildingStats } from '../data/buildings';
import type { Game } from '../sim/game';
import { lightRadius } from '../sim/profile';

const KEY = 'night-mask';
const SCALE = 4;

export class Lighting {
  private tex: Phaser.Textures.CanvasTexture;
  private img: Phaser.GameObjects.Image;
  private w = 0;
  private h = 0;

  constructor(scene: Phaser.Scene) {
    if (scene.textures.exists(KEY)) scene.textures.remove(KEY);
    this.tex = scene.textures.createCanvas(KEY, 16, 16)!;
    this.tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.img = scene.add.image(0, 0, KEY).setOrigin(0, 0).setDepth(9e5).setScale(SCALE);
  }

  update(g: Game, view: Phaser.Geom.Rectangle, flicker: number): void {
    const L = g.world.def.light;
    const caveDark = L.caveDarkness ?? 0;
    if (L.darkness <= 0.01 && caveDark <= 0) {
      this.img.setVisible(false);
      return;
    }
    this.img.setVisible(true);
    const w = Math.ceil(view.width / SCALE) + 2;
    const h = Math.ceil(view.height / SCALE) + 2;
    if (w !== this.w || h !== this.h) {
      this.tex.setSize(w, h);
      this.w = w;
      this.h = h;
      this.img.setTexture(KEY);
      this.img.setSize(w, h);
    }
    const ox = Math.floor(view.x / SCALE) * SCALE - SCALE;
    const oy = Math.floor(view.y / SCALE) * SCALE - SCALE;
    this.img.setPosition(ox, oy);
    const ctx = this.tex.getContext();
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    const [r, gg, b] = L.color;
    ctx.fillStyle = `rgba(${r},${gg},${b},${L.darkness.toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    // grottes : voile supplémentaire tuile par tuile (quart de résolution)
    if (caveDark > 0) {
      ctx.fillStyle = `rgba(6,4,10,${caveDark.toFixed(3)})`;
      const wd = g.world;
      const t0x = Math.max(0, Math.floor(view.x / TILE) - 1);
      const t1x = Math.min(wd.w - 1, Math.floor(view.right / TILE) + 1);
      const t0y = Math.max(0, Math.floor(view.y / TILE) - 1);
      const t1y = Math.min(wd.h - 1, Math.floor(view.bottom / TILE) + 1);
      for (let ty = t0y; ty <= t1y; ty++)
        for (let tx = t0x; tx <= t1x; tx++) if (wd.isCave(tx, ty)) ctx.fillRect((tx * TILE - ox) / SCALE, (ty * TILE - oy) / SCALE, TILE / SCALE + 0.5, TILE / SCALE + 0.5);
    }
    ctx.globalCompositeOperation = 'destination-out';
    const light = (x: number, y: number, radius: number) => {
      if (x + radius < view.x || x - radius > view.right || y + radius < view.y || y - radius > view.bottom) return;
      const cx = (x - ox) / SCALE;
      const cy = (y - oy) / SCALE;
      radius /= SCALE;
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grd.addColorStop(0, 'rgba(0,0,0,1)');
      grd.addColorStop(0.55, 'rgba(0,0,0,0.75)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    };
    const p = g.player;
    // halo minimal autour du joueur (lisibilité) + torche éventuelle
    light(p.x, p.y - 16, 70 + lightRadius(g) * (0.95 + flicker * 0.05));
    for (const bld of g.world.buildings.values()) {
      const l = buildingStats(bld.type, bld.level).light;
      if (!l) continue;
      const c = g.world.buildingCenter(bld);
      light(c.x, c.y, l * (bld.type === 'campfire' ? 0.94 + flicker * 0.06 : 1));
    }
    for (const o of g.world.objects) {
      if (!o.light || o.depleted) continue;
      if (Math.abs((o.fx + 0.5) * TILE - p.x) > view.width || Math.abs((o.fy + 0.5) * TILE - p.y) > view.height) continue;
      light((o.fx + o.fw / 2) * TILE, (o.fy + 0.5) * TILE, o.light * (o.type === 'checkpoint' ? 0.94 + flicker * 0.06 : 1));
    }
    for (const pr of g.projectiles) if (pr.kind === 'fire') light(pr.x, pr.y, 70);
    for (const z of g.zones) if (z.owner === 'player' && z.t >= z.delay && (z.kind === 'fire' || z.kind === 'rain')) light(z.x, z.y, z.r * 1.4);
    this.tex.refresh();
  }

  destroy(): void {
    this.img.destroy();
  }
}
