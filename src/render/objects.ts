// Objets du monde (arbres, rochers, conteneurs…) : sprites créés seulement pour
// les chunks proches de la caméra (culling), tri de profondeur par les pieds.
import Phaser from 'phaser';
import { CHUNK, TILE } from '../config/balance';
import type { World, WObj } from '../world/world';

const FLAT = new Set(['world:paper', 'world:bones', 'world:skull', 'world:flower_a', 'world:flower_b', 'world:flower_c', 'world:grass_short', 'world:morel', 'world:mushroom_red', 'world:rock_pebble', 'world:hay_pile']);

interface ObjView {
  main: Phaser.GameObjects.Image | null;
  extra: Phaser.GameObjects.Image | null; // fragment posé sur l'autel
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
  private active = new Map<number, number[]>(); // chunk -> ids visibles
  private views = new Map<number, ObjView>();
  occluders: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, world: World) {
    this.scene = scene;
    this.world = world;
    this.cw = Math.ceil(world.w / CHUNK);
    const ch = Math.ceil(world.h / CHUNK);
    this.byChunk = Array.from({ length: this.cw * ch }, () => []);
    for (const o of world.objects) {
      if (o.removed) continue;
      const cx = Math.floor(o.fx / CHUNK);
      const cy = Math.floor(o.fy / CHUNK);
      this.byChunk[cy * this.cw + cx].push(o.id);
    }
  }

  private spriteFor(o: WObj): string | null {
    if (o.depleted) {
      if (o.type === 'tree') return 'world:stump';
      if (o.type === 'bush') return 'world:bush_berry_empty';
      return null;
    }
    if (o.type === 'container' && o.opened && o.sprite === 'world:chest_closed') return 'world:chest_open';
    return o.sprite;
  }

  private create(o: WObj): ObjView {
    const view: ObjView = { main: null, extra: null };
    const key = this.spriteFor(o);
    const x = (o.fx + o.fw / 2) * TILE;
    const y = (o.fy + o.fh) * TILE;
    if (key) {
      const [a, f] = split(key);
      const img = this.scene.add.image(x, y, a, f).setOrigin(0.5, 1);
      img.setDepth(FLAT.has(key) ? y - TILE : y);
      img.setData('occluder', !!o.occluder && !o.depleted);
      view.main = img;
      if (o.occluder && !o.depleted) this.occluders.push(img);
    }
    if (o.type === 'altar' && o.frag && !o.taken) {
      const gem = this.scene.add.image(x, y - 104, 'items', `i_${o.frag}`).setOrigin(0.5, 1).setDepth(y + 1);
      this.scene.tweens.add({ targets: gem, y: y - 112, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      view.extra = gem;
    }
    return view;
  }

  private destroyView(id: number): void {
    const v = this.views.get(id);
    if (!v) return;
    if (v.main) {
      const i = this.occluders.indexOf(v.main);
      if (i >= 0) this.occluders.splice(i, 1);
      v.main.destroy();
    }
    if (v.extra) {
      this.scene.tweens.killTweensOf(v.extra);
      v.extra.destroy();
    }
    this.views.delete(id);
  }

  /** Active les chunks visibles, libère les autres. */
  update(view: Phaser.Geom.Rectangle): void {
    const pad = 3 * TILE;
    const x0 = Math.max(0, Math.floor((view.x - pad) / (CHUNK * TILE)));
    const x1 = Math.min(this.cw - 1, Math.floor((view.right + pad) / (CHUNK * TILE)));
    const y0 = Math.max(0, Math.floor((view.y - pad - 4 * TILE) / (CHUNK * TILE)));
    const y1 = Math.min(Math.ceil(this.world.h / CHUNK) - 1, Math.floor((view.bottom + pad + 4 * TILE) / (CHUNK * TILE)));
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
    const c = Math.floor(o.fy / CHUNK) * this.cw + Math.floor(o.fx / CHUNK);
    if (!this.active.has(c)) return;
    this.destroyView(id);
    this.views.set(id, this.create(o));
  }

  /** Petite secousse visuelle sur l'objet frappé. */
  shake(id: number): void {
    const v = this.views.get(id);
    if (!v?.main) return;
    const img = v.main;
    const x = (this.world.objects[id].fx + this.world.objects[id].fw / 2) * TILE;
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
