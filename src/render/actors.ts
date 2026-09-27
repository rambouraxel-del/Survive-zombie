// Personnages : joueur et humanoïdes (feuilles LPC + calques d'équipement), créatures (feuilles
// FreedomValley / LPC), invocations. Chaque attaque ennemie est annoncée (teinte, « ! »).
import Phaser from 'phaser';
import type { Game } from '../sim/game';
import type { Ally, Enemy, Facing } from '../sim/types';
import { ENEMIES, type EnemyType, type SpriteDef } from '../data/enemies';
import { item } from '../data/items';
import { lookOf } from '../sim/combat';

const DIR_ROW: Record<Facing, number> = { up: 0, left: 1, down: 2, right: 3 };
const DIRS: Facing[] = ['up', 'left', 'down', 'right'];
const FOOT = 0.94;
const HUMAN_COLS = 13;
const HUMAN_ANIMS: [string, number, number][] = [
  ['walk', 0, 9],
  ['slash', 4, 6],
  ['thrust', 8, 8],
  ['shoot', 12, 13],
  ['spellcast', 17, 7],
];
export const HUMAN_TEXTURES = ['player', 'merc', 'merc_archer', 'chief'];
/** images du corps (ligne « slash ») pour le geste d'outil (animations « tool » du générateur LPC) */
export const CHOP_FRAMES = [5, 5, 4, 4, 3, 1, 0, 0, 0, 0];

const ARMOR_LOOK: Record<string, string> = { gambison: 'leather', chainmail: 'chainmail', brigandine: 'plate' };

const ANIM_OF_ROW = (row: number): [string, number] | null => {
  if (row < 4) return ['walk', row];
  if (row < 8) return ['slash', row - 4];
  if (row < 12) return ['thrust', row - 8];
  if (row < 16) return ['shoot', row - 12];
  if (row === 16) return ['hurt', 0];
  if (row < 21) return ['spellcast', row - 17];
  return null;
};

export function createAnimations(scene: Phaser.Scene): void {
  const a = scene.anims;
  const add = (key: string, tex: string, frames: number[], rate: number, repeat: number) => {
    if (a.exists(key) || !scene.textures.exists(tex)) return;
    a.create({ key, frames: frames.map((f) => ({ key: tex, frame: f })), frameRate: rate, repeat });
  };
  for (const tex of HUMAN_TEXTURES) {
    for (const d of DIRS) {
      for (const [name, row0, n] of HUMAN_ANIMS) {
        const start = (row0 + DIR_ROW[d]) * HUMAN_COLS;
        if (name === 'walk') {
          add(`${tex}_walk_${d}`, tex, Array.from({ length: 8 }, (_, i) => start + 1 + i), 11, -1);
          add(`${tex}_idle_${d}`, tex, [start], 1, 0);
        } else add(`${tex}_${name}_${d}`, tex, Array.from({ length: n }, (_, i) => start + i), name === 'shoot' ? 26 : name === 'spellcast' ? 16 : 18, 0);
      }
      const s = (4 + DIR_ROW[d]) * HUMAN_COLS;
      add(`${tex}_chop_${d}`, tex, CHOP_FRAMES.map((f) => s + f), 25, 0);
    }
    add(`${tex}_die`, tex, Array.from({ length: 6 }, (_, i) => 16 * HUMAN_COLS + i), 8, 0);
  }
  // corps de zombie LPC (égaré corrompu)
  for (const d of DIRS) {
    const w = DIR_ROW[d] * 9;
    add(`rodeur_walk_${d}`, 'rodeur', Array.from({ length: 8 }, (_, i) => w + 1 + i), 7, -1);
    add(`rodeur_idle_${d}`, 'rodeur', [w], 1, 0);
    const s = (4 + DIR_ROW[d]) * 9;
    add(`rodeur_slash_${d}`, 'rodeur', Array.from({ length: 6 }, (_, i) => s + i), 12, 0);
  }
  add('rodeur_die', 'rodeur', Array.from({ length: 6 }, (_, i) => 8 * 9 + i), 9, 0);
  // créatures
  for (const t of Object.keys(ENEMIES) as EnemyType[]) {
    const sp = ENEMIES[t].sprite;
    if (sp.layout === 'human' || sp.layout === 'lpc_zombie') continue;
    const cols = creatureCols(sp);
    for (const d of DIRS) {
      const row = sp.dirRows![DIR_ROW[d]];
      const n = sp.walkFrames ?? 4;
      add(`${sp.tex}_walk_${d}`, sp.tex, Array.from({ length: n }, (_, i) => row * cols + i), sp.layout === 'mono' ? 6 : 9, -1);
      add(`${sp.tex}_idle_${d}`, sp.tex, sp.layout === 'mono' ? Array.from({ length: n }, (_, i) => row * cols + i) : [row * cols], sp.layout === 'mono' ? 4 : 1, sp.layout === 'mono' ? -1 : 0);
      if (sp.attackRows) {
        const ar = sp.attackRows[DIR_ROW[d]];
        add(`${sp.tex}_attack_${d}`, sp.tex, Array.from({ length: sp.attackFrames ?? 3 }, (_, i) => ar * cols + i), 8, 0);
      } else if (sp.layout === 'rat') {
        add(`${sp.tex}_attack_${d}`, sp.tex, [8, 9, 10].map((i) => row * cols + i), 10, 0);
      }
    }
  }
  if (!a.exists('campfire_anim')) a.create({ key: 'campfire_anim', frames: [0, 1, 2, 3].map((i) => ({ key: 'world', frame: `campfire_${i}` })), frameRate: 8, repeat: -1 });
}

export function creatureCols(sp: SpriteDef): number {
  switch (sp.layout) {
    case 'bear':
      return 5;
    case 'rat':
      return 12;
    case 'mono':
      return 3;
    default:
      return 4;
  }
}

/** Calques d'équipement alignés sur une feuille humanoïde (joueur ou mercenaire). */
class EquipLayers {
  private scene: Phaser.Scene;
  private layers: Record<'bg' | 'body' | 'fg' | 'arrow', Phaser.GameObjects.Image>;
  private has: boolean;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.has = scene.textures.exists('equip');
    const mk = () => scene.add.image(0, 0, this.has ? 'equip' : '__DEFAULT').setVisible(false);
    this.layers = { bg: mk(), body: mk(), fg: mk(), arrow: mk() };
  }

  sync(sprite: Phaser.GameObjects.Sprite, look: string | null, armor: string | null, depthY: number, alpha: number, scale: number, tint?: number): void {
    const L = this.layers;
    if (!this.has) return;
    const tf = sprite.anims.currentFrame?.textureFrame ?? sprite.frame.name;
    const n = Number(tf);
    const row = Math.floor(n / HUMAN_COLS);
    const col = n % HUMAN_COLS;
    const ad = ANIM_OF_ROW(row);
    const tex = this.scene.textures.get('equip');
    const put = (img: Phaser.GameObjects.Image, key: string | null, depth: number) => {
      if (!key || !tex.has(key)) {
        img.setVisible(false);
        return;
      }
      if (img.frame.name !== key) {
        img.setFrame(key);
        const cell = img.frame.realHeight;
        img.setOrigin(0.5, (FOOT * 64 + (cell - 64) / 2) / cell);
      }
      img.setVisible(sprite.visible).setPosition(sprite.x, sprite.y).setDepth(depth).setAlpha(alpha).setScale(scale);
      if (tint !== undefined) img.setTint(tint);
      else img.clearTint();
    };
    if (!ad) {
      for (const img of Object.values(L)) img.setVisible(false);
      return;
    }
    const [anim, d] = ad;
    const k = `${anim}|${d}|${col}`;
    put(L.bg, look ? `${look}|bg|${k}` : null, depthY - 0.02);
    put(L.body, armor ? `${armor}|body|${k}` : null, depthY + 0.01);
    put(L.fg, look ? `${look}|fg|${k}` : null, depthY + 0.02);
    put(L.arrow, look === 'bow' && anim === 'shoot' ? `arrow|fg|${k}` : null, depthY + 0.03);
  }

  destroy(): void {
    for (const img of Object.values(this.layers)) img.destroy();
  }
}

export class PlayerView {
  sprite: Phaser.GameObjects.Sprite;
  private lastAnim = '';
  private equip: EquipLayers;

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.sprite(0, 0, 'player', 0).setOrigin(0.5, FOOT);
    this.equip = new EquipLayers(scene);
  }

  update(g: Game, reduceFlash: boolean): void {
    const p = g.player;
    const s = this.sprite;
    s.setPosition(Math.round(p.x), Math.round(p.y));
    s.setDepth(p.y);
    let anim: string;
    const look = p.actionT > 0 && p.action !== 'none' ? p.actionLook : lookOf(g);
    if (p.dead) anim = 'player_die';
    else if (p.actionT > 0 && p.action === 'chop') anim = `player_chop_${p.facing}`;
    else if (p.actionT > 0 && p.action !== 'none') anim = `player_${p.action}_${p.facing}`;
    else if (p.moving || p.dodgeT > 0 || p.dashT > 0) anim = `player_walk_${p.facing}`;
    else anim = `player_idle_${p.facing}`;
    if (anim !== this.lastAnim) {
      s.play(anim, true);
      this.lastAnim = anim;
    }
    if (anim.startsWith('player_walk')) s.anims.timeScale = p.sprinting ? 1.5 : 1;
    const blink = p.invuln > 0 && !p.dead && !reduceFlash && Math.floor(p.invuln * 12) % 2 === 0;
    const alpha = p.dodgeT > 0 ? 0.6 : blink ? 0.45 : 1;
    s.setAlpha(alpha);
    if (p.parryT > 0) s.setTint(0xfff0b0);
    else if (p.shield > 0) s.setTint(0xd8e8c0);
    else s.clearTint();
    const armor = p.equip.armor ? ARMOR_LOOK[p.equip.armor.id] ?? null : null;
    this.equip.sync(s, p.dead ? null : look, armor, p.y, alpha, 1);
  }

  destroy(): void {
    this.sprite.destroy();
    this.equip.destroy();
  }
}

interface EView {
  sprite: Phaser.GameObjects.Sprite;
  alert: Phaser.GameObjects.Image;
  mound: Phaser.GameObjects.Image | null;
  bar: Phaser.GameObjects.Graphics;
  equip: EquipLayers | null;
  anim: string;
  spotUntil: number;
  barSig: string;
}

export class EnemyViews {
  private scene: Phaser.Scene;
  private views = new Map<number, EView>();
  private spotted = new Map<number, number>();
  private allies = new Map<number, Phaser.GameObjects.Sprite>();
  reduceFlash = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  spot(id: number): void {
    const until = this.scene.time.now + 900;
    this.spotted.set(id, until);
    const v = this.views.get(id);
    if (v) v.spotUntil = until;
    if (this.spotted.size > 80) this.spotted.clear();
  }

  update(g: Game, view: Phaser.Geom.Rectangle): void {
    const seen = new Set<number>();
    for (const e of g.enemies) {
      if (e.x < view.x - 140 || e.x > view.right + 140 || e.y < view.y - 100 || e.y > view.bottom + 180) continue;
      seen.add(e.id);
      let v = this.views.get(e.id);
      if (!v) {
        const d = ENEMIES[e.type];
        const sp = d.sprite;
        const sprite = this.scene.add.sprite(e.x, e.y, sp.tex, 0).setOrigin(0.5, sp.foot ?? FOOT).setScale(sp.scale ?? 1);
        const alert = this.scene.add.image(e.x, e.y - 60, 'items', 'fx_alert').setOrigin(0.5, 1).setVisible(false);
        const bar = this.scene.add.graphics();
        v = { sprite, alert, mound: null, bar, equip: sp.layout === 'human' ? new EquipLayers(this.scene) : null, anim: '', spotUntil: this.spotted.get(e.id) ?? 0, barSig: '' };
        this.views.set(e.id, v);
      }
      this.sync(e, v);
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      v.sprite.destroy();
      v.alert.destroy();
      v.mound?.destroy();
      v.bar.destroy();
      v.equip?.destroy();
      this.views.delete(id);
    }
    this.syncAllies(g);
  }

  private sync(e: Enemy, v: EView): void {
    const d = ENEMIES[e.type];
    const sp = d.sprite;
    const s = v.sprite;
    const scale = sp.scale ?? 1;
    s.setPosition(Math.round(e.x), Math.round(e.y));
    s.setDepth(e.y);
    // embuscade : seul le monticule est visible
    if (e.state === 'hidden') {
      s.setVisible(false);
      v.equip?.sync(s, null, null, e.y, 0, scale);
      if (!v.mound) v.mound = this.scene.add.image(e.x, e.y + 4, 'props', 'rocks_pile_s').setOrigin(0.5, 1).setTint(0x5a4a3a).setDepth(e.y - 2);
      v.alert.setVisible(false);
      v.bar.clear();
      return;
    }
    if (v.mound) {
      v.mound.destroy();
      v.mound = null;
    }
    s.setVisible(!e.burrowed);
    const kind = sp.layout === 'human' ? sp.tex : sp.layout === 'lpc_zombie' ? 'rodeur' : sp.tex;
    let anim: string;
    const atk = e.atk;
    if (e.dying > 0) anim = sp.layout === 'human' || sp.layout === 'lpc_zombie' ? `${kind}_die` : `${kind}_idle_${e.facing}`;
    else if (atk && atk.phase !== 'recover') {
      if (sp.layout === 'human') anim = `${kind}_${sp.anim ?? 'slash'}_${e.facing}`;
      else if (sp.layout === 'lpc_zombie') anim = `${kind}_slash_${e.facing}`;
      else anim = this.scene.anims.exists(`${kind}_attack_${e.facing}`) ? `${kind}_attack_${e.facing}` : `${kind}_walk_${e.facing}`;
    } else if (e.moving || e.state === 'emerge') anim = `${kind}_walk_${e.facing}`;
    else anim = `${kind}_idle_${e.facing}`;
    if (anim !== v.anim && this.scene.anims.exists(anim)) {
      s.play(anim, true);
      v.anim = anim;
    }
    // teintes : base, coup reçu, annonce d'attaque (clignotement ou teinte fixe)
    const base = sp.tint ?? (e.elite ? 0xffe0a0 : undefined);
    let alpha = 1;
    if (e.dying > 0) {
      alpha = Math.min(1, e.dying / 0.5);
      s.setTint(0x806060);
      if (sp.layout !== 'human' && sp.layout !== 'lpc_zombie') s.setAngle(90 * (1 - alpha) * (e.facing === 'left' ? -1 : 1));
    } else if (e.hurtT > 0) s.setTintFill(0xffffff);
    else if (atk && atk.phase === 'windup') {
      const on = this.reduceFlash || Math.floor(atk.t * 12) % 2 === 0;
      if (on) s.setTint(0xff7a6a);
      else if (base !== undefined) s.setTint(base);
      else s.clearTint();
    } else if (e.st.curseT > 0) s.setTint(0xb080d0);
    else if (e.st.rootT > 0 || e.st.slowT > 0) s.setTint(0x9cd0ff);
    else if (base !== undefined) s.setTint(base);
    else s.clearTint();
    if (e.state === 'emerge') alpha = 0.5;
    s.setAlpha(alpha);
    if (v.equip) v.equip.sync(s, e.dying > 0 ? null : sp.weaponLook ?? null, null, e.y, alpha, scale, base);
    const head = 58 * scale;
    const showAlert = e.dying <= 0 && ((atk && atk.phase === 'windup') || v.spotUntil > this.scene.time.now);
    v.alert.setVisible(!!showAlert && !e.burrowed);
    if (showAlert) v.alert.setPosition(s.x, s.y - head).setDepth(e.y + 1).setScale(atk ? 1 : 0.8);
    // barre de vie (ennemis blessés, hors boss : barre dans l'interface)
    const sig = e.dying > 0 || e.boss || e.hp >= e.maxHp ? '' : `${Math.round(s.x)},${Math.round(s.y)},${Math.ceil(e.hp)}`;
    if (sig !== v.barSig) {
      v.barSig = sig;
      v.bar.clear();
      if (sig) {
        const w = Math.max(20, d.radius * 2.2);
        const x = s.x - w / 2;
        const y = s.y - head - 6;
        v.bar.fillStyle(0x000000, 0.6).fillRect(x, y, w, 4);
        v.bar.fillStyle(e.elite ? 0xf0c050 : 0xd05040, 1).fillRect(x + 1, y + 1, Math.max(1, (w - 2) * (e.hp / e.maxHp)), 2);
        v.bar.setDepth(9.1e5);
      }
    }
  }

  private syncAllies(g: Game): void {
    const seen = new Set<number>();
    for (const a of g.allies) {
      seen.add(a.id);
      let s = this.allies.get(a.id);
      if (!s) {
        s = this.scene.add.sprite(a.x, a.y, 'ghost', 3).setOrigin(0.5, 0.95).setTint(0x7a9cff).setAlpha(0.8).setScale(1.1);
        s.play('ghost_walk_down');
        this.allies.set(a.id, s);
      }
      this.syncAlly(a, s);
    }
    for (const [id, s] of this.allies) {
      if (seen.has(id)) continue;
      s.destroy();
      this.allies.delete(id);
    }
  }

  private syncAlly(a: Ally, s: Phaser.GameObjects.Sprite): void {
    s.setPosition(Math.round(a.x), Math.round(a.y - 6 + Math.sin(this.scene.time.now / 200) * 3)).setDepth(a.y);
    s.setAlpha(a.t < 2 ? 0.3 + 0.5 * (a.t / 2) : 0.8);
  }

  get count(): number {
    return this.views.size;
  }
}

/** Calque d'armure (pour les tests visuels d'équipement). */
export function armorLook(id: string | undefined): string | null {
  return id ? ARMOR_LOOK[id] ?? (item(id).armor ? 'leather' : null) : null;
}
