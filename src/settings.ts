// Réglages du joueur (stockés séparément des sauvegardes de partie), versionnés.
//  v1 : son, secousses, debug, aides ;
//  v2 : mode de commandes, joystick, taille des boutons, gaucher, qualité d'affichage,
//       aides déjà apprises.
export type ControlMode = 'auto' | 'touch' | 'keyboard';
export type Quality = 'auto' | 'high' | 'eco';

export interface Settings {
  v: number;
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  reduceShake: boolean;
  debug: boolean;
  showHints: boolean;
  controlMode: ControlMode;
  joySize: number; // 0.8 – 1.3
  joyOpacity: number; // 0.35 – 1
  buttonSize: number; // 0.9 – 1.25
  leftHanded: boolean;
  quality: Quality;
  /** aides élémentaires déjà vues (ne sont plus affichées) */
  learned: string[];
}

const KEY = 'bdc-settings';
export const SETTINGS_VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
  v: SETTINGS_VERSION,
  master: 0.8,
  music: 0.45,
  sfx: 0.8,
  muted: false,
  reduceShake: false,
  debug: false,
  showHints: true,
  controlMode: 'auto',
  joySize: 1,
  joyOpacity: 0.8,
  buttonSize: 1,
  leftHanded: false,
  quality: 'auto',
  learned: [],
};

const clamp = (v: unknown, a: number, b: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d);

/** Migration et nettoyage : valeurs hors bornes ramenées, clés inconnues ignorées. */
export function migrateSettings(raw: unknown): Settings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  const out: Settings = { ...DEFAULT_SETTINGS };
  out.master = clamp(s.master, 0, 1, out.master);
  out.music = clamp(s.music, 0, 1, out.music);
  out.sfx = clamp(s.sfx, 0, 1, out.sfx);
  for (const k of ['muted', 'reduceShake', 'debug', 'showHints', 'leftHanded'] as const) if (typeof s[k] === 'boolean') out[k] = s[k] as boolean;
  if (s.controlMode === 'auto' || s.controlMode === 'touch' || s.controlMode === 'keyboard') out.controlMode = s.controlMode;
  if (s.quality === 'auto' || s.quality === 'high' || s.quality === 'eco') out.quality = s.quality;
  out.joySize = clamp(s.joySize, 0.8, 1.3, out.joySize);
  out.joyOpacity = clamp(s.joyOpacity, 0.35, 1, out.joyOpacity);
  out.buttonSize = clamp(s.buttonSize, 0.9, 1.25, out.buttonSize);
  out.learned = Array.isArray(s.learned) ? s.learned.filter((x) => typeof x === 'string').slice(0, 200) : [];
  // v1 : l'aide du joystick était mémorisée à part
  try {
    if (localStorage.getItem('bdc-joy-hint') === 'vu' && !out.learned.includes('joystick')) out.learned.push('joystick');
  } catch {
    /* stockage indisponible */
  }
  out.v = SETTINGS_VERSION;
  return out;
}

export function loadSettings(): Settings {
  let raw: unknown = {};
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    raw = {};
  }
  const s = migrateSettings(raw);
  try {
    if (new URLSearchParams(location.search).has('debug')) s.debug = true;
  } catch {
    /* hors navigateur */
  }
  return s;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage indisponible : réglages conservés pour la session */
  }
}
