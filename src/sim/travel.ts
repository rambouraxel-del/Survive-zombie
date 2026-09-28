// Voyages et expéditions : destinations, instances de sortie, points de halte, portes et
// raccourcis, mort et retour, boss, donjons à paliers.
//
//  - Interrompre (recharger la page) : l'instance en cours est restaurée telle quelle ;
//  - Rentrer au camp : une expédition principale garde son état (point de halte, portes,
//    coffres vidés, boss vaincus) ; une sortie de ressources est terminée et ses ressources
//    sont mises en sûreté ;
//  - Terminer : victoire contre le boss principal ;
//  - Nouvelle instance : chaque départ vers une région de ressources ou un donjon crée une
//    instance distincte (identifiant unique) ; recharger ne régénère jamais de récompense.
import { CHECKPOINT, DEATH, TILE, farmLossAmount } from '../config/balance';
import { DEST_BY_ID, DUNGEONS, MAX_TIER, type Destination, type TierDef } from '../data/destinations';
import { ENEMIES, type EnemyType } from '../data/enemies';
import { item } from '../data/items';
import { mapDef } from '../maps';
import { buildWorld, type Variant } from '../world/mapbuild';
import type { World, WObj } from '../world/world';
import type { Game, RunState } from './game';
import { countItem, removeItem, cloneSlots } from './inventory';
import { Rng, hashSeed } from './rng';
import { spawnEnemy, resetEnemyGrid } from './enemies';
import { maxHp } from './profile';
import type { DeathSummary, Enemy } from './types';
import { newStatuses } from './types';

export interface Check {
  ok: boolean;
  reason?: string;
}

// ------------------------------------------------------------ état des destinations
export type DestStatus = 'locked' | 'available' | 'progress' | 'done';

export function isUnlocked(g: Game, d: Destination): boolean {
  return d.requires.every((f) => g.flags.has(f));
}

export function destStatus(g: Game, id: string): DestStatus {
  const d = DEST_BY_ID[id];
  if (!isUnlocked(g, d)) return 'locked';
  if (d.kind === 'main') {
    const l = g.levels[d.map];
    if (l?.status === 'done') return 'done';
    if (l?.status === 'progress') return 'progress';
    return 'available';
  }
  if (d.kind === 'farm' && d.bossFlag && g.flags.has(d.bossFlag)) return 'done';
  if (d.kind === 'dungeon') {
    const s = g.dungeon(id);
    if (s.cleared.includes(MAX_TIER)) return 'done';
    if (s.cleared.length) return 'progress';
  }
  return 'available';
}

/** Délai restant avant une nouvelle instance récompensée d'un donjon (0 = disponible). */
export function dungeonWait(g: Game, id: string): number {
  const s = g.dungeon(id);
  if (s.lastWin === null) return 0;
  return Math.max(0, DUNGEONS[id].cooldown - (g.clock - s.lastWin));
}

export function checkpointName(g: Game, map: string): string | null {
  const key = g.levels[map]?.checkpoint;
  if (!key) return null;
  const def = mapDef(map);
  for (const m of Object.values(def.legend)) if (m.kind === 'checkpoint' && m.id === key) return m.name;
  return null;
}

// ------------------------------------------------------------ chargement d'une carte
type Placement = { kind: 'start' } | { kind: 'checkpoint'; key: string } | { kind: 'pos'; x: number; y: number } | { kind: 'travel' } | { kind: 'door'; to: string };

export function loadMap(g: Game, mapId: string, variant: Variant, place: Placement): void {
  let world: World;
  if (mapId === 'camp') world = g.campWorld;
  else if (mapId === 'house') world = g.houseWorld;
  else {
    const res = buildWorld(mapDef(mapId), variant, g.run?.seed ?? 1);
    world = res.world;
    g.spawns = res.spawns;
    g.bossPoints = res.bosses;
  }
  g.world = world;
  g.enemies = [];
  g.allies = [];
  g.projectiles = [];
  g.zones = [];
  g.openContainer = null;
  g.target = null;
  g.forcedTarget = null;
  g.bossActive = null;
  g.lastArea = '';
  resetEnemyGrid();
  if (mapId !== 'camp' && mapId !== 'house') {
    applyLevelState(g, variant);
    applyRunState(g);
  }
  placePlayer(g, place);
  const p = g.player;
  p.combo = null;
  p.dashT = 0;
  p.pendingHit = 0;
  p.action = 'none';
  p.actionT = 0;
  world.discover(p.x, p.y, 10);
  if (g.run && mapId === g.run.map) {
    if (g.run.kind === 'dungeon') spawnDungeon(g);
    else g.spawnFromPoints(variant);
  }
  g.emit({ type: 'mapChanged' });
}

function placePlayer(g: Game, place: Placement): void {
  const w = g.world;
  let tx = w.start.x;
  let ty = w.start.y;
  if (place.kind === 'checkpoint') {
    const o = w.byKey.get(place.key);
    if (o) {
      tx = o.fx;
      ty = o.fy + 1;
    }
  } else if (place.kind === 'pos') {
    tx = Math.floor(place.x / TILE);
    ty = Math.floor(place.y / TILE);
  } else if (place.kind === 'travel') {
    const o = w.byKey.get('travel');
    if (o) {
      tx = o.fx;
      ty = o.fy - 1;
    }
  } else if (place.kind === 'door') {
    const d = w.objects.find((o) => o.type === 'door' && (place.to === 'any' || o.destination === place.to));
    if (d) {
      tx = d.fx;
      ty = w.id === 'house' ? d.fy - 1 : d.fy + 1;
    }
  }
  const spot = nearestFree(w, tx, ty);
  g.player.x = (spot.x + 0.5) * TILE;
  g.player.y = (spot.y + 0.5) * TILE;
  if (place.kind === 'pos') {
    const fx = Math.floor(place.x / TILE);
    const fy = Math.floor(place.y / TILE);
    if (w.passableForPlayer(fx, fy)) {
      g.player.x = place.x;
      g.player.y = place.y;
    }
  }
}

/** Case praticable la plus proche (recherche en largeur). */
export function nearestFree(w: World, tx: number, ty: number): { x: number; y: number } {
  const seen = new Set<number>();
  const q: [number, number][] = [[tx, ty]];
  while (q.length) {
    const [x, y] = q.shift()!;
    const k = y * w.w + x;
    if (seen.has(k) || !w.inBounds(x, y)) continue;
    seen.add(k);
    if (w.passableForPlayer(x, y)) return { x, y };
    if (seen.size > 2000) break;
    q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return { x: w.start.x, y: w.start.y };
}

function b64(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}
function unb64(s: string, len: number): Uint8Array {
  const out = new Uint8Array(len);
  if (!s) return out;
  const bin = atob(s);
  for (let i = 0; i < Math.min(len, bin.length); i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Mémorise le brouillard de la carte d'expédition courante. */
export function storeFog(g: Game): void {
  if (g.atCamp) return;
  const l = g.level(g.mapId);
  l.fog = b64(g.world.fog);
  l.visited = true;
}

function applyLevelState(g: Game, variant: Variant): void {
  const w = g.world;
  const l = g.level(w.id);
  const main = variant === 'main';
  if (l.fog) w.fog = unb64(l.fog, w.fog.length);
  for (const o of w.objects) {
    if (o.type === 'container' && !main) o.renew = true;
    if (main && o.type === 'container' && !o.renew && l.chests[o.key]) {
      o.items = cloneSlots(l.chests[o.key]);
      o.opened = true;
    }
    if (main && o.type === 'gate' && (l.opened.includes(o.target!) || (o.openedBy === 'boss' && l.bosses.length > 0))) setGate(o, true);
    if (main && o.type === 'shortcut' && l.opened.includes(o.key)) setShortcut(w, o, true);
    if (main && o.type === 'checkpoint' && l.lit.includes(o.key)) lightSprite(o);
    if (o.type === 'note' && g.stats.notesRead.includes(o.noteId ?? '')) o.opened = true;
  }
  for (const lm of w.landmarks) lm.discovered = lm.discovered || l.visited;
}

function applyRunState(g: Game): void {
  const run = g.run;
  const w = g.world;
  if (!run || run.map !== w.id) return;
  for (const o of w.objects) {
    if (run.depleted.includes(o.key)) {
      o.depleted = true;
      o.hp = 0;
      if (o.type !== 'tree' && o.type !== 'bush') {
        o.solid = false;
        w.unstampObject(o);
      }
    }
    if (o.type === 'container' && (o.renew || o.key.startsWith('reward:')) && run.chests[o.key]) {
      o.items = cloneSlots(run.chests[o.key]);
      o.opened = true;
    }
    if (o.type === 'checkpoint' && run.lit.includes(o.key)) lightSprite(o);
    if (o.type === 'gate' && run.opened.includes(o.target!)) setGate(o, true);
    if (o.type === 'shortcut' && run.opened.includes(o.key)) setShortcut(w, o, true);
  }
  // récompense de donjon déjà apparue
  const reward = Object.keys(run.chests).find((k) => k.startsWith('reward:'));
  if (reward && !w.byKey.get(reward)) addRewardChest(g, run, reward);
}

function lightSprite(o: WObj): void {
  o.open = true;
  o.sprite = o.votive ? 'world:lamp_on' : 'world:campfire_1';
  o.light = o.votive ? 160 : 150;
}

function setGate(o: WObj, open: boolean): void {
  o.open = open;
  o.solid = !open;
}

function setShortcut(w: World, o: WObj, open: boolean): void {
  o.open = open;
  for (const c of o.cells ?? []) {
    if (!w.inBounds(c.x, c.y)) continue;
    const i = w.idx(c.x, c.y);
    if (w.water[i]) w.bridge[i] = open ? 1 : 0;
    if (open && w.wall[i]) w.wall[i] = 0;
  }
  w.version++;
}

// ------------------------------------------------------------ départ et retour
export function startExpedition(g: Game, destId: string, tier = 1): Check {
  const d = DEST_BY_ID[destId];
  if (!d) return { ok: false, reason: 'Destination inconnue' };
  if (!g.atCamp) return { ok: false, reason: 'On part en expédition depuis le camp.' };
  if (!isUnlocked(g, d)) return { ok: false, reason: d.lockedText };
  if (d.kind === 'dungeon') {
    const s = g.dungeon(destId);
    if (tier < 1 || tier > s.unlocked) return { ok: false, reason: `Palier ${tier} verrouillé : réussissez d’abord le palier ${s.unlocked}.` };
    const wait = dungeonWait(g, destId);
    if (wait > 0) return { ok: false, reason: `Les lieux se repeuplent : nouvelle instance dans ${Math.ceil(wait)} s.` };
  }
  const id = ++g.runSeq;
  const pre: Record<string, number> = {};
  if (d.kind === 'farm') for (const s of g.player.inv) if (s) pre[s.id] = (pre[s.id] ?? 0) + s.qty;
  const run: RunState = {
    id, dest: d.id, map: d.map, kind: d.kind, tier: d.kind === 'dungeon' ? tier : 0, seed: hashSeed(`${g.seed}:run:${id}`),
    depleted: [], chests: {}, killed: [], gains: {}, pre, checkpoint: null, lit: [], opened: [], bossDefeated: false, startedAt: g.clock, votive: {},
  };
  g.run = run;
  g.lastDest = d.id;
  g.stats.outings++;
  if (d.kind === 'dungeon') g.dungeon(d.id).runs++;
  const l = g.level(d.map);
  if (d.kind === 'main' && l.status === 'new') l.status = 'progress';
  const variant: Variant = d.kind === 'dungeon' ? 'dungeon' : 'main';
  const cp = d.kind === 'main' ? l.checkpoint : null;
  loadMap(g, d.map, variant, cp ? { kind: 'checkpoint', key: cp } : { kind: 'start' });
  g.log(`Départ : ${d.name}${d.kind === 'dungeon' ? ` (palier ${tier})` : ''}.`);
  g.emit({ type: 'save', reason: 'depart' });
  return { ok: true };
}

/** Rentre au camp (depuis une sortie ou un point de halte) : met les ressources en sûreté. */
export function returnToCamp(g: Game): Check {
  const run = g.run;
  if (!run) return { ok: false, reason: 'Vous êtes déjà au camp.' };
  const d = DEST_BY_ID[run.dest];
  storeFog(g);
  let text = '';
  if (run.kind === 'farm') {
    const got = Object.entries(run.gains).map(([id, n]) => [id, Math.min(n, Math.max(0, countItem(g.player.inv, id) - (run.pre[id] ?? 0)))] as const).filter(([, n]) => n > 0);
    text = got.length ? `Ressources rapportées : ${got.map(([id, n]) => `${n} ${item(id).name.toLowerCase()}`).join(', ')}.` : 'Retour au camp.';
  } else if (run.kind === 'main') {
    const l = g.level(run.map);
    text = l.status === 'done' ? `${d.name} : terminée.` : `${d.name} : progression conservée${l.checkpoint ? ` (point de halte : ${checkpointName(g, run.map)})` : ''}.`;
  } else text = run.bossDefeated ? `${d.name} : palier ${run.tier} réussi.` : `${d.name} : instance abandonnée (aucun changement de palier).`;
  g.run = null;
  g.stats.returns++;
  g.flags.add('first_return');
  g.player.st = newStatuses();
  loadMap(g, 'camp', 'main', { kind: 'travel' });
  g.toast(text, 'good');
  g.log(text);
  g.emit({ type: 'save', reason: 'return' });
  return { ok: true };
}

export function enterHouse(g: Game): void {
  loadMap(g, 'house', 'main', { kind: 'door', to: 'camp' });
  g.emit({ type: 'sound', key: 'door_open' });
}

export function leaveHouse(g: Game): void {
  loadMap(g, 'camp', 'main', { kind: 'door', to: 'house' });
  g.emit({ type: 'sound', key: 'door_close' });
}

// ------------------------------------------------------------ points de halte, portes
export function lightCheckpoint(g: Game, o: WObj): void {
  const run = g.run;
  if (!run) return;
  if (!o.open) {
    lightSprite(o);
    g.player.hp = Math.min(maxHp(g), g.player.hp + maxHp(g) * CHECKPOINT.healOnLight);
    g.emit({ type: 'sound', key: o.votive ? 'bubble' : 'chop_2' });
    g.emit({ type: 'objChanged', id: o.id });
    g.toast(`${o.label} : vous reviendrez ici en cas de chute. ${o.votive ? 'La lanterne tient les créatures à distance un moment.' : ''}`.trim(), 'good');
  }
  if (o.votive) run.votive[o.key] = g.clock + CHECKPOINT.votiveDuration;
  run.checkpoint = o.key;
  if (!run.lit.includes(o.key)) run.lit.push(o.key);
  if (run.kind === 'main') {
    const l = g.level(run.map);
    l.checkpoint = o.key;
    if (!l.lit.includes(o.key)) l.lit.push(o.key);
  }
  g.emit({ type: 'save', reason: 'checkpoint' });
}

export function openGateGroup(g: Game, id: string): void {
  let n = 0;
  for (const o of g.world.objects) {
    if (o.type === 'gate' && o.target === id && !o.open) {
      setGate(o, true);
      g.emit({ type: 'objChanged', id: o.id });
      n++;
    }
  }
  if (!n) return;
  g.world.version++;
  const run = g.run;
  if (run) {
    if (run.kind === 'main') {
      const l = g.level(run.map);
      if (!l.opened.includes(id)) l.opened.push(id);
    } else if (!run.opened.includes(id)) run.opened.push(id);
  }
  g.emit({ type: 'sound', key: 'chain' });
  g.emit({ type: 'terrainChanged' });
}

export function pullLever(g: Game, o: WObj): void {
  if (o.open) {
    g.toast(`${o.label} : déjà actionné.`, 'info');
    return;
  }
  o.open = true;
  g.emit({ type: 'objChanged', id: o.id });
  openGateGroup(g, o.target!);
  const gate = g.world.objects.find((x) => x.type === 'gate' && x.target === o.target);
  g.toast(`${o.label} actionné : ${gate?.label?.toLowerCase() ?? 'un passage'} s’ouvre.`, 'good');
  g.emit({ type: 'save', reason: 'lever' });
}

/** Côté depuis lequel le raccourci peut être ouvert. */
export function shortcutSideOk(g: Game, o: WObj): boolean {
  const p = g.player;
  const tx = p.x / TILE;
  const ty = p.y / TILE;
  switch (o.side) {
    case 'north':
      return ty < o.fy + 0.9;
    case 'south':
      return ty > o.fy + (o.cells?.length ? Math.max(...o.cells.map((c) => c.y)) - o.fy : 0) + 0.2;
    case 'east':
      return tx > o.fx + 0.9;
    case 'west':
      return tx < o.fx;
    default:
      return true;
  }
}

export function openShortcut(g: Game, o: WObj): void {
  if (o.open) return;
  if (!shortcutSideOk(g, o)) {
    g.toast(`${o.label} : impossible de l’atteindre de ce côté.`, 'info');
    return;
  }
  setShortcut(g.world, o, true);
  const run = g.run;
  if (run) {
    if (run.kind === 'main') {
      const l = g.level(run.map);
      if (!l.opened.includes(o.key)) l.opened.push(o.key);
    } else if (!run.opened.includes(o.key)) run.opened.push(o.key);
  }
  g.emit({ type: 'objChanged', id: o.id });
  g.emit({ type: 'terrainChanged' });
  g.emit({ type: 'sound', key: 'build' });
  g.toast(`Raccourci ouvert : ${(o.label ?? 'passage').toLowerCase()}.`, 'good');
  g.emit({ type: 'save', reason: 'shortcut' });
}

// ------------------------------------------------------------ victoires
export function onEnemyKilled(g: Game, e: Enemy): void {
  const d = ENEMIES[e.type];
  g.stats.kills[e.type] = (g.stats.kills[e.type] ?? 0) + 1;
  g.emit({ type: 'sound', key: d.sound?.death ?? 'zdeath', x: e.x, y: e.y });
  const run = g.run;
  if (run && !e.minion && !run.killed.includes(e.key)) run.killed.push(e.key);
  // butin : directement dans le sac (tirage déterministe de la partie)
  const dungeonBoss = e.boss && run?.kind === 'dungeon';
  if (!e.minion && !dungeonBoss) {
    for (const dr of d.drops) {
      if (!g.rng.chance(dr.chance)) continue;
      const n = g.rng.int(dr.min, dr.max);
      g.give(dr.id, n, { collected: true });
      g.emit({ type: 'collect', id: dr.id, n });
    }
  }
  if (e.boss) onBossDefeated(g, e);
}

function onBossDefeated(g: Game, e: Enemy): void {
  const run = g.run;
  const d = ENEMIES[e.type];
  g.emit({ type: 'boss', name: d.name, active: false });
  g.emit({ type: 'sound', key: 'win' });
  g.emit({ type: 'shake', strength: 0.012 });
  if (!run) return;
  run.bossDefeated = true;
  const dest = DEST_BY_ID[run.dest];
  if (run.kind === 'dungeon') {
    const s = g.dungeon(run.dest);
    const tier = run.tier;
    if (!s.cleared.includes(tier)) s.cleared.push(tier);
    let msg = `Palier ${tier} réussi !`;
    if (tier === s.unlocked && s.unlocked < MAX_TIER) {
      s.unlocked++;
      msg += ` Palier ${s.unlocked} débloqué.`;
    } else if (tier >= MAX_TIER) msg += ' Palier maximal atteint.';
    s.lastWin = g.clock;
    addRewardChest(g, run, `reward:${run.id}`, e.x, e.y);
    g.emit({ type: 'runEnd', title: `${dest.name} — palier ${tier}`, text: `${msg} Le coffre de récompense est apparu. Rentrez ensuite au camp par la sortie.` });
    g.log(`${dest.name} : ${msg}`);
  } else {
    const l = g.level(run.map);
    const bp = g.bossPoints.find((b) => b.type === e.type);
    if (bp && !l.bosses.includes(bp.key)) l.bosses.push(bp.key);
    if (dest.bossFlag) g.flags.add(dest.bossFlag);
    for (const o of g.world.objects) if (o.type === 'gate' && o.openedBy === 'boss' && !o.open) {
      setGate(o, true);
      g.emit({ type: 'objChanged', id: o.id });
    }
    g.world.version++;
    g.emit({ type: 'terrainChanged' });
    let text = `${d.name} est vaincu.`;
    if (run.kind === 'main') {
      l.status = 'done';
      const unlocked = Object.values(DEST_BY_ID).filter((x) => x.requires.includes(dest.bossFlag ?? '')).map((x) => x.name);
      text += unlocked.length ? ` Nouvelles destinations : ${unlocked.join(', ')}.` : '';
      text += ' Un passage s’est ouvert vers la sortie.';
    }
    g.emit({ type: 'runEnd', title: `${dest.name}`, text });
    g.log(text);
  }
  g.emit({ type: 'save', reason: 'boss' });
}

function addRewardChest(g: Game, run: RunState, key: string, x?: number, y?: number): void {
  const w = g.world;
  const bp = g.bossPoints[0];
  const px = x ?? ((bp?.x ?? w.start.x) + 0.5) * TILE;
  const py = y ?? ((bp?.y ?? w.start.y) + 0.5) * TILE;
  const spot = nearestFree(w, Math.floor(px / TILE), Math.floor(py / TILE));
  const loot = DUNGEONS[run.dest].tiers[run.tier - 1].loot;
  const o: WObj = { id: -1, key, type: 'container', sprite: 'world:chest_big_closed', fx: spot.x, fy: spot.y, fw: 1, fh: 1, solid: true, loot, renew: true, items: null, label: 'Récompense du donjon' };
  if (run.chests[key]) {
    o.items = cloneSlots(run.chests[key]);
    o.opened = true;
  }
  w.registerObject(o);
  g.emit({ type: 'objChanged', id: o.id });
  g.emit({ type: 'mapChanged' });
}

// ------------------------------------------------------------ donjons
function spawnDungeon(g: Game): void {
  const run = g.run!;
  const dd = DUNGEONS[run.dest];
  const tier: TierDef = dd.tiers[run.tier - 1];
  const r = new Rng(hashSeed(`${run.seed}:tier`));
  g.enemies = [];
  resetEnemyGrid();
  for (const sp of g.spawns) {
    if (!sp.slot || !tier.slots.includes(sp.slot)) continue;
    const group: EnemyType[] = sp.group.map((t) => tier.swap?.[t] ?? t);
    for (let i = 0; i < tier.extra; i++) group.push(group[0]);
    group.forEach((t, i) => {
      const key = `${sp.key}#${i}`;
      const elite = r.chance(tier.elite);
      if (run.killed.includes(key)) return;
      const x = (sp.x + 0.5) * TILE + ((i % 3) - 1) * 16;
      const y = (sp.y + 0.5) * TILE + Math.floor(i / 3) * 16;
      spawnEnemy(g, t, x, y, { key, hpMul: tier.hpMul, dmgMul: tier.dmgMul, elite, asleep: sp.asleep && t === 'husk' });
    });
  }
  const bp = g.bossPoints[0];
  if (bp && !run.killed.includes('dboss') && !run.bossDefeated) {
    spawnEnemy(g, dd.boss, (bp.x + 0.5) * TILE, (bp.y + 0.5) * TILE, { key: 'dboss', boss: true, hpMul: tier.bossHpMul, dmgMul: tier.dmgMul, elite: run.tier >= 3 });
  }
}

// ------------------------------------------------------------ mort
export function killPlayer(g: Game, reason: string): void {
  const p = g.player;
  if (p.dead) return;
  p.hp = 0;
  p.dead = true;
  p.deathT = 1.6;
  p.action = 'none';
  p.combo = null;
  p.dashT = 0;
  g.stats.deaths++;
  g.bossActive = null;
  g.emit({ type: 'sound', key: 'lose' });
  const run = g.run;
  const summary: DeathSummary = { where: run?.kind ?? 'camp', reason, lost: [], checkpoint: null };
  if (run?.kind === 'farm') {
    // perte de 20 % des ressources de sortie encore détenues (les réserves du départ sont protégées)
    for (const [id, gained] of Object.entries(run.gains)) {
      const held = countItem(p.inv, id);
      const base = Math.min(gained, Math.max(0, held - (run.pre[id] ?? 0)));
      const n = farmLossAmount(base);
      if (n > 0 && removeItem(p.inv, id, n)) summary.lost.push({ id, n });
    }
  } else if (run) {
    const key = run.checkpoint ?? (run.kind === 'main' ? g.level(run.map).checkpoint : null);
    summary.checkpoint = key ? checkpointName(g, run.map) ?? 'point de halte' : null;
  }
  g.log(`Chute : ${reason}`);
  g.emit({ type: 'death', summary });
}

/** Après la chute : retour au camp (sortie de ressources) ou au dernier point de halte. */
export function respawn(g: Game): void {
  const p = g.player;
  const run = g.run;
  p.dead = false;
  p.st = newStatuses();
  p.combo = null;
  p.stamina = 100;
  p.mana = 100;
  p.hunger = Math.max(p.hunger, 40);
  p.invuln = DEATH.protect;
  p.shield = 0;
  p.parryT = 0;
  if (!run) {
    p.hp = maxHp(g);
    return;
  }
  if (run.kind === 'farm') {
    storeFog(g);
    g.run = null;
    g.flags.add('first_return');
    loadMap(g, 'camp', 'main', { kind: 'travel' });
    p.hp = maxHp(g) * DEATH.respawnHealth;
    g.emit({ type: 'save', reason: 'respawn' });
    return;
  }
  // expédition principale ou donjon : progrès spatial perdu (les ennemis ordinaires reviennent),
  // équipement, coffres vidés, raccourcis et boss vaincus conservés
  run.killed = run.killed.filter((k) => !k.includes('#'));
  storeFog(g);
  const key = run.checkpoint ?? (run.kind === 'main' ? g.level(run.map).checkpoint : null);
  loadMap(g, run.map, run.kind === 'dungeon' ? 'dungeon' : 'main', key ? { kind: 'checkpoint', key } : { kind: 'start' });
  p.hp = maxHp(g) * DEATH.respawnHealth;
  p.weakT = DEATH.weakDuration;
  p.invuln = DEATH.protect;
  g.emit({ type: 'save', reason: 'respawn' });
}
