// Son : effets (atténués selon la distance), musiques par contexte avec fondu enchaîné,
// chargées à la demande (pas au démarrage). Aucun son avant un geste de l'utilisateur.
import type Phaser from 'phaser';
import type { Settings } from '../settings';

export const SOUND_KEYS = [
  'step_0', 'step_1', 'step_2', 'step_dirt_0', 'step_dirt_1', 'step_water_0', 'step_water_1', 'step_stone_0', 'step_stone_1', 'step_wood_0', 'step_wood_1',
  'chop_0', 'chop_1', 'chop_2', 'mine_0', 'mine_1', 'mine_2', 'pick_0', 'pick_1',
  'swing_0', 'swing_1', 'swing_heavy', 'swing_sword', 'knife', 'hit_0', 'hit_1', 'hit_2', 'bow', 'reload', 'clang', 'thud', 'glass', 'rock_hit',
  'spell_0', 'spell_1', 'spell_2', 'spell_3', 'spell_4', 'magic', 'cast',
  'zgroan_1', 'zattack', 'zdeath', 'wolf', 'beast_0', 'beast_1', 'giant', 'ogre', 'shade_0', 'shade_1', 'slime', 'bite', 'goblin', 'roar_0', 'roar_1', 'sword_draw',
  'click', 'open', 'close', 'error', 'confirm', 'craft', 'build', 'eat', 'door_open', 'door_close', 'chest', 'bell', 'bottle', 'bubble', 'chain', 'trap',
  'objective', 'victory', 'defeat', 'hurt', 'win', 'achieve', 'lose',
];
export const MUSIC_KEYS = ['fire_loop', 'music_title', 'music_camp', 'music_day', 'music_night', 'music_eerie', 'music_ruins', 'music_battle', 'music_boss', 'cave_amb'];

const BASE_VOL: Record<string, number> = {
  step_0: 0.22, step_1: 0.22, step_2: 0.22, step_dirt_0: 0.3, step_dirt_1: 0.3, step_water_0: 0.3, step_water_1: 0.3, step_stone_0: 0.25, step_stone_1: 0.25, step_wood_0: 0.25, step_wood_1: 0.25,
  click: 0.5, bell: 0.7, objective: 0.6, victory: 0.8, defeat: 0.7, roar_0: 0.8, roar_1: 0.8, win: 0.7, achieve: 0.6, lose: 0.6,
};

export class AudioManager {
  private sound: Phaser.Sound.BaseSoundManager | null = null;
  private scene: Phaser.Scene | null = null;
  private settings: Settings;
  private music: Phaser.Sound.BaseSound | null = null;
  private musicKey = '';
  private wanted = '';
  private fire: Phaser.Sound.BaseSound | null = null;
  private lastPlayed = new Map<string, number>();
  private loading = new Set<string>();

  constructor(settings: Settings) {
    this.settings = settings;
  }

  attach(scene: Phaser.Scene): void {
    this.scene = scene;
    this.sound = scene.sound;
    scene.sound.pauseOnBlur = true;
  }

  private vol(kind: 'sfx' | 'music'): number {
    const s = this.settings;
    if (s.muted) return 0;
    return s.master * (kind === 'sfx' ? s.sfx : s.music);
  }

  play(key: string, dist = 0): void {
    if (!this.sound || this.settings.muted) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? 0) < 60) return;
    this.lastPlayed.set(key, now);
    const att = Math.max(0, 1 - dist / 640);
    const v = this.vol('sfx') * (BASE_VOL[key] ?? 0.6) * att;
    if (v <= 0.01) return;
    try {
      this.sound.play(key, { volume: v });
    } catch {
      /* son indisponible : on continue sans */
    }
  }

  /** Charge une musique à la demande (chargement par destination). */
  private ensure(key: string, then: () => void): void {
    const sc = this.scene;
    if (!sc) return;
    if (sc.cache.audio.exists(key)) {
      then();
      return;
    }
    if (this.loading.has(key)) return;
    this.loading.add(key);
    sc.load.audio(key, `assets/audio/${key}.mp3`);
    sc.load.once(`filecomplete-audio-${key}`, () => {
      this.loading.delete(key);
      then();
    });
    sc.load.start();
  }

  /** Change de musique avec un fondu (sortie 0,8 s, entrée 1,2 s). */
  setMusic(key: string): void {
    if (!this.sound || key === this.wanted) return;
    this.wanted = key;
    const old = this.music;
    if (old) {
      const o = old as Phaser.Sound.WebAudioSound;
      this.scene?.tweens.add({ targets: o, volume: 0, duration: 800, onComplete: () => { o.stop(); o.destroy(); } });
      this.music = null;
      this.musicKey = '';
    }
    if (!key) return;
    this.ensure(key, () => {
      if (this.wanted !== key || !this.sound) return;
      try {
        const m = this.sound.add(key, { loop: true, volume: 0 }) as Phaser.Sound.WebAudioSound;
        m.play();
        this.music = m;
        this.musicKey = key;
        this.scene?.tweens.add({ targets: m, volume: this.vol('music'), duration: 1200 });
      } catch {
        this.music = null;
      }
    });
  }

  get currentMusic(): string {
    return this.musicKey;
  }

  setFireLevel(level: number): void {
    if (!this.sound) return;
    if (!this.fire) {
      if (level <= 0.01) return;
      this.ensure('fire_loop', () => {
        if (this.fire || !this.sound) return;
        try {
          this.fire = this.sound.add('fire_loop', { loop: true, volume: 0 });
          this.fire.play();
        } catch {
          /* ignore */
        }
      });
      return;
    }
    (this.fire as Phaser.Sound.WebAudioSound).setVolume?.(this.vol('sfx') * 0.5 * level);
  }

  refreshVolumes(): void {
    if (this.music) (this.music as Phaser.Sound.WebAudioSound).setVolume?.(this.vol('music'));
    if (this.sound) this.sound.mute = this.settings.muted;
  }

  stopAll(): void {
    this.setMusic('');
    if (this.fire) {
      this.fire.stop();
      this.fire.destroy();
      this.fire = null;
    }
  }
}
