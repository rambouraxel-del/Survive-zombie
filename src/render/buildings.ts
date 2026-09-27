// Constructions du joueur et sacs au sol.
import Phaser from 'phaser';
import { TILE } from '../config/balance';
import { BUILDING_BY_ID, buildingStats } from '../data/buildings';
import type { Game } from '../sim/game';
import type { Building } from '../world/world';

type Offsets = Record<string, [number, number, number, number]>;

interface BView {
  img: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Graphics | null;
  frame: string;
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
    return !!b && (b.type === 'palisade' || b.type === 'door');
  }

  private fenceFrame(b: Building): string {
    const n = this.isWall(b.x, b.y - 1);
    const s = this.isWall(b.x, b.y + 1);
    const e = this.isWall(b.x + 1, b.y);
    const w = this.isWall(b.x - 1, b.y);
    if ((e || w) && !n && !s) return 'fence_h';
    if ((n || s) && !e && !w) return 'fence_v';
    if (e && s && !w && !n) return 'fence_es';
    if (w && s && !e && !n) return 'fence_ws';
    if (n && e && !w && !s) return 'fence_ne';
    if (n && w && !e && !s) return 'fence_nw';
    if (!n && !s && !e && !w) return 'fence_post';
    return e || w ? 'fence_h' : 'fence_v';
  }

  private frameFor(b: Building): string {
    const p = this.g.player;
    switch (b.type) {
      case 'palisade':
        return this.fenceFrame(b);
      case 'door': {
        const c = this.g.world.buildingCenter(b);
        return Math.hypot(c.x - p.x, c.y - p.y) < 1.3 * TILE ? 'door_open' : 'door_closed';
      }
      case 'campfire':
        if ((b.level ?? 1) >= 2 && this.has('cauldron_fire_0')) return `cauldron_fire_${this.fireFrame % 3}`;
        return `campfire_${this.fireFrame}`;
      case 'trap':
        return (b.meat ?? 0) > 0 ? 'trap_full' : 'trap';
      default: {
        // construction améliorée : sprite du pack LPC correspondant (repli sur l'original)
        const f = buildingStats(b.type, b.level).sprite;
        return this.has(f) ? f : BUILDING_BY_ID[b.type].sprite;
      }
    }
  }

  private has(frame: string): boolean {
    return this.scene.textures.get('world').has(frame);
  }

  private place(img: Phaser.GameObjects.Image, b: Building, frame: string): void {
    const d = BUILDING_BY_ID[b.type];
    const off = this.offsets[frame];
    const tileAligned = b.type === 'palisade' || b.type === 'door';
    if (tileAligned && off) {
      // position fidèle à la cellule d'origine
      img.setOrigin(0, 0);
      const cellH = off[3];
      img.setPosition(b.x * TILE + off[0], (b.y + 1) * TILE - cellH + off[1]);
    } else {
      img.setOrigin(0.5, 1);
      img.setPosition((b.x + d.w / 2) * TILE, (b.y + d.h) * TILE - (b.type === 'trap' ? 4 : 0));
    }
    img.setDepth((b.y + d.h) * TILE - (b.type === 'trap' ? 20 : 0));
  }

  rebuild(): void {
    for (const v of this.views.values()) {
      v.img.destroy();
      v.bar?.destroy();
    }
    this.views.clear();
    for (const b of this.g.world.buildings.values()) {
      const frame = this.frameFor(b);
      const img = this.scene.add.image(0, 0, 'world', frame);
      this.place(img, b, frame);
      this.views.set(b.id, { img, bar: null, frame });
    }
    this.updateBars();
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

  private updateBars(): void {
    for (const [id, v] of this.views) {
      const b = this.g.world.buildings.get(id);
      if (!b) continue;
      const d = BUILDING_BY_ID[b.type];
      if (b.hp >= d.hp) {
        v.bar?.destroy();
        v.bar = null;
        continue;
      }
      if (!v.bar) v.bar = this.scene.add.graphics();
      const x = b.x * TILE + 2;
      const y = b.y * TILE - 6;
      const w = d.w * TILE - 4;
      v.bar.clear();
      v.bar.fillStyle(0x000000, 0.6).fillRect(x, y, w, 4);
      v.bar.fillStyle(b.hp / d.hp > 0.4 ? 0x8fd14f : 0xe05a47, 1).fillRect(x, y, Math.max(1, (w * b.hp) / d.hp), 4);
      v.bar.setDepth(1e5);
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
        v.img.setFrame(f);
        this.place(v.img, b, f);
        if (b.type === 'door') this.g.emit({ type: 'sound', key: f === 'door_open' ? 'door_open' : 'door_close' });
      }
    }
    this.updateBars();
  }

  /** Sprite fantôme pour l'aperçu de construction. */
  ghostFrame(type: string): string {
    return type === 'palisade' ? 'fence_h' : type === 'campfire' ? 'campfire_1' : BUILDING_BY_ID[type].sprite;
  }

  placeGhost(img: Phaser.GameObjects.Image, type: string, tx: number, ty: number): void {
    const b: Building = { id: -1, type, x: tx, y: ty, hp: 1 };
    const f = this.ghostFrame(type);
    img.setFrame(f);
    this.place(img, b, f);
    img.setDepth(2e5);
  }
}
