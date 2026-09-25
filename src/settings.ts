// Réglages du joueur (stockés séparément des sauvegardes de partie).
export interface Settings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  reduceShake: boolean;
  debug: boolean;
  showHints: boolean;
}

const KEY = 'bdc-settings';

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.45,
  sfx: 0.8,
  muted: false,
  reduceShake: false,
  debug: false,
  showHints: true,
};

export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const merged = { ...DEFAULT_SETTINGS, ...s };
    if (new URLSearchParams(location.search).has('debug')) merged.debug = true;
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage indisponible : réglages conservés pour la session */
  }
}
