// Objets du monde (arbres, rochers, coffres, portes, points de halte…) : sprites créés seulement
// pour les chunks proches de la caméra (culling), tri de profondeur par les pieds.
import Phaser from 'phaser';
import { CHUNK, TILE } from '../config/balance';
import type { World, WObj } from '../world/world';

interface ObjView {
  main: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | null;
  extra: Phaser.GameObjects.Image[];
}

function split(key: string): [string, string] {
  const [a, f] = key.split(':');
  return [a, f];
}

export class ObjectLayer {
  private scene: Phaser.Scene;
  private world: World;
  private byChunk: number[][];
  private cw: number;
  private active = new Map<number, number[]>();
  private views = new Map<number, ObjView>();
  occluders: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, world: World) {
    this.scene = scene;
    this.world = world;
    this.cw = Math.ceil(world.w / CHUNK);
    const ch = Math.ceil(world.h / CHUNK);
    this.byChunk = Array.from({ length: this.cw * ch }, () => []);
    for (const o of world.objects) this.index(o);
  }

  private index(o: WObj): void {
    const cx = Math.min(this.cw - 1, Math.floor(o.fx / CHUNK));
    const cy = Math.floor(o.fy / CHUNK);
    this.byChunk[cy * this.cw + cx]?.push(o.id);
  }

  /** Nouvel objet ajouté en cours de partie (récompense de donjon). */
  addObject(o: WObj): void {
    this.index(o);
    const c = Math.floor(o.fy / CHUNK) * this.cw + Math.min(this.cw - 1, Math.floor(o.fx / CHUNK));
    if (this.active.has(c)) this.views.set(o.id, this.create(o));
  }

  private spriteFor(o: WObj): string | null {
    if (o.depleted) {
      if (o.type === 'tree') return 'world:stump';
      if (o.type === 'bush') return 'world:bush_berry_empty';
      return null;
    }
    if (o.type === 'door' || !o.sprite) return null;
    if (o.type === 'gate' && o.open) return null;
    if (o.type === 'container' && o.opened) {
      if (o.sprite === 'world:chest_closed') return 'world:chest_open';
      if (o.sprite === 'world:chest_big_closed') return 'world:chest_big_open';
    }
    return o.sprite;
  }

  private create(o: WObj): ObjView {
    const view: ObjView = { main: null, extra: [] };
    const key = this.spriteFor(o);
    const x = (o.fx + o.fw / 2) * TILE;
    const y = (o.fy + o.fh) * TILE;
    if (o.type === 'shortcut' && o.open) {
      // raccourci ouvert : échelle ou planches posées sur chaque case
      for (const c of o.cells ?? []) {
        const [a, f] = split(o.sprite);
        const img = this.scene.add.image((c.x + 0.5) * TILE, (c.y + 1) * TILE, a, f).setOrigin(0.5, 1).setDepth(c.y * TILE - TILE);
        view.extra.push(img);
      }
      return view;
    }
    if (key) {
      const [a, f] = split(key);
      const lit = o.type === 'checkpoint' && o.open && !o.votive;
      const img = lit ? this.scene.add.sprite(x, y, 'world', 'campfire_1').play('campfire_anim') : this.scene.add.image(x, y, a, f);
      img.setOrigin(0.5, 1);
      img.setDepth(o.flat ? y - TILE : y);
      if (o.type === 'lever' && o.open) img.setTint(0x8a8a8a);
      if (o.type === 'shortcut') img.setAlpha(0.9);
      view.main = img;
      if (o.occluder && !o.depleted) this.occluders.push(img as Phaser.GameObjects.Image);
    }
    return view;
  }

  private destroyView(id: number): void {
    const v = this.views.get(id);
    if (!v) return;
    if (v.main) {
      const i = this.occluders.indexOf(v.main as Phaser.GameObjects.Image);
      if (i >= 0) this.occluders.splice(i, 1);
      this.scene.tweens.killTweensOf(v.main);
      v.main.destroy();
    }
    for (const e of v.extra) e.destroy();
    this.views.delete(id);
  }

  update(view: Phaser.Geom.Rectangle): void {
    const pad = 3 * TILE;
    const x0 = Math.max(0, Math.floor((view.x - pad) / (CHUNK * TILE)));
    const x1 = Math.min(this.cw - 1, Math.floor((view.right + pad) / (CHUNK * TILE)));
    const y0 = Math.max(0, Math.floor((view.y - pad - 4 * TILE) / (CHUNK * TILE)));
    const y1 = Math.min(Math.ceil(this.world.h / CHUNK) - 1, Math.floor((view.bottom + pad + 5 * TILE) / (CHUNK * TILE)));
    const want = new Set<number>();
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) want.add(cy * this.cw + cx);
    for (const [c, ids] of this.active) {
      if (want.has(c)) continue;
      for (const id of ids) this.destroyView(id);
      this.active.delete(c);
    }
    for (const c of want) {
      if (this.active.has(c)) continue;
      const ids = this.byChunk[c];
      for (const id of ids) this.views.set(id, this.create(this.world.objects[id]));
      this.active.set(c, ids);
    }
  }

  refresh(id: number): void {
    const o = this.world.objects[id];
    if (!o) return;
    const c = Math.floor(o.fy / CHUNK) * this.cw + Math.min(this.cw - 1, Math.floor(o.fx / CHUNK));
    if (!this.active.has(c)) return;
    this.destroyView(id);
    this.views.set(id, this.create(o));
  }

  /** Petite secousse visuelle sur l'objet frappé. */
  shake(id: number): void {
    const v = this.views.get(id);
    if (!v?.main) return;
    const img = v.main;
    const o = this.world.objects[id];
    const x = (o.fx + o.fw / 2) * TILE;
    this.scene.tweens.killTweensOf(img);
    img.x = x;
    this.scene.tweens.add({ targets: img, x: x + 2, duration: 40, yoyo: true, repeat: 2, onComplete: () => (img.x = x) });
  }

  /** Transparence des éléments qui masquent le personnage. */
  updateOcclusion(px: number, py: number): void {
    for (const img of this.occluders) {
      const behind = py < img.y - 4 && py > img.y - img.displayHeight + 12 && Math.abs(px - img.x) < img.displayWidth / 2 - 4;
      const target = behind ? 0.45 : 1;
      if (img.alpha === target) continue;
      const a = Phaser.Math.Linear(img.alpha, target, 0.3);
      img.setAlpha(Math.abs(a - target) < 0.03 ? target : a);
    }
  }

  get visibleCount(): number {
    return this.views.size;
  }
}
