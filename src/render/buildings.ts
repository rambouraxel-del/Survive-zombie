// Installations du camp et mobilier de la maison, sacs au sol.
import Phaser from 'phaser';
import { TILE } from '../config/balance';
import { BUILDING_BY_ID, buildingStats } from '../data/buildings';
import type { Game } from '../sim/game';
import type { Building } from '../world/world';

type Offsets = Record<string, [number, number, number, number]>;

interface BView {
  img: Phaser.GameObjects.Image;
  frame: string;
}

function split(key: string): [string, string] {
  const i = key.indexOf(':');
  return [key.slice(0, i), key.slice(i + 1)];
}

export class BuildingLayer {
  private scene: Phaser.Scene;
  private g: Game;
  private offsets: Offsets;
  private views = new Map<number, BView>();
  private bags = new Map<number, Phaser.GameObjects.Image>();
  private fireFrame = 0;
  private fireT = 0;

  constructor(scene: Phaser.Scene, g: Game) {
    this.scene = scene;
    this.g = g;
    this.offsets = scene.cache.json.get('offsets') as Offsets;
    this.rebuild();
    this.rebuildBags();
  }

  private isWall(x: number, y: number): boolean {
    const b = this.g.world.buildingAtTile(x, y);
    return !!b && b.type === 'palisade';
  }

  private fenceFrame(b: Building): string {
    const n = this.isWall(b.x, b.y - 1);
    const s = this.isWall(b.x, b.y + 1);
    const e = this.isWall(b.x + 1, b.y);
    const w = this.isWall(b.x - 1, b.y);
    if ((e || w) && !n && !s) return 'world:fence_h';
    if ((n || s) && !e && !w) return 'world:fence_v';
    if (e && s && !w && !n) return 'world:fence_es';
    if (w && s && !e && !n) return 'world:fence_ws';
    if (n && e && !w && !s) return 'world:fence_ne';
    if (n && w && !e && !s) return 'world:fence_nw';
    if (!n && !s && !e && !w) return 'world:fence_post';
    return e || w ? 'world:fence_h' : 'world:fence_v';
  }

  private frameFor(b: Building): string {
    switch (b.type) {
      case 'palisade':
        return this.fenceFrame(b);
      case 'campfire':
        if ((b.level ?? 1) >= 2) return `world:cauldron_fire_${this.fireFrame % 3}`;
        return `world:campfire_${this.fireFrame}`;
      case 'trap':
        return (b.meat ?? 0) > 0 ? 'world:trap_full' : 'world:trap';
      default:
        return buildingStats(b.type, b.level).sprite;
    }
  }

  private place(img: Phaser.GameObjects.Image, b: Building, frame: string): void {
    const d = BUILDING_BY_ID[b.type];
    const off = this.offsets[split(frame)[1]];
    if (b.type === 'palisade' && off) {
      img.setOrigin(0, 0);
      img.setPosition(b.x * TILE + off[0], (b.y + 1) * TILE - off[3] + off[1]);
    } else {
      img.setOrigin(0.5, 1);
      img.setPosition((b.x + d.w / 2) * TILE, (b.y + d.h) * TILE - (b.type === 'trap' ? 4 : 0));
    }
    img.setDepth((b.y + d.h) * TILE - (b.type === 'trap' ? 20 : 0));
  }

  private makeImage(frame: string): Phaser.GameObjects.Image {
    const [a, f] = split(frame);
    return this.scene.add.image(0, 0, a, f);
  }

  rebuild(): void {
    for (const v of this.views.values()) v.img.destroy();
    this.views.clear();
    for (const b of this.g.world.buildings.values()) {
      const frame = this.frameFor(b);
      const img = this.makeImage(frame);
      this.place(img, b, frame);
      this.views.set(b.id, { img, frame });
    }
  }

  rebuildBags(): void {
    for (const s of this.bags.values()) s.destroy();
    this.bags.clear();
    for (const bag of this.g.world.bags.values()) {
      const img = this.scene.add.image(bag.x, bag.y, 'items', 'i_bag').setOrigin(0.5, 1).setDepth(bag.y - 2);
      this.scene.tweens.add({ targets: img, y: bag.y - 3, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.bags.set(bag.id, img);
    }
  }

  onChanged(): void {
    this.rebuild();
  }

  update(dt: number): void {
    this.fireT += dt;
    if (this.fireT > 0.12) {
      this.fireT = 0;
      this.fireFrame = (this.fireFrame + 1) % 4;
    }
    for (const [id, v] of this.views) {
      const b = this.g.world.buildings.get(id);
      if (!b) continue;
      const f = this.frameFor(b);
      if (f !== v.frame) {
        v.frame = f;
        const [a, fr] = split(f);
        v.img.setTexture(a, fr);
        this.place(v.img, b, f);
      }
    }
  }

  /** Aperçu (placement ou déplacement). */
  placeGhost(img: Phaser.GameObjects.Image, type: string, tx: number, ty: number): void {
    const b: Building = { id: -1, type, x: tx, y: ty };
    const f = type === 'palisade' ? 'world:fence_h' : type === 'campfire' ? 'world:campfire_1' : BUILDING_BY_ID[type].sprite;
    const [a, fr] = split(f);
    img.setTexture(a, fr);
    this.place(img, b, f);
    img.setDepth(2e5);
  }

  /** Masque l'image d'une installation (pendant son déplacement). */
  setHidden(id: number, hidden: boolean): void {
    const v = this.views.get(id);
    if (v) v.img.setAlpha(hidden ? 0.3 : 1);
  }
}
