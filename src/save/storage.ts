// Stockage local : IndexedDB en priorité, localStorage en secours.
// Deux emplacements : « current » et « backup » (dernière sauvegarde valide précédente).
import { validateSave, type SaveData } from './serialize';

const DB = 'bois-de-cendre';
const STORE = 'saves';
const LS_PREFIX = 'bdc-save-';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponible'));
      return;
    }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB refusé'));
  });
}

async function idbGet(key: string): Promise<unknown> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Écriture annulée'));
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function lsGet(key: string): unknown {
  try {
    const s = localStorage.getItem(LS_PREFIX + key);
    return s ? JSON.parse(s) : undefined;
  } catch {
    return undefined;
  }
}

function lsPut(key: string, value: unknown): void {
  localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
}

async function get(key: string): Promise<unknown> {
  try {
    const v = await idbGet(key);
    if (v !== undefined) return v;
  } catch {
    /* repli */
  }
  return lsGet(key);
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

let writing: Promise<SaveResult> | null = null;

export async function writeSave(data: SaveData): Promise<SaveResult> {
  // une seule écriture à la fois
  while (writing) await writing;
  const run = (async (): Promise<SaveResult> => {
    const prev = await get('current');
    let idbOk = true;
    try {
      if (prev && validateSave(prev).ok) await idbPut('backup', prev);
      await idbPut('current', data);
    } catch {
      idbOk = false;
    }
    try {
      if (!idbOk) {
        if (prev && validateSave(prev).ok) lsPut('backup', prev);
        lsPut('current', data);
      }
      return { ok: true };
    } catch (e) {
      return idbOk ? { ok: true } : { ok: false, error: `Stockage impossible : ${(e as Error).message || 'espace plein ou navigation privée'}.` };
    }
  })();
  writing = run;
  const res = await run;
  writing = null;
  return res;
}

export interface LoadResult {
  data?: SaveData;
  usedBackup?: boolean;
  error?: string;
}

export async function loadSave(): Promise<LoadResult> {
  const cur = await get('current');
  if (cur !== undefined) {
    const v = validateSave(cur);
    if (v.ok) return { data: v.data };
    const bak = await get('backup');
    if (bak !== undefined) {
      const vb = validateSave(bak);
      if (vb.ok) return { data: vb.data, usedBackup: true, error: v.error };
    }
    return { error: v.error };
  }
  return {};
}

export async function hasSave(): Promise<boolean> {
  return (await get('current')) !== undefined;
}

export async function clearSaves(): Promise<void> {
  try {
    await idbDelete('current');
    await idbDelete('backup');
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(LS_PREFIX + 'current');
    localStorage.removeItem(LS_PREFIX + 'backup');
  } catch {
    /* ignore */
  }
}
