// Scène principale : fait avancer la simulation à pas fixe et synchronise le rendu.
// Chaque carte (camp, maison, région, donjon) reconstruit ses calques à la transition ;
// les anciens objets graphiques sont détruits.
import Phaser from 'phaser';
import { MAX_FRAME_DELTA, SIM_STEP, TILE } from '../config/balance';
import { BUILDING_BY_ID } from '../data/buildings';
import type { Game } from '../sim/game';
import type { GameEvent, InputState } from '../sim/types';
import { canPlace } from '../sim/actions';
import { createAnimations, EnemyViews, HUMAN_TEXTURES, PlayerView } from './actors';
import { BuildingLayer } from './buildings';
import { Lighting } from './lighting';
import { ObjectLayer } from './objects';
import { buildTerrain, type TerrainLayers } from './terrain';
import { SOUND_KEYS } from '../audio/audio';
import { perf } from './perf';
import { createFxAnimations, Effects } from './effects';
import { ENEMIES } from '../data/enemies';

export interface SceneHost {
  isSimPaused(): boolean;
  pollInput(): InputState;
  aimInput(): InputState | null;
  onGameEvent(e: GameEvent): void;
  onFrame(dt: number, fps: number): void;
  onLoadProgress(p: number): void;
  onSceneReady(scene: WorldScene): void;
  onPlacementPointer(tx: number, ty: number): void;
  onManagePointer(tx: number, ty: number): void;
  onWorldTap(wx: number, wy: number): void;
  reduceShake(): boolean;
  reduceFlash(): boolean;
  debug(): boolean;
}

export class WorldScene extends Phaser.Scene {
  host!: SceneHost;
  game_: Game | null = null;
  private acc = 0;
  terrain: TerrainLayers | null = null;
  objects: ObjectLayer | null = null;
  buildingsLayer: BuildingLayer | null = null;
  private player: PlayerView | null = null;
  private enemies: EnemyViews | null = null;
  private lighting: Lighting | null = null;
  private effects: Effects | null = null;
  private highlight!: Phaser.GameObjects.Graphics;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private floats: Phaser.GameObjects.Text[] = [];
  private floatPool: Phaser.GameObjects.Text[] = [];
  private targetLabel!: Phaser.GameObjects.Text;
  private threats: { x: number; y: number; t: number; kind: 'sound' | 'seen' }[] = [];
  private threatIcons: Phaser.GameObjects.Image[] = [];
  ghost: Phaser.GameObjects.Image | null = null;
  private ghostGfx!: Phaser.GameObjects.Graphics;
  private flashRect: Phaser.GameObjects.Rectangle | null = null;
  placing: { type: string; tx: number; ty: number; moving?: number } | null = null;
  managing = false;
  private flicker = 0;
  private mapKey = '';

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
    this.load.atlas('props', 'assets/atlas/props.png', 'assets/atlas/props.json');
    this.load.json('offsets', 'assets/atlas/offsets.json');
    for (const t of ['terrain_summer', 'terrain_autumn', 'castlewalls', 'castlefloors', 'dungeon', 'cliff_summer', 'interior']) this.load.image(t, `assets/tiles/${t}.png`);
    for (const c of HUMAN_TEXTURES) this.load.spritesheet(c, `assets/chars/${c}.png`, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('rodeur', 'assets/chars/rodeur.png', { frameWidth: 64, frameHeight: 64 });
    const creature: Record<string, string> = { rat: 'rat', fox_arctic: 'fox_arctic', fox_woods: 'fox_woods', deer: 'deer', bear_black: 'bear_black', bear_grizzly: 'bear_grizzly', ghost: 'ghost', worm: 'worm', flower: 'flower' };
    for (const d of Object.values(ENEMIES)) {
      const sp = d.sprite;
      if (creature[sp.tex] && !this.textures.exists(sp.tex)) this.load.spritesheet(sp.tex, `assets/chars/${creature[sp.tex]}.png`, { frameWidth: sp.fw, frameHeight: sp.fh });
    }
    this.load.spritesheet('fx_firelion', 'assets/fx/firelion.png', { frameWidth: 64, frameHeight: 64 });
    for (const f of ['iceshield', 'snakebite', 'torrentacle', 'turtleshell']) this.load.spritesheet(`fx_${f}`, `assets/fx/${f}.png`, { frameWidth: 128, frameHeight: 128 });
    this.load.atlas('equip', 'assets/chars/equip.png', 'assets/chars/equip.json');
    for (const k of SOUND_KEYS) this.load.audio(k, `assets/audio/${k}.mp3`);
  }

  create(): void {
    createAnimations(this);
    createFxAnimations(this);
    this.highlight = this.add.graphics().setDepth(9.2e5);
    this.targetLabel = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: '#fff4d0', stroke: '#1b1712', strokeThickness: 3, fontStyle: 'bold', resolution: 3 }).setOrigin(0.5, 1).setDepth(9.3e5).setVisible(false);
    this.debugGfx = this.add.graphics().setDepth(8.5e5);
    this.ghostGfx = this.add.graphics().setDepth(2.1e5);
    this.cameras.main.setBackgroundColor('#110d0a');
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointer(p, true));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown || !p.wasTouch) this.onPointer(p, false);
    });
    this.scale.on('resize', () => this.applyZoom());
    let r0 = 0;
    this.game.events.on('prerender', () => (r0 = performance.now()));
    this.game.events.on('postrender', () => {
      perf.add('render', performance.now() - r0);
      perf.add('frame', this.frameMs);
      perf.commit();
    });
    this.host.onSceneReady(this);
  }

  private onPointer(p: Phaser.Input.Pointer, down: boolean): void {
    if (!this.game_) return;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const offY = p.wasTouch ? 1.6 * TILE : 0;
    if (this.placing) {
      const d = BUILDING_BY_ID[this.placing.type];
      const tx = Math.floor(wp.x / TILE - (d.w - 1) / 2);
      const ty = Math.floor((wp.y - offY) / TILE - (d.h - 1) / 2);
      this.host.onPlacementPointer(tx, ty);
    } else if (this.managing && down) this.host.onManagePointer(Math.floor(wp.x / TILE), Math.floor(wp.y / TILE));
    else if (down) this.host.onWorldTap(wp.x, wp.y);
  }

  private insets = { top: 0, bottom: 0 };

  setViewInsets(top: number, bottom: number): void {
    this.insets = { top, bottom };
    this.applyFollowOffset();
  }

  private applyFollowOffset(): void {
    const cam = this.cameras.main;
    const cssH = window.innerHeight;
    const freeCenter = (this.insets.top + (cssH - this.insets.bottom)) / 2;
    const deltaCss = cssH / 2 - freeCenter;
    const cssToWorld = this.scale.height / cssH / cam.zoom;
    cam.setFollowOffset(0, -deltaCss * cssToWorld);
  }

  /** Zoom choisi pour chaque carte (nombre de tuiles visibles), jamais modifiable en jeu. */
  applyZoom(): void {
    const cam = this.cameras.main;
    const w = this.scale.width;
    const h = this.scale.height;
    const tiles = this.game_?.world.def.viewTiles ?? 11.5;
    const z = Math.max(1, Math.round(Math.min(w, h) / (TILE * tiles)));
    cam.setZoom(z);
    cam.setRoundPixels(true);
    this.applyFollowOffset();
  }

  setGame(g: Game): void {
    this.game_ = g;
    this.buildMap();
  }

  /** (Re)construit les calques de la carte courante ; détruit ceux de la précédente. */
  private buildMap(): void {
    const g = this.game_!;
    this.clearWorld();
    this.mapKey = g.mapId;
    this.acc = 0;
    this.terrain = buildTerrain(this, g.world);
    this.objects = new ObjectLayer(this, g.world);
    this.buildingsLayer = new BuildingLayer(this, g);
    this.player = new PlayerView(this);
    this.enemies = new EnemyViews(this);
    this.effects = new Effects(this);
    this.lighting = new Lighting(this);
    this.flashRect = this.add.rectangle(0, 0, 10, 10, 0xffffff, 0).setOrigin(0, 0).setDepth(9.6e5).setScrollFactor(0);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, g.world.w * TILE, g.world.h * TILE);
    this.applyZoom();
    this.player.update(g, this.host.reduceFlash());
    cam.startFollow(this.player.sprite, true, 0.16, 0.16);
    cam.centerOn(g.player.x, g.player.y);
    this.objects.update(cam.worldView);
  }

  clearWorld(): void {
    this.tweens.killAll();
    this.time.removeAllEvents();
    const keep = new Set<unknown>([this.highlight, this.debugGfx, this.ghostGfx, this.targetLabel]);
    for (const o of [...this.children.list]) if (!keep.has(o)) o.destroy();
    this.terrain?.map.destroy();
    this.floatPool = [];
    this.floats = [];
    this.threatIcons = [];
    this.threats = [];
    this.targetLabel?.setVisible(false);
    this.terrain = null;
    this.objects = null;
    this.buildingsLayer = null;
    this.player = null;
    this.enemies = null;
    this.lighting = null;
    this.effects = null;
    this.ghost = null;
    this.highlight?.clear();
    this.ghostGfx?.clear();
  }

  private frameMs = 0;

  update(_time: number, deltaMs: number): void {
    const g = this.game_;
    const dt = Math.min(deltaMs / 1000, MAX_FRAME_DELTA);
    this.frameMs = deltaMs;
    if (!g || !this.player) return;
    const t0 = performance.now();
    if (!this.host.isSimPaused()) {
      this.acc += dt;
      const input = this.host.pollInput();
      let steps = 0;
      while (this.acc >= SIM_STEP && steps < 10) {
        g.step(SIM_STEP, input);
        this.acc -= SIM_STEP;
        steps++;
        if (g.mapId !== this.mapKey) break;
      }
      if (steps >= 10) this.acc = 0;
      perf.steps += steps;
    } else this.acc = 0;
    const t1 = performance.now();
    perf.add('sim', t1 - t0);

    for (const e of g.events) this.handleEvent(e);
    g.events.length = 0;
    if (g.mapId !== this.mapKey || !this.player) {
      this.buildMap();
      return;
    }

    const cam = this.cameras.main;
    g.view.hw = cam.worldView.width / 2;
    g.view.hh = cam.worldView.height / 2;
    this.flicker = Math.sin(this.time.now / 90) * 0.5 + Math.sin(this.time.now / 37) * 0.5;
    const rf = this.host.reduceFlash();
    this.player.update(g, rf);
    this.objects!.update(cam.worldView);
    this.objects!.updateOcclusion(g.player.x, g.player.y);
    this.buildingsLayer!.update(dt);
    this.enemies!.reduceFlash = rf;
    this.enemies!.update(g, cam.worldView);
    this.effects!.reduceFlash = rf;
    this.effects!.update(g, dt, this.host.aimInput());
    this.drawHighlight(g);
    this.drawThreats(g);
    this.drawGhost(g);
    this.lighting!.update(g, cam.worldView, this.flicker);
    this.drawDebug(g);
    if (this.flashRect && this.flashRect.fillAlpha > 0) {
      this.flashRect.setSize(this.scale.width / cam.zoom + 20, this.scale.height / cam.zoom + 20);
      this.flashRect.setFillStyle(this.flashRect.fillColor, Math.max(0, this.flashRect.fillAlpha - dt * 2.5));
    }
    const t2 = performance.now();
    perf.add('scene', t2 - t1);
    this.host.onFrame(dt, this.game.loop.actualFps);
    perf.add('ui', performance.now() - t2);
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
      case 'terrainChanged':
        if (this.terrain) {
          this.terrain.map.destroy();
          this.terrain.voidGfx.destroy();
          for (const b of this.terrain.bridges) b.destroy();
          this.terrain = buildTerrain(this, g.world);
        }
        break;
      case 'mapChanged':
        this.mapKey = '';
        this.host.onGameEvent(e);
        break;
      case 'float':
        this.spawnFloat(e.x, e.y, e.text, e.color ?? '#ffffff');
        break;
      case 'shake':
        if (!this.host.reduceShake()) this.cameras.main.shake(120, e.strength);
        break;
      case 'flash':
        if (!this.host.reduceFlash() && this.flashRect) this.flashRect.setFillStyle(e.color, 0.18);
        break;
      case 'fx':
        this.effects?.spawn(e.kind, e.x, e.y, e.scale ?? 1, e.angle ?? 0);
        break;
      case 'swing': {
        const s = this.add.sprite(e.x, e.y, 'items', 'fx_swing_0').setDepth(g.player.y + 2).setRotation(e.angle + Math.PI / 4).setAlpha(0.85);
        let f = 0;
        this.time.addEvent({ delay: 45, repeat: 2, callback: () => { f++; if (f <= 2) s.setFrame(`fx_swing_${f}`); else s.destroy(); } });
        this.time.delayedCall(200, () => s.active && s.destroy());
        break;
      }
      case 'harvestHit':
        break;
      case 'spotted':
        this.enemies?.spot(e.enemyId);
        break;
      case 'threat':
        this.threats.push({ x: e.x, y: e.y, t: this.time.now, kind: e.kind });
        if (this.threats.length > 12) this.threats.shift();
        break;
      default:
        this.host.onGameEvent(e);
    }
  }

  private spawnFloat(x: number, y: number, text: string, color: string): void {
    let t = this.floatPool.pop();
    if (t) t.setText(text).setColor(color).setPosition(x, y).setAlpha(1).setVisible(true);
    else t = this.add.text(x, y, text, { fontFamily: 'system-ui, sans-serif', fontSize: '11px', color, stroke: '#000', strokeThickness: 3, fontStyle: 'bold', resolution: 2 }).setOrigin(0.5, 1).setDepth(9.5e5);
    const tt = t;
    this.floats.push(tt);
    this.tweens.add({ targets: tt, y: y - 22, alpha: 0, duration: 1000, ease: 'Quad.easeOut', onComplete: () => {
      tt.setVisible(false);
      this.floats = this.floats.filter((f) => f !== tt);
      if (this.floatPool.length < 30) this.floatPool.push(tt);
      else tt.destroy();
    } });
  }

  private drawHighlight(g: Game): void {
    const gr = this.highlight;
    gr.clear();
    const t = g.target;
    if (!t || this.placing || this.managing || g.player.dead) {
      this.targetLabel.setVisible(false);
      return;
    }
    const pulse = 0.6 + 0.4 * Math.sin(this.time.now / 160);
    const w = Math.max(24, t.w);
    const hgt = Math.max(24, t.h);
    const x0 = t.x - w / 2;
    const y0 = t.y - hgt / 2;
    const L = 7;
    const col = t.empty ? 0xb9ad96 : 0xf3d27a;
    gr.lineStyle(2, col, t.empty ? 0.6 : pulse);
    for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x0 + w, y0, -1, 1], [x0, y0 + hgt, 1, -1], [x0 + w, y0 + hgt, -1, -1]]) {
      gr.beginPath();
      gr.moveTo(cx + sx * L, cy);
      gr.lineTo(cx, cy);
      gr.lineTo(cx, cy + sy * L);
      gr.strokePath();
    }
    let top = y0 - 3;
    if (t.kind === 'harvest' && t.objId !== undefined) {
      const o = g.world.objects[t.objId];
      const max = o.maxHp ?? 1;
      if (max > 1) {
        const r = Math.max(0, (o.hp ?? max) / max);
        const bw = Math.min(40, Math.max(24, w - 8));
        gr.fillStyle(0x000000, 0.6).fillRect(t.x - bw / 2, top - 5, bw, 5);
        gr.fillStyle(0xd9f7a6, 1).fillRect(t.x - bw / 2 + 1, top - 4, (bw - 2) * r, 3);
        top -= 7;
      }
    }
    if (this.targetLabel.text !== t.name) this.targetLabel.setText(t.name);
    this.targetLabel.setVisible(true).setPosition(Math.round(t.x), Math.round(top));
  }

  /** Danger hors de vue : repère discret au bord de l'écran, dans sa direction. */
  private drawThreats(g: Game): void {
    const now = this.time.now;
    this.threats = this.threats.filter((t) => now - t.t < 1800);
    const view = this.cameras.main.worldView;
    const p = g.player;
    const dark = g.world.def.light.darkness > 0.5;
    let n = 0;
    for (const t of this.threats) {
      const inView = t.x > view.x + 8 && t.x < view.right - 8 && t.y > view.y + 8 && t.y < view.bottom - 8;
      const far = Math.hypot(t.x - p.x, t.y - p.y) > 6 * TILE;
      if (inView && !(dark && far)) continue;
      const ang = Math.atan2(t.y - p.y, t.x - p.x);
      const hw = view.width / 2 - 18;
      const hh = view.height / 2 - 22;
      const k = Math.min(hw / Math.abs(Math.cos(ang) || 1e-6), hh / Math.abs(Math.sin(ang) || 1e-6));
      const cx = view.centerX + Math.cos(ang) * k;
      const cy = view.centerY + Math.sin(ang) * k;
      let img = this.threatIcons[n];
      if (!img) {
        img = this.add.image(0, 0, 'items', 'fx_alert').setDepth(9.4e5);
        this.threatIcons[n] = img;
      }
      const life = 1 - (now - t.t) / 1800;
      img.setVisible(true).setPosition(cx, cy + 8).setAlpha(Math.min(1, life * 1.6) * (t.kind === 'seen' ? 0.95 : 0.7)).setScale(t.kind === 'seen' ? 0.9 : 0.7);
      n++;
      if (n >= 4) break;
    }
    for (let i = n; i < this.threatIcons.length; i++) this.threatIcons[i].setVisible(false);
  }

  private drawGhost(g: Game): void {
    const gr = this.ghostGfx;
    gr.clear();
    if (!this.placing) {
      if (this.ghost) this.ghost.setVisible(false);
      if (this.managing) {
        for (const b of g.world.buildings.values()) {
          const d = BUILDING_BY_ID[b.type];
          gr.lineStyle(1, 0xf3d27a, 0.8).strokeRect(b.x * TILE + 1, b.y * TILE + 1, d.w * TILE - 2, d.h * TILE - 2);
        }
      }
      return;
    }
    const { type, tx, ty, moving } = this.placing;
    const d = BUILDING_BY_ID[type];
    if (!this.ghost) this.ghost = this.add.image(0, 0, 'world', 'fence_h');
    this.ghost.setVisible(true);
    this.buildingsLayer!.placeGhost(this.ghost, type, tx, ty);
    const ok = canPlace(g, type, tx, ty, moving !== undefined ? g.world.buildings.get(moving) : undefined).ok;
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
    for (let y = ty - 9; y <= ty + 9; y++)
      for (let x = tx - 14; x <= tx + 14; x++) {
        if (!g.world.inBounds(x, y)) continue;
        if (!g.world.passableForPlayer(x, y)) gr.fillStyle(0xff0000, 0.22).fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    gr.lineStyle(1, 0x00ffff, 1).strokeCircle(p.x, p.y, 9);
    for (const e of g.enemies) {
      gr.lineStyle(1, e.state === 'chase' ? 0xff3333 : 0xffff00, 1).strokeCircle(e.x, e.y, ENEMIES[e.type].radius);
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
