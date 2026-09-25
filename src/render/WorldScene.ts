// Scène principale : fait avancer la simulation à pas fixe et synchronise le rendu.
import Phaser from 'phaser';
import { MAX_FRAME_DELTA, SIM_STEP, TILE } from '../config/balance';
import { BUILDING_BY_ID } from '../data/buildings';
import type { Game } from '../sim/game';
import type { GameEvent, InputState } from '../sim/types';
import { canPlace } from '../sim/actions';
import { createAnimations, EnemyViews, PlayerView } from './actors';
import { BuildingLayer } from './buildings';
import { Lighting } from './lighting';
import { ObjectLayer } from './objects';
import { buildTerrain } from './terrain';
import { MUSIC_KEYS, SOUND_KEYS } from '../audio/audio';

export interface SceneHost {
  isSimPaused(): boolean;
  pollInput(): InputState;
  onGameEvent(e: GameEvent): void;
  onFrame(dt: number, fps: number): void;
  onLoadProgress(p: number): void;
  onSceneReady(scene: WorldScene): void;
  onPlacementPointer(tx: number, ty: number): void;
  onManagePointer(tx: number, ty: number): void;
  reduceShake(): boolean;
  debug(): boolean;
}

export class WorldScene extends Phaser.Scene {
  host!: SceneHost;
  game_: Game | null = null;
  private acc = 0;
  terrain: Phaser.Tilemaps.TilemapLayer | null = null;
  objects: ObjectLayer | null = null;
  buildingsLayer: BuildingLayer | null = null;
  private player: PlayerView | null = null;
  private enemies: EnemyViews | null = null;
  private lighting: Lighting | null = null;
  private highlight!: Phaser.GameObjects.Graphics;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private arrows: Phaser.GameObjects.Image[] = [];
  private floats: Phaser.GameObjects.Text[] = [];
  ghost: Phaser.GameObjects.Image | null = null;
  private ghostGfx!: Phaser.GameObjects.Graphics;
  placing: { type: string; tx: number; ty: number } | null = null;
  managing = false;
  private flicker = 0;

  constructor() {
    super('world');
  }

  init(data: { host: SceneHost }): void {
    this.host = data.host;
  }

  preload(): void {
    this.load.on('progress', (p: number) => this.host.onLoadProgress(p));
    this.load.atlas('world', 'assets/atlas/world.png', 'assets/atlas/world.json');
    this.load.atlas('items', 'assets/atlas/items.png', 'assets/atlas/items.json');
    this.load.json('offsets', 'assets/atlas/offsets.json');
    this.load.image('terrain_summer', 'assets/tiles/terrain_summer.png');
    this.load.image('terrain_autumn', 'assets/tiles/terrain_autumn.png');
    for (const c of ['player', 'rodeur', 'affame', 'brute']) this.load.spritesheet(c, `assets/chars/${c}.png`, { frameWidth: 64, frameHeight: 64 });
    for (const k of [...SOUND_KEYS, ...MUSIC_KEYS]) this.load.audio(k, `assets/audio/${k}.mp3`);
  }

  create(): void {
    createAnimations(this);
    this.highlight = this.add.graphics().setDepth(8e5);
    this.debugGfx = this.add.graphics().setDepth(8.5e5);
    this.ghostGfx = this.add.graphics().setDepth(2.1e5);
    this.cameras.main.setBackgroundColor('#1b1712');
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointer(p, true));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown || !p.wasTouch) this.onPointer(p, false);
    });
    this.scale.on('resize', () => this.applyZoom());
    this.applyZoom();
    this.host.onSceneReady(this);
  }

  private onPointer(p: Phaser.Input.Pointer, down: boolean): void {
    if (!this.game_) return;
    const cam = this.cameras.main;
    const wp = cam.getWorldPoint(p.x, p.y);
    // au doigt, l'aperçu s'affiche au-dessus du point touché
    const offY = p.wasTouch ? 1.6 * TILE : 0;
    if (this.placing) {
      const d = BUILDING_BY_ID[this.placing.type];
      const tx = Math.floor(wp.x / TILE - (d.w - 1) / 2);
      const ty = Math.floor((wp.y - offY) / TILE - (d.h - 1) / 2);
      this.host.onPlacementPointer(tx, ty);
    } else if (this.managing && down) {
      this.host.onManagePointer(Math.floor(wp.x / TILE), Math.floor(wp.y / TILE));
    }
  }

  applyZoom(): void {
    const cam = this.cameras.main;
    const w = this.scale.width;
    const h = this.scale.height;
    const z = Math.max(1, Math.round(Math.min(w, h) / (TILE * 11.5)));
    cam.setZoom(z);
    cam.setRoundPixels(true);
  }

  setGame(g: Game): void {
    this.clearWorld();
    this.game_ = g;
    this.acc = 0;
    this.terrain = buildTerrain(this, g.world);
    this.objects = new ObjectLayer(this, g.world);
    this.buildingsLayer = new BuildingLayer(this, g);
    this.player = new PlayerView(this);
    this.enemies = new EnemyViews(this);
    this.lighting = new Lighting(this);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, g.world.w * TILE, g.world.h * TILE);
    this.player.update(g);
    cam.startFollow(this.player.sprite, true, 0.14, 0.14);
    cam.centerOn(g.player.x, g.player.y);
    this.objects.update(cam.worldView);
  }

  clearWorld(): void {
    this.game_ = null;
    this.tweens.killAll();
    for (const o of [...this.children.list]) {
      if (o === this.highlight || o === this.debugGfx || o === this.ghostGfx) continue;
      o.destroy();
    }
    this.terrain = null;
    this.objects = null;
    this.buildingsLayer = null;
    this.player = null;
    this.enemies = null;
    this.lighting = null;
    this.ghost = null;
    this.arrows = [];
    this.floats = [];
    this.highlight?.clear();
    this.ghostGfx?.clear();
  }

  update(_time: number, deltaMs: number): void {
    const g = this.game_;
    const dt = Math.min(deltaMs / 1000, MAX_FRAME_DELTA);
    if (!g || !this.player) return;
    if (!this.host.isSimPaused()) {
      this.acc += dt;
      const input = this.host.pollInput();
      let steps = 0;
      while (this.acc >= SIM_STEP && steps < 10) {
        g.step(SIM_STEP, input);
        this.acc -= SIM_STEP;
        steps++;
      }
      if (steps >= 10) this.acc = 0;
    } else this.acc = 0;

    for (const e of g.events) this.handleEvent(e);
    g.events.length = 0;

    const cam = this.cameras.main;
    g.view.hw = cam.worldView.width / 2;
    g.view.hh = cam.worldView.height / 2;
    this.flicker = Math.sin(this.time.now / 90) * 0.5 + Math.sin(this.time.now / 37) * 0.5;
    this.player.update(g);
    this.objects!.update(cam.worldView);
    this.objects!.updateOcclusion(g.player.x, g.player.y);
    this.buildingsLayer!.update(dt);
    this.enemies!.update(g, cam.worldView);
    this.syncArrows(g);
    this.drawHighlight(g);
    this.drawGhost(g);
    this.lighting!.update(g, cam.worldView, this.flicker);
    this.drawDebug(g);
    this.host.onFrame(dt, this.game.loop.actualFps);
  }

  private handleEvent(e: GameEvent): void {
    const g = this.game_!;
    switch (e.type) {
      case 'objChanged':
        this.objects?.refresh(e.id);
        this.objects?.shake(e.id);
        break;
      case 'buildChanged':
        this.buildingsLayer?.onChanged();
        break;
      case 'bagsChanged':
        this.buildingsLayer?.rebuildBags();
        break;
      case 'float':
        this.spawnFloat(e.x, e.y, e.text, e.color ?? '#ffffff');
        break;
      case 'shake':
        if (!this.host.reduceShake()) this.cameras.main.shake(120, e.strength);
        break;
      case 'swing': {
        const s = this.add.sprite(e.x, e.y, 'items', 'fx_swing_0').setDepth(g.player.y + 2).setRotation(e.angle + Math.PI / 4).setAlpha(0.85);
        let f = 0;
        this.time.addEvent({ delay: 45, repeat: 2, callback: () => { f++; if (f <= 2) s.setFrame(`fx_swing_${f}`); else s.destroy(); } });
        this.time.delayedCall(200, () => s.destroy());
        break;
      }
      case 'hitfx':
        break;
      default:
        this.host.onGameEvent(e);
    }
  }

  private spawnFloat(x: number, y: number, text: string, color: string): void {
    const t = this.add.text(x, y, text, { fontFamily: 'system-ui, sans-serif', fontSize: '11px', color, stroke: '#000', strokeThickness: 3, fontStyle: 'bold', resolution: 2 }).setOrigin(0.5, 1).setDepth(9.5e5);
    this.floats.push(t);
    this.tweens.add({ targets: t, y: y - 22, alpha: 0, duration: 1100, ease: 'Quad.easeOut', onComplete: () => { t.destroy(); this.floats = this.floats.filter((f) => f !== t); } });
  }

  private syncArrows(g: Game): void {
    while (this.arrows.length < g.projectiles.length) this.arrows.push(this.add.image(0, 0, 'items', 'i_arrow').setOrigin(0.5));
    this.arrows.forEach((a, i) => {
      const p = g.projectiles[i];
      if (!p) {
        a.setVisible(false);
        return;
      }
      // la pointe de l'icône de flèche est à gauche
      a.setVisible(true).setPosition(p.x, p.y).setRotation(Math.atan2(p.vy, p.vx) + Math.PI).setDepth(p.y + 18);
    });
  }

  private drawHighlight(g: Game): void {
    const gr = this.highlight;
    gr.clear();
    const t = g.target;
    if (!t || this.placing || this.managing || g.player.dead) return;
    const pulse = 0.6 + 0.4 * Math.sin(this.time.now / 160);
    const w = Math.max(24, t.w);
    const hgt = Math.max(24, t.h);
    const x0 = t.x - w / 2;
    const y0 = t.y - hgt / 2;
    const L = 7;
    gr.lineStyle(2, 0xf3d27a, pulse);
    for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x0 + w, y0, -1, 1], [x0, y0 + hgt, 1, -1], [x0 + w, y0 + hgt, -1, -1]]) {
      gr.beginPath();
      gr.moveTo(cx + sx * L, cy);
      gr.lineTo(cx, cy);
      gr.lineTo(cx, cy + sy * L);
      gr.strokePath();
    }
  }

  private drawGhost(g: Game): void {
    const gr = this.ghostGfx;
    gr.clear();
    if (!this.placing) {
      if (this.ghost) this.ghost.setVisible(false);
      if (this.managing) {
        // cadre autour de chaque construction gérable
        for (const b of g.world.buildings.values()) {
          const d = BUILDING_BY_ID[b.type];
          gr.lineStyle(1, 0xf3d27a, 0.8).strokeRect(b.x * TILE + 1, b.y * TILE + 1, d.w * TILE - 2, d.h * TILE - 2);
        }
      }
      return;
    }
    const { type, tx, ty } = this.placing;
    const d = BUILDING_BY_ID[type];
    if (!this.ghost) this.ghost = this.add.image(0, 0, 'world', 'fence_h');
    this.ghost.setVisible(true);
    this.buildingsLayer!.placeGhost(this.ghost, type, tx, ty);
    const ok = canPlace(g, type, tx, ty).ok;
    this.ghost.setAlpha(0.65).setTint(ok ? 0xb8ffb0 : 0xff8a80);
    gr.fillStyle(ok ? 0x6fd36a : 0xe0503c, 0.28).fillRect(tx * TILE, ty * TILE, d.w * TILE, d.h * TILE);
    gr.lineStyle(2, ok ? 0x9df08f : 0xff6b5b, 0.95).strokeRect(tx * TILE, ty * TILE, d.w * TILE, d.h * TILE);
  }

  private drawDebug(g: Game): void {
    const gr = this.debugGfx;
    gr.clear();
    if (!this.host.debug()) return;
    const p = g.player;
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor(p.y / TILE);
    for (let y = ty - 8; y <= ty + 8; y++)
      for (let x = tx - 12; x <= tx + 12; x++) {
        if (!g.world.inBounds(x, y)) continue;
        if (!g.world.passableForPlayer(x, y)) gr.fillStyle(0xff0000, 0.22).fillRect(x * TILE, y * TILE, TILE, TILE);
        else if (!g.world.passableForEnemy(x, y)) gr.fillStyle(0xffaa00, 0.22).fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    gr.lineStyle(1, 0x00ffff, 1).strokeCircle(p.x, p.y, 9);
    for (const e of g.enemies) {
      gr.lineStyle(1, e.state === 'chase' ? 0xff3333 : 0xffff00, 1).strokeCircle(e.x, e.y, 10);
      if (e.path.length) {
        gr.lineStyle(1, 0xff66ff, 0.7).beginPath();
        gr.moveTo(e.x, e.y);
        for (let i = e.pathIdx; i < e.path.length; i++) gr.lineTo((e.path[i].x + 0.5) * TILE, (e.path[i].y + 0.5) * TILE);
        gr.strokePath();
      }
    }
  }

  get stats(): { objects: number; enemiesDrawn: number } {
    return { objects: this.objects?.visibleCount ?? 0, enemiesDrawn: this.enemies?.count ?? 0 };
  }
}
