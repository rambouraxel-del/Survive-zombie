// Effets visuels : projectiles, zones (annonces au sol et sorts), télégraphes des attaques
// ennemies, effets ponctuels (étincelles, sang, magie), visée de l'ultime.
import Phaser from 'phaser';
import { ENEMIES } from '../data/enemies';
import { ULTS } from '../data/weapons';
import type { Game } from '../sim/game';
import { currentFamily } from '../sim/profile';
import type { FxKind, InputState } from '../sim/types';

const ITEM_FX: Partial<Record<FxKind, { frames: string[]; rate: number }>> = {
  spark: { frames: ['fx_spark_0', 'fx_spark_1', 'fx_spark_2', 'fx_spark_3'], rate: 24 },
  blood: { frames: ['fx_blood_0', 'fx_blood_1', 'fx_blood_2'], rate: 16 },
  poison: { frames: ['fx_poison_0', 'fx_poison_1', 'fx_poison_2', 'fx_poison_3'], rate: 14 },
  fire: { frames: ['fx_fire_0', 'fx_fire_1', 'fx_fire_2', 'fx_fire_3', 'fx_fire_4', 'fx_fire_5'], rate: 16 },
  dark: { frames: ['fx_dark_0', 'fx_dark_1', 'fx_dark_2', 'fx_dark_3'], rate: 14 },
  curse: { frames: ['fx_curse_0', 'fx_curse_1', 'fx_curse_2', 'fx_curse_3'], rate: 10 },
  ice: { frames: ['fx_ice_0', 'fx_ice_1', 'fx_ice_2', 'fx_ice_3'], rate: 14 },
  shock: { frames: ['fx_shock_0', 'fx_shock_1', 'fx_shock_2', 'fx_shock_3'], rate: 16 },
  spirit: { frames: ['fx_spirit_0', 'fx_spirit_1', 'fx_spirit_2'], rate: 10 },
  heal: { frames: ['fx_heal'], rate: 4 },
  rays: { frames: ['fx_rays_0', 'fx_rays_1', 'fx_rays_2'], rate: 12 },
  dust: { frames: ['fx_flame_0', 'fx_flame_1', 'fx_flame_2', 'fx_flame_3'], rate: 14 },
};
const SHEET_FX: Partial<Record<FxKind, { tex: string; frames: number; rate: number; tint?: number }>> = {
  firelion: { tex: 'fx_firelion', frames: 16, rate: 22 },
  iceshield: { tex: 'fx_iceshield', frames: 16, rate: 20 },
  snakebite: { tex: 'fx_snakebite', frames: 16, rate: 20 },
  torrentacle: { tex: 'fx_torrentacle', frames: 16, rate: 12, tint: 0x9a70c8 },
  turtleshell: { tex: 'fx_turtleshell', frames: 16, rate: 20, tint: 0xc8b890 },
};

export function createFxAnimations(scene: Phaser.Scene): void {
  const a = scene.anims;
  for (const [k, v] of Object.entries(ITEM_FX)) {
    if (a.exists(`fx_${k}`)) continue;
    a.create({ key: `fx_${k}`, frames: v!.frames.map((f) => ({ key: 'items', frame: f })), frameRate: v!.rate, repeat: 0 });
  }
  for (const [k, v] of Object.entries(SHEET_FX)) {
    if (a.exists(`fx_${k}`) || !scene.textures.exists(v!.tex)) continue;
    a.create({ key: `fx_${k}`, frames: a.generateFrameNumbers(v!.tex, { start: 0, end: v!.frames - 1 }), frameRate: v!.rate, repeat: 0 });
  }
  if (!a.exists('fx_tentacle_loop') && scene.textures.exists('fx_torrentacle')) a.create({ key: 'fx_tentacle_loop', frames: a.generateFrameNumbers('fx_torrentacle', { start: 4, end: 11 }), frameRate: 10, repeat: -1, yoyo: true });
}

export class Effects {
  private scene: Phaser.Scene;
  private gfx: Phaser.GameObjects.Graphics;
  private ground: Phaser.GameObjects.Graphics;
  private proj = new Map<number, Phaser.GameObjects.Sprite | Phaser.GameObjects.Image>();
  private zoneSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private rainT = 0;
  reduceFlash = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.ground = scene.add.graphics().setDepth(-99900);
    this.gfx = scene.add.graphics().setDepth(8.9e5);
  }

  spawn(kind: FxKind, x: number, y: number, scale = 1, angle = 0): void {
    const s = SHEET_FX[kind];
    if (s && this.scene.anims.exists(`fx_${kind}`)) {
      const sp = this.scene.add.sprite(x, y, s.tex, 0).setDepth(y + 40).setScale(Math.max(0.5, Math.min(2.2, scale * (s.tex === 'fx_firelion' ? 1.2 : 0.7))));
      if (s.tint) sp.setTint(s.tint);
      sp.play(`fx_${kind}`);
      sp.once('animationcomplete', () => sp.destroy());
      return;
    }
    const f = ITEM_FX[kind];
    if (!f) return;
    const sp = this.scene.add.sprite(x, y, 'items', f.frames[0]).setDepth(y + 40).setScale(Math.max(0.6, Math.min(3, scale))).setRotation(angle);
    if (kind === 'dust') sp.setTint(0xb8a080).setAlpha(0.8);
    sp.play(`fx_${kind}`);
    sp.once('animationcomplete', () => sp.destroy());
    this.scene.time.delayedCall(900, () => sp.active && sp.destroy());
  }

  update(g: Game, dt: number, input: InputState | null): void {
    const gr = this.gfx;
    const gd = this.ground;
    gr.clear();
    gd.clear();
    const now = this.scene.time.now;
    // lanternes votives : zone sûre temporaire
    const run = g.run;
    if (run) {
      for (const [key, until] of Object.entries(run.votive)) {
        if (g.clock > until) continue;
        const o = g.world.byKey.get(key);
        if (!o) continue;
        const left = until - g.clock;
        gd.lineStyle(2, 0x9fd8ff, 0.35 + (left < 10 ? 0.3 * Math.sin(now / 120) : 0)).strokeCircle((o.fx + 0.5) * 32, (o.fy + 0.5) * 32, 4 * 32);
        gd.fillStyle(0x9fd8ff, 0.06).fillCircle((o.fx + 0.5) * 32, (o.fy + 0.5) * 32, 4 * 32);
      }
    }
    // zones
    const live = new Set<number>();
    for (const z of g.zones) {
      const pre = z.t < z.delay;
      if (z.owner === 'enemy') {
        if (pre) {
          const k = z.t / Math.max(0.01, z.delay);
          gd.fillStyle(0xd83a2a, 0.12 + 0.25 * k).fillCircle(z.x, z.y, z.r * k);
          gd.lineStyle(2, 0xff5a40, 0.7 + (this.reduceFlash ? 0 : 0.3 * Math.sin(now / 70))).strokeCircle(z.x, z.y, z.r);
        }
        continue;
      }
      if (pre) {
        gd.lineStyle(2, 0xf3d27a, 0.6).strokeCircle(z.x, z.y, z.r);
        continue;
      }
      if (z.kind === 'dark') {
        gd.fillStyle(0x2a1030, 0.45).fillCircle(z.x, z.y, z.r);
        gd.lineStyle(2, 0x8a50b0, 0.6).strokeCircle(z.x, z.y, z.r);
      } else if (z.kind === 'rain') {
        gd.lineStyle(1, 0xf3d27a, 0.5).strokeCircle(z.x, z.y, z.r);
        this.rainT -= dt;
        if (this.rainT <= 0) {
          this.rainT = 0.05;
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * z.r;
          const x = z.x + Math.cos(a) * r;
          const y = z.y + Math.sin(a) * r;
          const ar = this.scene.add.image(x + 30, y - 90, 'items', 'i_arrow').setRotation(-Math.PI / 2 - 0.3).setDepth(y + 30);
          this.scene.tweens.add({ targets: ar, x, y, duration: 160, onComplete: () => ar.destroy() });
        }
      } else if (z.kind === 'tentacle') {
        live.add(z.id);
        if (!this.zoneSprites.has(z.id) && this.scene.anims.exists('fx_tentacle_loop')) {
          const sp = this.scene.add.sprite(z.x, z.y, 'fx_torrentacle', 4).setOrigin(0.5, 0.75).setTint(0x9a70c8).setScale(z.r / 60).setDepth(z.y + 1);
          sp.play('fx_tentacle_loop');
          this.zoneSprites.set(z.id, sp);
        }
        gd.fillStyle(0x301040, 0.35).fillCircle(z.x, z.y, z.r);
      }
    }
    for (const [id, sp] of this.zoneSprites) {
      if (live.has(id)) continue;
      sp.destroy();
      this.zoneSprites.delete(id);
    }
    // télégraphes des attaques ennemies
    for (const e of g.enemies) {
      const atk = e.atk;
      if (!atk || atk.phase !== 'windup' || e.dying > 0) continue;
      const d = ENEMIES[e.type];
      const a = d.attacks[atk.index];
      const k = Math.min(1, atk.t / Math.max(0.01, a.windup));
      const col = 0xff5a40;
      const alpha = 0.18 + 0.3 * k;
      switch (a.kind) {
        case 'melee':
        case 'combo': {
          const r = a.range + d.radius * 0.5 + 8;
          const ang = Math.atan2(atk.dy, atk.dx);
          gd.fillStyle(col, alpha);
          gd.slice(e.x, e.y - 4, r * (0.4 + 0.6 * k), ang - 0.9, ang + 0.9, false).fillPath();
          break;
        }
        case 'slam': {
          const cx = e.x + atk.dx * a.range * 0.55;
          const cy = e.y + atk.dy * a.range * 0.55;
          gd.fillStyle(col, alpha).fillCircle(cx, cy, (a.radius ?? 40) * k);
          gd.lineStyle(2, col, 0.8).strokeCircle(cx, cy, a.radius ?? 40);
          break;
        }
        case 'leap':
          gd.lineStyle(3, col, 0.5 + 0.4 * k).lineBetween(e.x, e.y, atk.tx, atk.ty);
          gd.lineStyle(2, col, 0.8).strokeCircle(atk.tx, atk.ty, a.radius ?? 26);
          break;
        case 'charge': {
          const len = a.range;
          const w = (a.radius ?? 22) + d.radius;
          const ang = Math.atan2(atk.dy, atk.dx);
          const c = Math.cos(ang);
          const s = Math.sin(ang);
          const pts = [
            new Phaser.Math.Vector2(e.x - s * w, e.y + c * w),
            new Phaser.Math.Vector2(e.x + c * len * k - s * w, e.y + s * len * k + c * w),
            new Phaser.Math.Vector2(e.x + c * len * k + s * w, e.y + s * len * k - c * w),
            new Phaser.Math.Vector2(e.x + s * w, e.y - c * w),
          ];
          gd.fillStyle(col, alpha).fillPoints(pts, true);
          break;
        }
        case 'shoot':
        case 'spit': {
          const ang = Math.atan2(atk.ty - e.y, atk.tx - e.x);
          gd.lineStyle(2, col, 0.35 + 0.5 * k).lineBetween(e.x, e.y - 20, e.x + Math.cos(ang) * a.range, e.y - 20 + Math.sin(ang) * a.range);
          break;
        }
        default:
          break;
      }
    }
    // visée manuelle de l'ultime
    if (input?.ultAiming && !g.player.dead) {
      const f = currentFamily(g);
      if (f) {
        const u = ULTS[f];
        const p = g.player;
        let vx = input.ultX;
        let vy = input.ultY;
        const len = Math.hypot(vx, vy);
        if (len > 1) {
          vx /= len;
          vy /= len;
        }
        const ready = g.ult >= 100;
        const col = ready ? 0xffd86a : 0x9a9a9a;
        if (u.aim === 'point') {
          const tx = p.x + vx * u.range;
          const ty = p.y + vy * u.range;
          gr.lineStyle(1, col, 0.4).strokeCircle(p.x, p.y, u.range);
          gr.fillStyle(col, 0.18).fillCircle(tx, ty, u.radius);
          gr.lineStyle(2, col, 0.9).strokeCircle(tx, ty, u.radius);
        } else {
          const l = Math.max(0.25, Math.hypot(vx, vy));
          const dx = vx / (Math.hypot(vx, vy) || 1);
          const dy = vy / (Math.hypot(vx, vy) || 1);
          gr.lineStyle(u.radius, col, 0.25).lineBetween(p.x, p.y - 12, p.x + dx * u.range * l, p.y - 12 + dy * u.range * l);
          gr.lineStyle(2, col, 0.9).lineBetween(p.x, p.y - 12, p.x + dx * u.range * l, p.y - 12 + dy * u.range * l);
        }
      }
    }
    this.syncProjectiles(g);
  }

  private syncProjectiles(g: Game): void {
    const seen = new Set<number>();
    for (const pr of g.projectiles) {
      seen.add(pr.id);
      let s = this.proj.get(pr.id);
      if (!s) {
        switch (pr.kind) {
          case 'fire':
            s = this.scene.add.sprite(pr.x, pr.y, 'items', 'fx_fire_0').play({ key: 'fx_fire', repeat: -1 }).setScale(pr.aoe ? 1.4 : 0.9);
            break;
          case 'shadow':
            s = this.scene.add.sprite(pr.x, pr.y, 'items', 'fx_dark_0').play({ key: 'fx_dark', repeat: -1 });
            break;
          case 'ice':
            s = this.scene.add.sprite(pr.x, pr.y, 'items', 'fx_ice_0').play({ key: 'fx_ice', repeat: -1 });
            break;
          case 'spit':
            s = this.scene.add.sprite(pr.x, pr.y, 'items', 'fx_poison_0').play({ key: 'fx_poison', repeat: -1 });
            break;
          case 'bomb':
            s = this.scene.add.image(pr.x, pr.y, 'items', 'i_bomb');
            break;
          default: {
            s = this.scene.add.image(pr.x, pr.y, 'items', 'i_arrow').setOrigin(0.5);
            if (pr.kind === 'bolt') s.setTint(0xbcc6d0).setScale(1.1, 0.9);
            if (pr.kind === 'enemy_arrow') s.setTint(0xff9a80);
          }
        }
        this.proj.set(pr.id, s);
      }
      s.setPosition(pr.x, pr.y).setDepth(pr.y + 18);
      if (pr.kind === 'arrow' || pr.kind === 'bolt' || pr.kind === 'enemy_arrow') s.setRotation(Math.atan2(pr.vy, pr.vx) + Math.PI);
    }
    for (const [id, s] of this.proj) {
      if (seen.has(id)) continue;
      s.destroy();
      this.proj.delete(id);
    }
  }

  destroy(): void {
    for (const s of this.proj.values()) s.destroy();
    for (const s of this.zoneSprites.values()) s.destroy();
    this.proj.clear();
    this.zoneSprites.clear();
    this.gfx.destroy();
    this.ground.destroy();
  }
}
