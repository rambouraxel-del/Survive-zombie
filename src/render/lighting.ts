// Cycle lumineux calculé par le moteur : voile sombre et halos autour des sources.
// Le voile est une petite texture canvas (taille de la vue en pixels du monde),
// redessinée à chaque image : fond sombre puis halos « découpés » en dégradé.
import Phaser from 'phaser';
import { BUILDING_BY_ID } from '../data/buildings';
import type { Game } from '../sim/game';

const KEY = 'night-mask';

export class Lighting {
  private tex: Phaser.Textures.CanvasTexture;
  private img: Phaser.GameObjects.Image;
  private w = 0;
  private h = 0;

  constructor(scene: Phaser.Scene) {
    if (scene.textures.exists(KEY)) scene.textures.remove(KEY);
    this.tex = scene.textures.createCanvas(KEY, 16, 16)!;
    this.img = scene.add.image(0, 0, KEY).setOrigin(0, 0).setDepth(9e5);
  }

  update(g: Game, view: Phaser.Geom.Rectangle, flicker: number): void {
    const dark = g.darkness();
    if (dark <= 0.01) {
      this.img.setVisible(false);
      return;
    }
    this.img.setVisible(true);
    const w = Math.ceil(view.width) + 4;
    const h = Math.ceil(view.height) + 4;
    if (w !== this.w || h !== this.h) {
      this.tex.setSize(w, h);
      this.w = w;
      this.h = h;
      this.img.setTexture(KEY);
      this.img.setSize(w, h);
    }
    const ox = Math.floor(view.x) - 2;
    const oy = Math.floor(view.y) - 2;
    this.img.setPosition(ox, oy);
    const ctx = this.tex.getContext();
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    // nuit lisible : on ne descend jamais sous un certain niveau de visibilité
    ctx.fillStyle = `rgba(11,16,48,${(0.72 * dark).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-out';
    const light = (x: number, y: number, radius: number) => {
      if (x + radius < view.x || x - radius > view.right || y + radius < view.y || y - radius > view.bottom) return;
      const cx = x - ox;
      const cy = y - oy;
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grd.addColorStop(0, 'rgba(0,0,0,1)');
      grd.addColorStop(0.55, 'rgba(0,0,0,0.8)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    };
    const p = g.player;
    // halo minimal autour du joueur + torche éventuelle
    light(p.x, p.y - 16, 64 + g.lightRadius() * (0.95 + flicker * 0.05));
    for (const b of g.world.buildings.values()) {
      const d = BUILDING_BY_ID[b.type];
      if (!d.light) continue;
      const c = g.world.buildingCenter(b);
      light(c.x, c.y, d.light * (b.type === 'campfire' ? 0.94 + flicker * 0.06 : 1));
    }
    if (g.sanctuaryRestored) {
      const o = g.world.objects[g.world.sanctuaryId];
      light((o.fx + 1) * 32, (o.fy + 1) * 32, 170);
    }
    this.tex.refresh();
  }
}
