// Sérialisation versionnée d'une partie. Le monde est régénéré depuis sa graine,
// puis les modifications enregistrées sont réappliquées.
import { ITEMS } from '../data/items';
import { BUILDING_BY_ID } from '../data/buildings';
import { ENEMIES, type EnemyType } from '../data/enemies';
import { generateWorld } from '../world/generate';
import { Game } from '../sim/game';
import type { Slots, Stack } from '../sim/inventory';
import { spawnEnemy } from '../sim/enemies';
import type { Assault, FinalState, Stats, Facing } from '../sim/types';

export const SAVE_VERSION = 1;
export const SAVE_TAG = 'les-bois-de-cendre';

export interface SaveData {
  tag: string;
  v: number;
  savedAt: number;
  seed: number;
  clock: number;
  day: number;
  dayTime: number;
  rng: number;
  player: {
    x: number; y: number; hp: number; hunger: number; stamina: number; facing: Facing;
    inv: Slots; equip: { weapon: Stack | null; tool: Stack | null; armor: Stack | null };
  };
  objects: { id: number; hp?: number; depleted?: boolean; regrowAt?: number; items?: Slots | null; opened?: boolean; taken?: boolean }[];
  buildings: { id: number; type: string; x: number; y: number; hp: number; items?: Slots; meat?: number; trapTimer?: number }[];
  bags: { id: number; x: number; y: number; items: Slots; kind: 'death' | 'chest' | 'drop' }[];
  nextBagId: number;
  nextBuildingId: number;
  fog: string;
  landmarks: string[];
  enemies: { type: EnemyType; x: number; y: number; hp: number; kind: 'ambient' | 'assault' | 'guardian' | 'final' }[];
  assault: Assault | null;
  final: FinalState;
  freed: boolean;
  stats: Stats;
  completed: string[];
  fragmentsTaken: string[];
  deathBagId: number;
  victorySeen: boolean;
}

function b64(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}
function unb64(s: string, len: number): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(len);
  for (let i = 0; i < Math.min(len, bin.length); i++) out[i] = bin.charCodeAt(i);
  return out;
}

const copySlots = (s: Slots): Slots => s.map((x) => (x ? { ...x } : null));
const copyStack = (s: Stack | null): Stack | null => (s ? { ...s } : null);

export function serialize(g: Game): SaveData {
  const w = g.world;
  return {
    tag: SAVE_TAG,
    v: SAVE_VERSION,
    savedAt: Date.now(),
    seed: w.seed,
    clock: g.clock,
    day: g.day,
    dayTime: g.dayTime,
    rng: g.rng.state,
    player: {
      x: g.player.x, y: g.player.y, hp: g.player.hp, hunger: g.player.hunger, stamina: g.player.stamina,
      facing: g.player.facing, inv: copySlots(g.player.inv),
      equip: { weapon: copyStack(g.player.equip.weapon), tool: copyStack(g.player.equip.tool), armor: copyStack(g.player.equip.armor) },
    },
    objects: w.objects
      .filter((o) => o.depleted || o.opened || o.taken || (o.hp !== undefined && o.maxHp !== undefined && o.hp < o.maxHp))
      .map((o) => ({ id: o.id, hp: o.hp, depleted: o.depleted, regrowAt: o.regrowAt, items: o.items ? copySlots(o.items) : o.items, opened: o.opened, taken: o.taken })),
    buildings: [...w.buildings.values()].map((b) => ({ id: b.id, type: b.type, x: b.x, y: b.y, hp: b.hp, items: b.items ? copySlots(b.items) : undefined, meat: b.meat, trapTimer: b.trapTimer })),
    bags: [...w.bags.values()].map((b) => ({ id: b.id, x: b.x, y: b.y, items: copySlots(b.items), kind: b.kind })),
    nextBagId: w.nextBagId,
    nextBuildingId: w.nextBuildingId,
    fog: b64(w.fog),
    landmarks: w.landmarks.filter((l) => l.discovered).map((l) => l.id),
    enemies: g.enemies.filter((e) => e.dying <= 0 && e.hp > 0).map((e) => ({ type: e.type, x: e.x, y: e.y, hp: e.hp, kind: e.kind })),
    assault: g.assault ? { ...g.assault } : null,
    final: { ...g.final },
    freed: g.freed,
    stats: JSON.parse(JSON.stringify(g.stats)),
    completed: [...g.completed],
    fragmentsTaken: [...g.fragmentsTaken],
    deathBagId: g.deathBagId,
    victorySeen: g.victorySeen,
  };
}

// ------------------------------------------------------------ validation
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function checkSlots(s: unknown, where: string, errors: string[]): void {
  if (!Array.isArray(s)) {
    errors.push(`${where} : liste attendue`);
    return;
  }
  for (const x of s) {
    if (x === null) continue;
    if (typeof x !== 'object' || !ITEMS[(x as Stack).id] || !isNum((x as Stack).qty) || (x as Stack).qty <= 0 || !Number.isInteger((x as Stack).qty)) {
      errors.push(`${where} : objet invalide`);
      return;
    }
    if ((x as Stack).qty > ITEMS[(x as Stack).id].stack) {
      errors.push(`${where} : pile trop grande`);
      return;
    }
  }
}

export function validateSave(data: unknown): { ok: true; data: SaveData } | { ok: false; error: string } {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') return { ok: false, error: 'Fichier illisible.' };
  const d = data as SaveData;
  if (d.tag !== SAVE_TAG) return { ok: false, error: 'Ce fichier n’est pas une sauvegarde des Bois de Cendre.' };
  if (!isNum(d.v)) return { ok: false, error: 'Version de sauvegarde absente.' };
  if (d.v > SAVE_VERSION) return { ok: false, error: `Sauvegarde d’une version plus récente (v${d.v}) : incompatible avec ce jeu (v${SAVE_VERSION}).` };
  if (d.v < 1) return { ok: false, error: 'Version de sauvegarde incompatible.' };
  for (const k of ['seed', 'clock', 'day', 'dayTime', 'nextBagId', 'nextBuildingId'] as const) if (!isNum(d[k])) errors.push(`${k} manquant`);
  if (!d.player || !isNum(d.player.x) || !isNum(d.player.y) || !isNum(d.player.hp) || !isNum(d.player.hunger)) errors.push('joueur invalide');
  else {
    checkSlots(d.player.inv, 'inventaire', errors);
    if (!Array.isArray(d.player.inv) || d.player.inv.length !== 24) errors.push('inventaire : taille invalide');
    for (const k of ['weapon', 'tool', 'armor'] as const) {
      const s = d.player.equip?.[k];
      if (s && !ITEMS[s.id]) errors.push(`équipement ${k} invalide`);
    }
  }
  if (!Array.isArray(d.objects)) errors.push('objets manquants');
  else for (const o of d.objects) {
    if (!isNum(o.id)) errors.push('objet sans identifiant');
    if (o.items) checkSlots(o.items, 'conteneur', errors);
  }
  if (!Array.isArray(d.buildings)) errors.push('constructions manquantes');
  else for (const b of d.buildings) {
    if (!BUILDING_BY_ID[b.type] || !isNum(b.x) || !isNum(b.y) || !isNum(b.hp)) errors.push('construction invalide');
    if (b.items) checkSlots(b.items, 'coffre', errors);
  }
  if (!Array.isArray(d.bags)) errors.push('sacs manquants');
  else for (const b of d.bags) checkSlots(b.items, 'sac', errors);
  if (!Array.isArray(d.enemies)) errors.push('ennemis manquants');
  else for (const e of d.enemies) if (!ENEMIES[e.type]) errors.push('ennemi inconnu');
  if (!d.final || !['locked', 'ready', 'active', 'won'].includes(d.final.state)) errors.push('état final invalide');
  if (!d.stats || typeof d.stats !== 'object') errors.push('statistiques manquantes');
  if (typeof d.fog !== 'string') errors.push('carte manquante');
  if (errors.length) return { ok: false, error: `Sauvegarde corrompue (${errors.slice(0, 3).join(' ; ')}).` };
  return { ok: true, data: d };
}

// ------------------------------------------------------------ chargement
export function deserialize(d: SaveData): Game {
  const { world } = generateWorld(d.seed);
  const g = new Game(world, d.seed);
  g.clock = d.clock;
  g.day = d.day;
  g.dayTime = d.dayTime;
  g.lastPhase = g.phase();
  g.rng.state = d.rng >>> 0;
  const p = g.player;
  p.x = d.player.x;
  p.y = d.player.y;
  p.hp = d.player.hp;
  p.hunger = d.player.hunger;
  p.stamina = d.player.stamina ?? 100;
  p.facing = d.player.facing ?? 'down';
  p.inv = copySlots(d.player.inv);
  p.equip = { weapon: copyStack(d.player.equip.weapon), tool: copyStack(d.player.equip.tool), armor: copyStack(d.player.equip.armor) };
  if (p.hp <= 0) {
    p.hp = 1; // une sauvegarde faite pendant la mort reprend au point de retour
    g.respawn();
  }

  for (const s of d.objects) {
    const o = world.objects[s.id];
    if (!o) continue;
    if (s.hp !== undefined) o.hp = s.hp;
    if (s.items !== undefined) o.items = s.items ? copySlots(s.items) : null;
    o.opened = !!s.opened;
    o.taken = !!s.taken;
    if (s.depleted) {
      o.depleted = true;
      o.regrowAt = s.regrowAt;
      g.depleted.add(o.id);
      if (o.type !== 'tree' && o.type !== 'bush') {
        o.solid = false;
        world.unstampObject(o);
      }
    }
  }
  for (const b of d.buildings) {
    const nb = world.addBuilding(b.type, b.x, b.y, b.hp, b.id);
    if (b.items && nb.items) nb.items = copySlots(b.items);
    if (b.meat !== undefined) nb.meat = b.meat;
    if (b.trapTimer !== undefined) nb.trapTimer = b.trapTimer;
  }
  world.nextBuildingId = Math.max(world.nextBuildingId, d.nextBuildingId);
  for (const b of d.bags) world.bags.set(b.id, { id: b.id, x: b.x, y: b.y, items: copySlots(b.items), kind: b.kind });
  world.nextBagId = Math.max(d.nextBagId, ...[...world.bags.keys()].map((k) => k + 1), 1);
  world.fog = unb64(d.fog, world.fog.length);
  for (const lm of world.landmarks) lm.discovered = lm.id === 'start' || d.landmarks.includes(lm.id);
  for (const e of d.enemies) {
    const ne = spawnEnemy(g, e.type, e.x, e.y, e.kind);
    ne.hp = e.hp;
  }
  g.assault = d.assault ? { ...d.assault } : null;
  g.final = { ...d.final };
  if (g.final.state === 'active') g.final.spawnedWave = g.enemies.some((e) => e.kind === 'final');
  g.freed = !!d.freed;
  g.stats = { ...g.stats, ...d.stats };
  g.completed = new Set(d.completed);
  g.fragmentsTaken = [...d.fragmentsTaken];
  g.deathBagId = d.deathBagId;
  g.victorySeen = !!d.victorySeen;
  if (g.final.state !== 'locked') {
    world.objects[world.sanctuaryId].sprite = 'world:seal_stone_on';
    g.sanctuaryRestored = true;
  }
  return g;
}
