// Gestion du son : effets (avec atténuation selon la distance), musiques jour/nuit,
// boucle du feu. L'audio n'est activé qu'après un geste de l'utilisateur (règle des navigateurs).
import type Phaser from 'phaser';
import type { Settings } from '../settings';

export const SOUND_KEYS = [
  'step_0', 'step_1', 'step_2', 'chop_0', 'chop_1', 'chop_2', 'mine_0', 'mine_1', 'mine_2', 'pick_0', 'pick_1',
  'swing_0', 'swing_1', 'hit_0', 'hit_1', 'hit_2', 'bow', 'zgroan_0', 'zgroan_1', 'zgroan_2', 'zgroan_3', 'zattack', 'zdeath',
  'click', 'open', 'close', 'error', 'confirm', 'craft', 'build', 'eat', 'door_open', 'door_close', 'chest', 'bell',
  'objective', 'victory', 'defeat', 'hurt',
];
export const MUSIC_KEYS = ['fire_loop', 'music_day', 'music_night', 'music_title'];

const BASE_VOL: Record<string, number> = {
  step_0: 0.25, step_1: 0.25, step_2: 0.25, zgroan_0: 0.55, zgroan_1: 0.55, zgroan_2: 0.55, zgroan_3: 0.55,
  click: 0.5, bell: 0.7, objective: 0.6, victory: 0.8, defeat: 0.7,
};

export class AudioManager {
  private sound: Phaser.Sound.BaseSoundManager | null = null;
  private settings: Settings;
  private music: Phaser.Sound.BaseSound | null = null;
  private musicKey = '';
  private fire: Phaser.Sound.BaseSound | null = null;
  private lastPlayed = new Map<string, number>();

  constructor(settings: Settings) {
    this.settings = settings;
  }

  attach(sound: Phaser.Sound.BaseSoundManager): void {
    this.sound = sound;
    sound.pauseOnBlur = true;
  }

  private vol(kind: 'sfx' | 'music'): number {
    const s = this.settings;
    if (s.muted) return 0;
    return s.master * (kind === 'sfx' ? s.sfx : s.music);
  }

  play(key: string, dist = 0): void {
    if (!this.sound || this.settings.muted) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? 0) < 60) return; // évite les doublons
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

  setMusic(key: string): void {
    if (!this.sound || key === this.musicKey) return;
    const old = this.music;
    this.musicKey = key;
    if (old) {
      old.stop();
      old.destroy();
    }
    this.music = null;
    if (!key) return;
    try {
      this.music = this.sound.add(key, { loop: true, volume: this.vol('music') });
      this.music.play();
    } catch {
      this.music = null;
    }
  }

  setFireLevel(level: number): void {
    if (!this.sound) return;
    if (!this.fire) {
      try {
        this.fire = this.sound.add('fire_loop', { loop: true, volume: 0 });
        this.fire.play();
      } catch {
        return;
      }
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
