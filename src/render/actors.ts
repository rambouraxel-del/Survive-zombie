// Personnages : animations LPC (marche, attaque, estoc, tir, chute).
import Phaser from 'phaser';
import type { Game } from '../sim/game';
import type { Enemy, Facing } from '../sim/types';
import { ENEMIES } from '../data/enemies';

const DIR_ROW: Record<Facing, number> = { up: 0, left: 1, down: 2, right: 3 };
const FOOT = 0.94; // position des pieds dans la cellule 64×64

const PLAYER_ANIMS: [string, number, number][] = [
  // nom, première ligne, colonnes
  ['walk', 0, 9],
  ['slash', 4, 6],
  ['thrust', 8, 8],
  ['shoot', 12, 13],
];
const SHEET_COLS: Record<string, number> = { player: 13, rodeur: 9, affame: 9, brute: 9 };

export function createAnimations(scene: Phaser.Scene): void {
  const a = scene.anims;
  const dirs: Facing[] = ['up', 'left', 'down', 'right'];
  const add = (key: string, tex: string, frames: number[], rate: number, repeat: number) => {
    if (a.exists(key)) return;
    a.create({ key, frames: frames.map((f) => ({ key: tex, frame: f })), frameRate: rate, repeat });
  };
  // joueur
  for (const d of dirs) {
    const cols = SHEET_COLS.player;
    for (const [name, row0, n] of PLAYER_ANIMS) {
      const row = row0 + DIR_ROW[d];
      const start = row * cols;
      if (name === 'walk') {
        add(`player_walk_${d}`, 'player', Array.from({ length: 8 }, (_, i) => start + 1 + i), 11, -1);
        add(`player_idle_${d}`, 'player', [start], 1, 0);
      } else add(`player_${name}_${d}`, 'player', Array.from({ length: n }, (_, i) => start + i), name === 'shoot' ? 26 : 18, 0);
    }
  }
  add('player_die', 'player', Array.from({ length: 6 }, (_, i) => 16 * SHEET_COLS.player + i), 8, 0);
  // zombies
  for (const t of ['rodeur', 'affame', 'brute'] as const) {
    const cols = SHEET_COLS[t];
    for (const d of dirs) {
      const w = DIR_ROW[d] * cols;
      add(`${t}_walk_${d}`, t, Array.from({ length: 8 }, (_, i) => w + 1 + i), ENEMIES[t].animSpeed, -1);
      add(`${t}_idle_${d}`, t, [w], 1, 0);
      const s = (4 + DIR_ROW[d]) * cols;
      add(`${t}_slash_${d}`, t, Array.from({ length: 6 }, (_, i) => s + i), 12, 0);
    }
    add(`${t}_die`, t, Array.from({ length: 6 }, (_, i) => 8 * cols + i), 9, 0);
  }
}

export class PlayerView {
  sprite: Phaser.GameObjects.Sprite;
  private scene: Phaser.Scene;
  private lastAnim = '';

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.sprite = scene.add.sprite(0, 0, 'player', 0).setOrigin(0.5, FOOT);
  }

  update(g: Game): void {
    const p = g.player;
    const s = this.sprite;
    s.setPosition(Math.round(p.x), Math.round(p.y));
    s.setDepth(p.y);
    let anim: string;
    if (p.dead) anim = 'player_die';
    else if (p.actionT > 0 && p.action !== 'none') anim = `player_${p.action}_${p.facing}`;
    else if (p.moving || p.dodgeT > 0) anim = `player_walk_${p.facing}`;
    else anim = `player_idle_${p.facing}`;
    if (anim !== this.lastAnim) {
      s.play(anim, true);
      this.lastAnim = anim;
    }
    if (anim.startsWith('player_walk')) s.anims.timeScale = p.sprinting ? 1.5 : 1;
    // clignotement pendant l'invulnérabilité
    const blink = p.invuln > 0 && !p.dead && Math.floor(p.invuln * 12) % 2 === 0;
    s.setAlpha(p.dodgeT > 0 ? 0.6 : blink ? 0.45 : 1);
    void this.scene;
  }
}

interface EView {
  sprite: Phaser.GameObjects.Sprite;
  alert: Phaser.GameObjects.Image;
  anim: string;
}

export class EnemyViews {
  private scene: Phaser.Scene;
  private views = new Map<number, EView>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  update(g: Game, view: Phaser.Geom.Rectangle): void {
    const seen = new Set<number>();
    for (const e of g.enemies) {
      // culling : on ne dessine que les ennemis proches de l'écran
      if (e.x < view.x - 96 || e.x > view.right + 96 || e.y < view.y - 64 || e.y > view.bottom + 128) continue;
      seen.add(e.id);
      let v = this.views.get(e.id);
      if (!v) {
        const sprite = this.scene.add.sprite(e.x, e.y, e.type, 0).setOrigin(0.5, FOOT);
        const alert = this.scene.add.image(e.x, e.y - 60, 'items', 'fx_alert').setOrigin(0.5, 1).setVisible(false);
        v = { sprite, alert, anim: '' };
        this.views.set(e.id, v);
      }
      this.sync(e, v);
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      v.sprite.destroy();
      v.alert.destroy();
      this.views.delete(id);
    }
  }

  private sync(e: Enemy, v: EView): void {
    const s = v.sprite;
    s.setPosition(Math.round(e.x), Math.round(e.y));
    s.setDepth(e.y);
    let anim: string;
    if (e.dying > 0) anim = `${e.type}_die`;
    else if (e.windup > 0) anim = `${e.type}_slash_${e.facing}`;
    else if (e.moving) anim = `${e.type}_walk_${e.facing}`;
    else anim = `${e.type}_idle_${e.facing}`;
    if (anim !== v.anim) {
      s.play(anim, true);
      v.anim = anim;
    }
    // attaque annoncée : teinte rouge clignotante + « ! »
    if (e.dying > 0) {
      s.clearTint();
      s.setAlpha(Math.min(1, e.dying / 0.5));
      v.alert.setVisible(false);
    } else if (e.hurtT > 0) {
      s.setTintFill(0xffffff);
      v.alert.setVisible(false);
    } else if (e.windup > 0) {
      const flash = Math.floor(e.windup * 14) % 2 === 0;
      if (flash) s.setTint(0xff6a5a);
      else s.clearTint();
      v.alert.setVisible(true).setPosition(s.x, s.y - (e.type === 'brute' ? 62 : 56)).setDepth(e.y + 1);
    } else {
      s.clearTint();
      s.setAlpha(1);
      v.alert.setVisible(false);
    }
  }

  get count(): number {
    return this.views.size;
  }
}
