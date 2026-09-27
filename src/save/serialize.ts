// Sauvegarde versionnée. V3 (V2 du jeu) : sections séparées — progression, camp, maison,
// objets et équipement, maîtrises, compétences, états d'expédition, points de halte, butin pris,
// donjons et paliers, ressources de sortie. Les préférences sont stockées à part (settings.ts).
//
// Historique : v1 — jeu d'origine ; v2 — barre rapide, marqueurs… ; v3 — refonte V2 (camp et
// expéditions). Une ancienne sauvegarde (v1/v2) n'est jamais écrasée : elle est conservée à part
// et ses possessions sont importées dans une nouvelle partie V2 (conversion ci-dessous).
import { BUILDING_BY_ID, TRANSFER_CHEST_SIZE } from '../data/buildings';
import { DUNGEONS } from '../data/destinations';
import { ENEMIES, type EnemyType } from '../data/enemies';
import { ENCHANT_BY_ID } from '../data/enchants';
import { ITEMS } from '../data/items';
import { RECIPE_ENTRIES } from '../data/recipes';
import { FAMILIES, SKILL, type Family, type SkillId } from '../data/weapons';
import { MAPS } from '../maps';
import { Game, newLevelState, type DungeonState, type LevelState, type RunState } from '../sim/game';
import { addItem, makeSlots, type Slots, type Stack } from '../sim/inventory';
import { emptyHotbar, HOTBAR_SIZE, isHotbarAssignable, type Hotbar } from '../sim/hotbar';
import { normalizeObjectives } from '../sim/objectives';
import { spawnEnemy } from '../sim/enemies';
import { loadMap, storeFog } from '../sim/travel';
import { newStats, type Facing, type MapMarker, type Stats } from '../sim/types';
import type { World } from '../world/world';
import { TILE } from '../config/balance';

export const SAVE_VERSION = 3;
export const SAVE_TAG = 'les-bois-de-cendre';

interface BuildingSave {
  id: number;
  type: string;
  x: number;
  y: number;
  level?: number;
  items?: Slots;
  meat?: number;
  trapTimer?: number;
}

export interface SaveData {
  tag: string;
  v: number;
  savedAt: number;
  seed: number;
  rng: number;
  progress: {
    clock: number;
    flags: string[];
    completed: string[];
    journal: { t: number; text: string }[];
    stats: Stats;
    tutorialSkipped: boolean;
    starter: string | null;
    runSeq: number;
    lastDest: string;
    migrationNote: string | null;
  };
  player: {
    hp: number; hunger: number; stamina: number; mana: number; facing: Facing; weakT: number;
    inv: Slots; equip: { weapon: Stack | null; armor: Stack | null; accessory: Stack | null };
    xbowLoaded: boolean; reloadT: number;
  };
  masteries: Record<string, number>;
  skills: { loadouts: Partial<Record<Family, (SkillId | null)[]>>; cooldowns: Record<string, number>; ult: number };
  camp: { buildings: BuildingSave[]; nextBuildingId: number; bags: { id: number; x: number; y: number; items: Slots }[] };
  house: { buildings: BuildingSave[]; nextBuildingId: number };
  hotbar: Hotbar;
  hotbarSeen: string[];
  pinned: string | null;
  markers: MapMarker[];
  nextMarkerId: number;
  levels: Record<string, LevelState>;
  dungeons: Record<string, DungeonState>;
  run: RunState | null;
  location: { map: string; x: number; y: number };
  enemies: { key: string; type: EnemyType; x: number; y: number; hp: number; maxHp: number; elite: boolean; dmgMul: number; boss: boolean; minion?: boolean }[];
}

const copySlots = (s: Slots): Slots => s.map((x) => (x ? { ...x } : null));
const copyStack = (s: Stack | null): Stack | null => (s ? { ...s } : null);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function saveBuildings(w: World): BuildingSave[] {
  return [...w.buildings.values()].map((b) => ({ id: b.id, type: b.type, x: b.x, y: b.y, level: b.level, items: b.items ? copySlots(b.items) : undefined, meat: b.meat, trapTimer: b.trapTimer }));
}

export function serialize(g: Game): SaveData {
  const p = g.player;
  if (!g.atCamp) storeFog(g);
  const run = g.run ? clone(g.run) : null;
  return {
    tag: SAVE_TAG,
    v: SAVE_VERSION,
    savedAt: Date.now(),
    seed: g.seed,
    rng: g.rng.state,
    progress: {
      clock: g.clock, flags: [...g.flags], completed: [...g.completed], journal: clone(g.journal), stats: clone(g.stats),
      tutorialSkipped: g.tutorialSkipped, starter: g.starter, runSeq: g.runSeq, lastDest: g.lastDest, migrationNote: g.migrationNote,
    },
    player: {
      hp: p.dead ? 1 : p.hp, hunger: p.hunger, stamina: p.stamina, mana: p.mana, facing: p.facing, weakT: p.weakT,
      inv: copySlots(p.inv), equip: { weapon: copyStack(p.equip.weapon), armor: copyStack(p.equip.armor), accessory: copyStack(p.equip.accessory) },
      xbowLoaded: p.xbowLoaded, reloadT: p.reloadT,
    },
    masteries: { ...g.mastery },
    skills: { loadouts: clone(g.loadouts), cooldowns: { ...g.cooldowns }, ult: g.ult },
    camp: { buildings: saveBuildings(g.campWorld), nextBuildingId: g.campWorld.nextBuildingId, bags: [...g.campWorld.bags.values()].map((b) => ({ id: b.id, x: b.x, y: b.y, items: copySlots(b.items) })) },
    house: { buildings: saveBuildings(g.houseWorld), nextBuildingId: g.houseWorld.nextBuildingId },
    hotbar: g.hotbar.map((h) => (h ? { ...h } : null)),
    hotbarSeen: [...g.hotbarSeen],
    pinned: g.pinned,
    markers: g.markers.map((m) => ({ ...m })),
    nextMarkerId: g.nextMarkerId,
    levels: clone(g.levels),
    dungeons: clone(g.dungeons),
    run,
    location: { map: g.mapId, x: p.x, y: p.y },
    enemies: run ? g.enemies.filter((e) => e.dying <= 0 && e.hp > 0).map((e) => ({ key: e.key, type: e.type, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, elite: e.elite, dmgMul: e.dmgMul, boss: e.boss, minion: e.minion })) : [],
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
    const st = x as Stack;
    if (typeof x !== 'object' || !ITEMS[st.id] || !isNum(st.qty) || st.qty <= 0 || !Number.isInteger(st.qty)) {
      errors.push(`${where} : objet invalide`);
      return;
    }
    if (st.qty > ITEMS[st.id].stack) {
      errors.push(`${where} : pile trop grande`);
      return;
    }
    if (st.ench !== undefined && !ENCHANT_BY_ID[st.ench]) {
      errors.push(`${where} : enchantement inconnu`);
      return;
    }
  }
}

export type ValidateResult = { ok: true; data: SaveData; legacy?: unknown } | { ok: false; error: string };

/** Valide une sauvegarde (ou un fichier importé) avant tout remplacement de la partie active. */
export function validateSave(data: unknown): ValidateResult {
  if (!data || typeof data !== 'object') return { ok: false, error: 'Fichier illisible.' };
  const d = data as SaveData;
  if (d.tag !== SAVE_TAG) return { ok: false, error: 'Ce fichier n’est pas une sauvegarde des Bois de Cendre.' };
  if (!isNum(d.v)) return { ok: false, error: 'Version de sauvegarde absente.' };
  if (d.v > SAVE_VERSION) return { ok: false, error: `Sauvegarde d’une version plus récente (v${d.v}) : incompatible avec ce jeu (v${SAVE_VERSION}).` };
  if (d.v < 1) return { ok: false, error: 'Version de sauvegarde incompatible.' };
  if (d.v < 3) {
    const lv = validateLegacy(data as LegacySave);
    if (!lv.ok) return lv;
    return { ok: true, data: convertLegacy(data as LegacySave), legacy: data };
  }
  const errors: string[] = [];
  if (!isNum(d.seed)) errors.push('graine manquante');
  if (!d.progress || !isNum(d.progress.clock) || !Array.isArray(d.progress.flags)) errors.push('progression invalide');
  if (!d.player || !isNum(d.player.hp) || !isNum(d.player.hunger)) errors.push('joueur invalide');
  else {
    checkSlots(d.player.inv, 'sac', errors);
    if (!Array.isArray(d.player.inv) || d.player.inv.length !== 24) errors.push('sac : taille invalide');
    for (const k of ['weapon', 'armor', 'accessory'] as const) {
      const s = d.player.equip?.[k];
      if (s && (!ITEMS[s.id] || ITEMS[s.id].slot !== k)) errors.push(`équipement ${k} invalide`);
    }
  }
  if (!d.masteries || FAMILIES.some((f) => !isNum(d.masteries[f] ?? 0))) errors.push('maîtrises invalides');
  if (!d.skills || !isNum(d.skills.ult)) errors.push('compétences invalides');
  else for (const [f, lo] of Object.entries(d.skills.loadouts ?? {})) if (!Array.isArray(lo) || lo.some((id) => id !== null && (!SKILL[id as SkillId] || SKILL[id as SkillId].family !== f))) errors.push('compétence inconnue');
  for (const part of [d.camp, d.house]) {
    if (!part || !Array.isArray(part.buildings)) {
      errors.push('camp invalide');
      continue;
    }
    for (const b of part.buildings) {
      if (!BUILDING_BY_ID[b.type] || !isNum(b.x) || !isNum(b.y)) errors.push('installation invalide');
      if (b.items) checkSlots(b.items, 'coffre', errors);
    }
  }
  if (!Array.isArray(d.hotbar) || d.hotbar.length !== HOTBAR_SIZE) errors.push('barre rapide invalide');
  else for (const h of d.hotbar) if (h !== null && (!ITEMS[h.id] || !isHotbarAssignable(h.id))) errors.push('raccourci invalide');
  if (d.pinned !== null && d.pinned !== undefined && !RECIPE_ENTRIES.some((e) => e.key === d.pinned)) errors.push('recette suivie inconnue');
  if (!d.levels || typeof d.levels !== 'object') errors.push('états d’expédition manquants');
  else for (const [k, l] of Object.entries(d.levels)) {
    if (!MAPS[k]) errors.push('carte inconnue');
    for (const c of Object.values(l.chests ?? {})) checkSlots(c, 'coffre d’expédition', errors);
  }
  if (!d.dungeons || typeof d.dungeons !== 'object') errors.push('donjons manquants');
  else for (const [k, s] of Object.entries(d.dungeons)) if (!DUNGEONS[k] || !isNum(s.unlocked) || s.unlocked < 1 || s.unlocked > 5) errors.push('donjon invalide');
  if (d.run) {
    if (!MAPS[d.run.map] || !isNum(d.run.id)) errors.push('expédition en cours invalide');
    for (const c of Object.values(d.run.chests ?? {})) checkSlots(c, 'coffre d’instance', errors);
  }
  if (!d.location || !MAPS[d.location.map] || !isNum(d.location.x) || !isNum(d.location.y)) errors.push('position invalide');
  if (d.location && d.location.map !== 'camp' && d.location.map !== 'house' && (!d.run || d.run.map !== d.location.map)) errors.push('position hors expédition');
  if (!Array.isArray(d.enemies) || d.enemies.some((e) => !ENEMIES[e.type])) errors.push('ennemis invalides');
  if (errors.length) return { ok: false, error: `Sauvegarde corrompue (${[...new Set(errors)].slice(0, 3).join(' ; ')}).` };
  return { ok: true, data: d };
}

// ------------------------------------------------------------ chargement
function restoreBuildings(w: World, list: BuildingSave[], next: number): void {
  for (const id of [...w.buildings.keys()]) w.removeBuilding(id);
  for (const b of list) {
    const nb = w.addBuilding(b.type, b.x, b.y, b.id);
    if (b.level && b.level >= 2 && BUILDING_BY_ID[b.type].upgrade) nb.level = 2;
    if (b.items && nb.items) nb.items = copySlots(b.items);
    if (b.meat !== undefined) nb.meat = b.meat;
    if (b.trapTimer !== undefined) nb.trapTimer = b.trapTimer;
  }
  w.nextBuildingId = Math.max(w.nextBuildingId, next);
}

export function deserialize(input: SaveData): Game {
  const v = validateSave(input);
  if (!v.ok) throw new Error(v.error);
  const d = v.data;
  const g = new Game(d.seed);
  g.rng.state = d.rng >>> 0;
  const pr = d.progress;
  g.clock = pr.clock;
  g.flags = new Set(pr.flags);
  g.completed = new Set(pr.completed);
  g.journal = clone(pr.journal ?? []);
  g.stats = { ...newStats(), ...clone(pr.stats) };
  g.tutorialSkipped = !!pr.tutorialSkipped;
  g.starter = pr.starter ?? null;
  g.runSeq = pr.runSeq ?? 0;
  g.lastDest = pr.lastDest ?? 'bois';
  g.migrationNote = pr.migrationNote ?? null;
  for (const f of FAMILIES) g.mastery[f] = d.masteries[f] ?? 0;
  g.loadouts = clone(d.skills.loadouts ?? {});
  g.cooldowns = { ...(d.skills.cooldowns ?? {}) };
  g.ult = Math.max(0, Math.min(100, d.skills.ult));
  restoreBuildings(g.campWorld, d.camp.buildings, d.camp.nextBuildingId);
  for (const b of d.camp.bags ?? []) g.campWorld.bags.set(b.id, { id: b.id, x: b.x, y: b.y, items: copySlots(b.items), kind: 'drop' });
  g.campWorld.nextBagId = Math.max(1, ...[...g.campWorld.bags.keys()].map((k) => k + 1));
  restoreBuildings(g.houseWorld, d.house.buildings, d.house.nextBuildingId);
  g.hotbar = (d.hotbar ?? emptyHotbar()).map((h) => (h && ITEMS[h.id] ? { id: h.id, manual: !!h.manual } : null));
  g.hotbarSeen = new Set(d.hotbarSeen ?? []);
  g.pinned = d.pinned ?? null;
  g.markers = (d.markers ?? []).map((m) => ({ ...m, map: m.map ?? 'camp' }));
  g.nextMarkerId = Math.max(d.nextMarkerId ?? 1, ...g.markers.map((m) => m.id + 1), 1);
  g.levels = {};
  for (const [k, l] of Object.entries(d.levels ?? {})) g.levels[k] = { ...newLevelState(), ...clone(l) };
  g.dungeons = clone(d.dungeons ?? {});
  g.run = d.run ? { ...clone(d.run), opened: d.run.opened ?? [], votive: d.run.votive ?? {} } : null;
  const p = g.player;
  const dp = d.player;
  p.inv = copySlots(dp.inv);
  p.equip = { weapon: copyStack(dp.equip.weapon), armor: copyStack(dp.equip.armor), accessory: copyStack(dp.equip.accessory) };
  p.hunger = dp.hunger;
  p.stamina = dp.stamina ?? 100;
  p.mana = dp.mana ?? 100;
  p.facing = dp.facing ?? 'down';
  p.weakT = dp.weakT ?? 0;
  p.xbowLoaded = dp.xbowLoaded ?? true;
  p.reloadT = dp.reloadT ?? 0;
  // position : l'instance d'expédition en cours est restaurée telle quelle (rien n'est régénéré)
  const loc = d.location;
  if (g.run && loc.map === g.run.map) {
    loadMap(g, g.run.map, g.run.kind === 'dungeon' ? 'dungeon' : 'main', { kind: 'pos', x: loc.x, y: loc.y });
    // ennemis : état sauvegardé (positions, PV), jamais une nouvelle population
    g.enemies = [];
    for (const e of d.enemies) {
      const ne = spawnEnemy(g, e.type, e.x, e.y, { key: e.key, boss: e.boss, elite: e.elite, dmgMul: e.dmgMul, minion: e.minion });
      ne.maxHp = e.maxHp;
      ne.hp = e.hp;
    }
  } else loadMap(g, loc.map === 'house' ? 'house' : 'camp', 'main', { kind: 'pos', x: loc.x, y: loc.y });
  p.hp = Math.max(1, dp.hp);
  normalizeObjectives(g);
  return g;
}

// ------------------------------------------------------------ anciennes sauvegardes (v1, v2)
export interface LegacySave {
  tag: string;
  v: number;
  seed: number;
  day?: number;
  player: { inv: Slots; equip: { weapon: Stack | null; tool: Stack | null; armor: Stack | null } };
  buildings: { type: string; level?: number; items?: Slots }[];
  bags: { items: Slots }[];
  stats?: { playTime?: number };
}

const V1_COSTS: Record<string, Record<string, number>> = {
  campfire: { wood: 5, stone: 3 }, workbench: { wood: 10, stone: 4 }, chest: { planks: 4 }, bed: { fiber: 8, wood: 4 }, palisade: { wood: 4 },
  door: { planks: 4, rope: 2 }, spikes: { wood: 6, rope: 1 }, forge: { stone: 16, wood: 6, coal: 2 }, trap: { wood: 4, rope: 2 }, lamp: { wood: 3, coal: 1, scrap: 1 },
};
const V1_UPGRADES: Record<string, Record<string, number>> = {
  campfire: { stone: 6, scrap: 2 }, workbench: { planks: 4, rope: 2, stone: 4 }, chest: { planks: 6, rope: 2 },
};
/** Correspondance des objets de l'ancienne version (les fragments du sceau ne sont pas importés). */
const V1_MAP: Record<string, string | Record<string, number> | null> = {
  club: 'mace_1', sword: 'sword_1', bow: 'bow_1', spear: { wood: 4, fiber: 2 }, arrow: { wood: 1 }, frag_1: null, frag_2: null, frag_3: null,
};

function validateLegacy(d: LegacySave): { ok: true } | { ok: false; error: string } {
  const errors: string[] = [];
  if (!isNum(d.seed)) errors.push('graine manquante');
  if (!d.player || !Array.isArray(d.player.inv)) errors.push('joueur invalide');
  if (!Array.isArray(d.buildings)) errors.push('constructions manquantes');
  if (!Array.isArray(d.bags)) errors.push('sacs manquants');
  const okId = (id: string) => id in V1_MAP || !!ITEMS[id];
  const check = (s: Slots | undefined) => {
    if (!s) return;
    if (!Array.isArray(s)) return errors.push('liste d’objets invalide');
    for (const x of s) if (x && (!okId(x.id) || !isNum(x.qty) || x.qty <= 0)) errors.push('objet inconnu');
  };
  check(d.player?.inv);
  for (const b of d.buildings ?? []) {
    if (!(b.type in V1_COSTS)) errors.push('construction inconnue');
    check(b.items);
  }
  for (const b of d.bags ?? []) check(b.items);
  if (errors.length) return { ok: false, error: `Ancienne sauvegarde illisible (${[...new Set(errors)].slice(0, 3).join(' ; ')}).` };
  return { ok: true };
}

/**
 * Importe les possessions d'une ancienne partie dans une nouvelle partie V2 : objets compatibles
 * convertis, constructions remboursées, contenu des coffres et des sacs au sol conservé, le tout
 * rangé dans des coffres de transfert au camp. La quête des fragments n'est pas importée.
 */
export function convertLegacy(d: LegacySave): SaveData {
  const g = Game.newGame((d.seed ^ 0x2a2a2a) >>> 0);
  const pool: { id: string; qty: number; ench?: string }[] = [];
  let dropped = 0;
  const addConv = (id: string, qty: number) => {
    const m = V1_MAP[id];
    if (m === null) {
      dropped += qty;
      return;
    }
    if (typeof m === 'string') pool.push({ id: m, qty });
    else if (m) {
      // objet sans équivalent : remboursé en matériaux (flèches : 1 bois pour 3)
      const k = id === 'arrow' ? Math.floor(qty / 3) : qty;
      for (const [rid, n] of Object.entries(m)) if (k * n > 0) pool.push({ id: rid, qty: k * n });
    } else if (ITEMS[id]) pool.push({ id, qty });
  };
  const p = g.player;
  // équipement : l'arme et la protection compatibles restent en main
  const w = d.player.equip?.weapon;
  if (w) {
    const m = V1_MAP[w.id];
    if (typeof m === 'string') p.equip.weapon = { id: m, qty: 1 };
    else addConv(w.id, 1);
  }
  const a = d.player.equip?.armor;
  if (a && ITEMS[a.id]?.slot === 'armor') p.equip.armor = { id: a.id, qty: 1 };
  const t = d.player.equip?.tool;
  if (t) {
    if (t.id === 'torch') p.equip.accessory = { id: 'torch', qty: 1 };
    else addConv(t.id, 1);
  }
  for (const s of d.player.inv) if (s) addConv(s.id, s.qty);
  for (const b of d.buildings ?? []) {
    for (const [id, n] of Object.entries(V1_COSTS[b.type] ?? {})) pool.push({ id, qty: n });
    if ((b.level ?? 1) >= 2) for (const [id, n] of Object.entries(V1_UPGRADES[b.type] ?? {})) pool.push({ id, qty: n });
    for (const s of b.items ?? []) if (s) addConv(s.id, s.qty);
  }
  for (const bag of d.bags ?? []) for (const s of bag.items) if (s) addConv(s.id, s.qty);
  // rangement : sac d'abord (outils et vivres utiles), puis coffres de transfert au camp
  const chests: Slots[] = [];
  const spots = [[16, 22], [17, 22], [15, 22], [18, 22], [14, 22], [19, 22]];
  const newChest = (): Slots => {
    const [x, y] = spots[chests.length] ?? [16 + chests.length, 23];
    const b = g.campWorld.addBuilding('transfer', x, y);
    b.items = makeSlots(TRANSFER_CHEST_SIZE);
    chests.push(b.items);
    return b.items;
  };
  let cur = newChest();
  for (const s of pool) {
    let left = addItem(cur, s.id, s.qty, s.ench);
    while (left > 0 && chests.length < spots.length) {
      cur = newChest();
      left = addItem(cur, s.id, left, s.ench);
    }
    if (left > 0) addItem(p.inv, s.id, left, s.ench);
  }
  g.flags.add('first_return');
  g.flags.add('migrated');
  g.completed.add('o_gear');
  const n = pool.reduce((k, s) => k + s.qty, 0);
  g.migrationNote = `Ancienne partie importée (version ${d.v}) : ${n} objet(s) et matériaux rangés dans ${chests.length} coffre(s) de transfert au camp, constructions remboursées.` +
    `${p.equip.weapon ? ` Arme conservée en main : ${ITEMS[p.equip.weapon.id].name}.` : ''}${dropped ? ' Les fragments du sceau n’ont pas été importés (la quête n’existe plus).' : ''}` +
    ' Votre ancienne sauvegarde est conservée intacte (Options → exporter l’ancienne sauvegarde).';
  g.log(g.migrationNote);
  g.player.x = (16 + 0.5) * TILE;
  g.player.y = (24 + 0.5) * TILE;
  return serialize(g);
}

/** Une sauvegarde d'une version antérieure du jeu (v1, v2) ? */
export function isLegacy(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as SaveData).tag === SAVE_TAG && isNum((data as SaveData).v) && (data as SaveData).v < 3;
}
