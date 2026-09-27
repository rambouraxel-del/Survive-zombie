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
/** images du corps (ligne « slash ») pour le geste d'outil, d'après le générateur LPC
 * (animations « tool_axe » et « tool_hammer ») */
export const CHOP_FRAMES = [5, 5, 4, 4, 3, 1, 0, 0, 0, 0];
const CHOP_FRAMES_HAMMER = [5, 5, 4, 4, 1, 0, 0, 0, 0, 0];

/** Objet du jeu -> calque d'équipement (public/assets/chars/equip.json) */
export const EQUIP_LOOK: Record<string, string> = {
  stone_axe: 'axe', iron_axe: 'axe', stone_hammer: 'hammer', iron_pick: 'pick',
  spear: 'spear', club: 'club', sword: 'sword', bow: 'bow', gambison: 'leather', brigandine: 'plate',
};
const ANIM_OF_ROW = (row: number): [string, number] | null => {
  if (row < 4) return ['walk', row];
  if (row < 8) return ['slash', row - 4];
  if (row < 12) return ['thrust', row - 8];
  if (row < 16) return ['shoot', row - 12];
  if (row === 16) return ['hurt', 0];
  return null;
};

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
  // geste de bûcheron / carrier : même enchaînement d'images du corps que l'animation
  // « tool_axe » du générateur LPC (lever l'outil puis frapper)
  for (const d of dirs) {
    const start = (4 + DIR_ROW[d]) * SHEET_COLS.player;
    add(`player_chop_${d}`, 'player', CHOP_FRAMES.map((f) => start + f), 25, 0);
    add(`player_chophammer_${d}`, 'player', CHOP_FRAMES_HAMMER.map((f) => start + f), 25, 0);
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
  /** calques d'équipement : derrière le corps, protection, devant, flèche */
  private layers: Record<'bg' | 'body' | 'fg' | 'arrow', Phaser.GameObjects.Image>;
  private hasEquip: boolean;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.sprite = scene.add.sprite(0, 0, 'player', 0).setOrigin(0.5, FOOT);
    this.hasEquip = scene.textures.exists('equip');
    const mk = () => scene.add.image(0, 0, this.hasEquip ? 'equip' : 'player').setVisible(false);
    this.layers = { bg: mk(), body: mk(), fg: mk(), arrow: mk() };
  }

  update(g: Game): void {
    const p = g.player;
    const s = this.sprite;
    s.setPosition(Math.round(p.x), Math.round(p.y));
    s.setDepth(p.y);
    let anim: string;
    const held = this.heldItem(g);
    if (p.dead) anim = 'player_die';
    else if (p.actionT > 0 && p.action === 'chop') anim = `player_${EQUIP_LOOK[held ?? ''] === 'hammer' ? 'chophammer' : 'chop'}_${p.facing}`;
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
    const alpha = p.dodgeT > 0 ? 0.6 : blink ? 0.45 : 1;
    s.setAlpha(alpha);
    this.syncEquipment(g, held, alpha);
  }

  /** Objet réellement en main : celui de l'action en cours, sinon l'arme, sinon l'outil. */
  private heldItem(g: Game): string | null {
    const p = g.player;
    if (p.actionT > 0 && p.action !== 'none') return p.actionItem;
    const w = p.equip.weapon;
    if (w) return w.id;
    const t = p.equip.tool;
    if (t && EQUIP_LOOK[t.id]) return t.id;
    return null;
  }

  private syncEquipment(g: Game, held: string | null, alpha: number): void {
    const L = this.layers;
    if (!this.hasEquip) return;
    const p = g.player;
    const tf = this.sprite.anims.currentFrame?.textureFrame ?? this.sprite.frame.name;
    const n = Number(tf);
    const row = Math.floor(n / SHEET_COLS.player);
    const col = n % SHEET_COLS.player;
    const ad = ANIM_OF_ROW(row);
    const tex = this.scene.textures.get('equip');
    const put = (img: Phaser.GameObjects.Image, key: string | null, depth: number) => {
      if (!key || !tex.has(key)) {
        img.setVisible(false);
        return;
      }
      if (img.frame.name !== key) {
        img.setFrame(key);
        // cellule d'origine (64, 128 ou 192 px) centrée sur la cellule 64 px du corps
        const cell = img.frame.realHeight;
        img.setOrigin(0.5, (FOOT * 64 + (cell - 64) / 2) / cell);
      }
      img.setVisible(true).setPosition(this.sprite.x, this.sprite.y).setDepth(depth).setAlpha(alpha);
    };
    if (!ad) {
      for (const img of Object.values(L)) img.setVisible(false);
      return;
    }
    const [anim, d] = ad;
    const look = !p.dead && held ? EQUIP_LOOK[held] : undefined;
    const armor = p.equip.armor && p.equip.armor.dur !== 0 ? EQUIP_LOOK[p.equip.armor.id] : undefined;
    const k = `${anim}|${d}|${col}`;
    put(L.bg, look ? `${look}|bg|${k}` : null, p.y - 0.02);
    put(L.body, armor ? `${armor}|body|${k}` : null, p.y + 0.01);
    put(L.fg, look ? `${look}|fg|${k}` : null, p.y + 0.02);
    put(L.arrow, look === 'bow' && anim === 'shoot' ? `arrow|fg|${k}` : null, p.y + 0.03);
  }
}

interface EView {
  sprite: Phaser.GameObjects.Sprite;
  alert: Phaser.GameObjects.Image;
  anim: string;
  spotUntil: number;
}

export class EnemyViews {
  private scene: Phaser.Scene;
  private views = new Map<number, EView>();
  private spotted = new Map<number, number>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Le zombie vient de vous repérer : « ! » bref au-dessus de lui. */
  spot(id: number): void {
    const until = this.scene.time.now + 900;
    this.spotted.set(id, until);
    const v = this.views.get(id);
    if (v) v.spotUntil = until;
    if (this.spotted.size > 60) this.spotted.clear();
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
        v = { sprite, alert, anim: '', spotUntil: this.spotted.get(e.id) ?? 0 };
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
      const spot = v.spotUntil > this.scene.time.now;
      v.alert.setVisible(spot);
      if (spot) v.alert.setPosition(s.x, s.y - (e.type === 'brute' ? 62 : 56)).setDepth(e.y + 1).setScale(0.8);
    }
    if (e.windup > 0) v.alert.setScale(1);
  }

  get count(): number {
    return this.views.size;
  }
}
