// Actions du joueur hors déplacement : fabrication, objets, construction, repos.
import { DAY, PLAYER, TILE } from '../config/balance';
import { BUILDING_BY_ID } from '../data/buildings';
import { item, type EquipSlot } from '../data/items';
import { RECIPE_BY_ID, STATION_NAMES, type Recipe } from '../data/recipes';
import type { Game } from './game';
import {
  addItem, cloneSlots, countItem, hasAll, moveBetween, quickTransfer, removeAll, type Slots,
} from './inventory';

export interface Check {
  ok: boolean;
  reason?: string;
}

// ------------------------------------------------------------ fabrication
export function canCraft(g: Game, r: Recipe): Check {
  if (!g.nearStation(r.station)) return { ok: false, reason: `Nécessite : ${STATION_NAMES[r.station]} à proximité` };
  const missing = Object.entries(r.inputs).filter(([id, n]) => countItem(g.player.inv, id) < n);
  if (missing.length) return { ok: false, reason: `Manque : ${missing.map(([id, n]) => `${n - countItem(g.player.inv, id)} ${item(id).name}`).join(', ')}` };
  // atomique : on simule sur une copie
  const test = cloneSlots(g.player.inv);
  removeAll(test, r.inputs);
  if (addItem(test, r.output, r.qty) > 0) return { ok: false, reason: 'Inventaire plein : libérez de la place' };
  return { ok: true };
}

export function craft(g: Game, recipeId: string): Check {
  const r = RECIPE_BY_ID[recipeId];
  if (!r) return { ok: false, reason: 'Recette inconnue' };
  const c = canCraft(g, r);
  if (!c.ok) {
    g.emit({ type: 'sound', key: 'error' });
    return c;
  }
  const test = cloneSlots(g.player.inv);
  removeAll(test, r.inputs);
  addItem(test, r.output, r.qty);
  g.player.inv = test; // validation en une seule fois
  g.stats.crafted[r.output] = (g.stats.crafted[r.output] ?? 0) + r.qty;
  g.emit({ type: 'sound', key: 'craft' });
  g.toast(`Fabriqué : ${r.qty > 1 ? `${r.qty} × ` : ''}${item(r.output).name}`, 'good');
  return { ok: true };
}

// ------------------------------------------------------------ objets
export function useSlot(g: Game, idx: number): Check {
  const p = g.player;
  const st = p.inv[idx];
  if (!st) return { ok: false };
  const d = item(st.id);
  if (d.food) {
    if (p.hunger >= PLAYER.maxHunger - 2 && !d.food.health) {
      g.toast('Vous n’avez pas faim.', 'info');
      return { ok: false, reason: 'Pas faim' };
    }
    p.hunger = Math.min(PLAYER.maxHunger, p.hunger + d.food.hunger);
    if (d.food.health) p.hp = Math.min(PLAYER.maxHealth, p.hp + d.food.health);
    if (d.food.regen) {
      p.regenT = 60;
      p.regenRate = d.food.regen;
    }
    st.qty--;
    if (st.qty <= 0) p.inv[idx] = null;
    g.stats.ate++;
    g.emit({ type: 'sound', key: 'eat' });
    g.emit({ type: 'float', x: p.x, y: p.y - 46, text: `+${d.food.hunger} faim`, color: '#f5d76e' });
    return { ok: true };
  }
  if (d.heal) {
    if (p.hp >= PLAYER.maxHealth) {
      g.toast('Vous n’êtes pas blessé.', 'info');
      return { ok: false };
    }
    p.healT = 4;
    p.healRate = d.heal / 4;
    st.qty--;
    if (st.qty <= 0) p.inv[idx] = null;
    g.emit({ type: 'sound', key: 'pick_0' });
    return { ok: true };
  }
  if (d.slot) return equipSlot(g, idx);
  if (d.kind === 'quest') {
    g.toast('Un fragment du sceau. À déposer au sanctuaire, tout au nord.', 'info');
    return { ok: false };
  }
  g.toast(d.desc, 'info');
  return { ok: false };
}

export function equipSlot(g: Game, idx: number): Check {
  const p = g.player;
  const st = p.inv[idx];
  if (!st) return { ok: false };
  const slot = item(st.id).slot;
  if (!slot) return { ok: false, reason: 'Ne s’équipe pas' };
  const prev = p.equip[slot];
  p.equip[slot] = st;
  p.inv[idx] = prev; // échange : rien n'est perdu
  g.emit({ type: 'sound', key: 'pick_1' });
  return { ok: true };
}

export function unequip(g: Game, slot: EquipSlot): Check {
  const p = g.player;
  const st = p.equip[slot];
  if (!st) return { ok: false };
  const free = p.inv.findIndex((s) => !s);
  if (free < 0) {
    g.toast('Inventaire plein : impossible de retirer cet équipement.', 'warn');
    return { ok: false, reason: 'Inventaire plein' };
  }
  p.inv[free] = st;
  p.equip[slot] = null;
  return { ok: true };
}

export function dropSlot(g: Game, idx: number): Check {
  const p = g.player;
  const st = p.inv[idx];
  if (!st) return { ok: false };
  if (item(st.id).kind === 'quest') {
    g.toast('Un fragment du sceau ne peut pas être jeté.', 'warn');
    return { ok: false, reason: 'Objet de quête' };
  }
  p.inv[idx] = null;
  g.dropNear(p.x + p.aimX * 18, p.y + p.aimY * 18, [st]);
  g.emit({ type: 'sound', key: 'pick_0' });
  return { ok: true };
}

export function moveSlot(g: Game, a: number, b: number): void {
  moveBetween(g.player.inv, a, g.player.inv, b);
}

export function repairCostItem(slotStack: { id: string }): Record<string, number> | null {
  return item(slotStack.id).repair?.cost ?? null;
}

export function repairItem(g: Game, where: EquipSlot | number): Check {
  const p = g.player;
  const st = typeof where === 'number' ? p.inv[where] : p.equip[where];
  if (!st) return { ok: false };
  const d = item(st.id);
  if (!d.repair || d.durability === undefined) return { ok: false, reason: 'Ne se répare pas' };
  if ((st.dur ?? d.durability) >= d.durability) return { ok: false, reason: 'Déjà en bon état' };
  if (!g.nearStation(d.repair.station)) return { ok: false, reason: `Nécessite : ${STATION_NAMES[d.repair.station]} à proximité` };
  if (!hasAll(p.inv, d.repair.cost)) return { ok: false, reason: `Manque : ${Object.entries(d.repair.cost).map(([id, n]) => `${n} ${item(id).name}`).join(', ')}` };
  removeAll(p.inv, d.repair.cost);
  st.dur = d.durability;
  g.emit({ type: 'sound', key: 'craft' });
  g.toast(`${d.name} réparé(e).`, 'good');
  return { ok: true };
}

// ------------------------------------------------------------ conteneurs
export function containerSlots(g: Game): Slots | null {
  const c = g.openContainer;
  if (!c) return null;
  if (c.kind === 'obj') return g.world.objects[c.id]?.items ?? null;
  if (c.kind === 'building') return g.world.buildings.get(c.id)?.items ?? null;
  return g.world.bags.get(c.id)?.items ?? null;
}

export function containerName(g: Game): string {
  const c = g.openContainer;
  if (!c) return '';
  if (c.kind === 'obj') return g.world.objects[c.id]?.label ?? 'Conteneur';
  if (c.kind === 'building') return 'Coffre';
  return 'Sac';
}

/** Vérifie que le conteneur ouvert est toujours à portée. */
export function containerInRange(g: Game): boolean {
  const c = g.openContainer;
  if (!c) return false;
  const p = g.player;
  let x = 0;
  let y = 0;
  if (c.kind === 'obj') {
    const o = g.world.objects[c.id];
    x = (o.fx + o.fw / 2) * TILE;
    y = (o.fy + o.fh / 2) * TILE;
  } else if (c.kind === 'building') {
    const b = g.world.buildings.get(c.id);
    if (!b) return false;
    ({ x, y } = g.world.buildingCenter(b));
  } else {
    const b = g.world.bags.get(c.id);
    if (!b) return false;
    x = b.x;
    y = b.y;
  }
  return Math.hypot(p.x - x, p.y - y) < 3 * TILE;
}

export function takeFromContainer(g: Game, idx: number): number {
  const slots = containerSlots(g);
  if (!slots) return 0;
  const before = slots[idx]?.qty ?? 0;
  const n = quickTransfer(slots, idx, g.player.inv);
  if (before > 0 && n < before) g.toast('Inventaire plein.', 'warn');
  cleanupBag(g);
  return n;
}

export function putInContainer(g: Game, idx: number): number {
  const slots = containerSlots(g);
  if (!slots) return 0;
  const st = g.player.inv[idx];
  if (!st) return 0;
  if (item(st.id).kind === 'quest') {
    g.toast('Gardez les fragments sur vous.', 'warn');
    return 0;
  }
  const n = quickTransfer(g.player.inv, idx, slots);
  if (n === 0) g.toast('Ce conteneur est plein.', 'warn');
  return n;
}

export function takeAll(g: Game): void {
  const slots = containerSlots(g);
  if (!slots) return;
  let blocked = false;
  for (let i = 0; i < slots.length; i++) {
    if (!slots[i]) continue;
    quickTransfer(slots, i, g.player.inv);
    if (slots[i]) blocked = true;
  }
  if (blocked) g.toast('Inventaire plein : une partie reste dans le conteneur.', 'warn');
  g.emit({ type: 'sound', key: 'pick_1' });
  cleanupBag(g);
}

function cleanupBag(g: Game): void {
  const c = g.openContainer;
  if (c && c.kind === 'bag') {
    const bag = g.world.bags.get(c.id);
    if (bag && bag.items.every((s) => !s)) {
      g.world.bags.delete(c.id);
      if (g.deathBagId === c.id) g.deathBagId = -1;
      g.openContainer = null;
      g.emit({ type: 'bagsChanged' });
    }
  }
}

// ------------------------------------------------------------ construction
export function canPlace(g: Game, type: string, tx: number, ty: number): Check {
  const d = BUILDING_BY_ID[type];
  const w = g.world;
  const p = g.player;
  if (!hasAll(p.inv, d.cost)) return { ok: false, reason: `Manque : ${Object.entries(d.cost).filter(([id, n]) => countItem(p.inv, id) < n).map(([id, n]) => `${n - countItem(p.inv, id)} ${item(id).name}`).join(', ')}` };
  const cx = (tx + d.w / 2) * TILE;
  const cy = (ty + d.h / 2) * TILE;
  if (Math.hypot(cx - p.x, cy - p.y) > PLAYER.buildRange) return { ok: false, reason: 'Trop loin' };
  for (let y = ty; y < ty + d.h; y++)
    for (let x = tx; x < tx + d.w; x++) {
      if (!w.inBounds(x, y) || x < 1 || y < 1 || x >= w.w - 1 || y >= w.h - 1) return { ok: false, reason: 'Hors de la carte' };
      const i = w.idx(x, y);
      if (w.reserved[i]) return { ok: false, reason: 'Zone protégée' };
      if (w.buildingAt[i] >= 0) return { ok: false, reason: 'Déjà construit ici' };
      const o = w.objectAtTile(x, y);
      if (o && !o.removed) return { ok: false, reason: o.type === 'note' || o.type === 'altar' || o.type === 'sanctuary' ? 'Objet important ici' : 'Emplacement occupé' };
      if (d.needsGrass && !w.isGrassTile(x, y)) return { ok: false, reason: 'Doit être posé sur l’herbe' };
    }
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  const x1 = (tx + d.w) * TILE;
  const y1 = (ty + d.h) * TILE;
  const overlaps = (x: number, y: number, r: number) => x + r > x0 && x - r < x1 && y + r * 0.4 > y0 && y - r * 0.6 < y1;
  if (d.blocks && !d.playerPasses && overlaps(p.x, p.y, PLAYER.radius)) return { ok: false, reason: 'Vous êtes sur l’emplacement' };
  for (const e of g.enemies) if (e.dying <= 0 && overlaps(e.x, e.y, 10)) return { ok: false, reason: 'Un ennemi gêne' };
  for (const b of w.bags.values()) if (overlaps(b.x, b.y, 8)) return { ok: false, reason: 'Un sac est au sol ici' };
  // accès : au moins une case libre autour pour les constructions utilisables
  if (d.station || d.storage || d.spawnPoint) {
    let access = false;
    for (let y = ty - 1; y <= ty + d.h && !access; y++)
      for (let x = tx - 1; x <= tx + d.w; x++) {
        const inside = x >= tx && x < tx + d.w && y >= ty && y < ty + d.h;
        if (!inside && w.passableForPlayer(x, y)) {
          access = true;
          break;
        }
      }
    if (!access) return { ok: false, reason: 'L’accès serait bloqué' };
  }
  return { ok: true };
}

export function place(g: Game, type: string, tx: number, ty: number): Check {
  const c = canPlace(g, type, tx, ty);
  if (!c.ok) {
    g.emit({ type: 'sound', key: 'error' });
    return c;
  }
  const d = BUILDING_BY_ID[type];
  removeAll(g.player.inv, d.cost);
  g.world.addBuilding(type, tx, ty);
  g.stats.built[type] = (g.stats.built[type] ?? 0) + 1;
  g.emit({ type: 'sound', key: 'build' });
  g.emit({ type: 'buildChanged' });
  g.toast(`${d.name} construit(e).`, 'good');
  g.emit({ type: 'save', reason: 'build' });
  return { ok: true };
}

export function demolishRefund(type: string): Record<string, number> {
  const d = BUILDING_BY_ID[type];
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(d.cost)) {
    const k = Math.floor(n * d.refund);
    if (k > 0) out[id] = k;
  }
  return out;
}

export function demolish(g: Game, buildingId: number): Check {
  const b = g.world.buildings.get(buildingId);
  if (!b) return { ok: false };
  const c = g.world.buildingCenter(b);
  if (Math.hypot(c.x - g.player.x, c.y - g.player.y) > PLAYER.buildRange + TILE) return { ok: false, reason: 'Trop loin' };
  const refund = demolishRefund(b.type);
  g.destroyBuilding(b, true);
  for (const [id, n] of Object.entries(refund)) g.give(id, n);
  g.emit({ type: 'sound', key: 'build' });
  g.toast(`${BUILDING_BY_ID[b.type].name} démoli(e). Remboursé : ${Object.entries(refund).map(([id, n]) => `${n} ${item(id).name}`).join(', ') || 'rien'}.`, 'info');
  g.emit({ type: 'save', reason: 'demolish' });
  return { ok: true };
}

// ------------------------------------------------------------ repos
export function canSleep(g: Game): Check {
  const ph = g.phase();
  if (ph === 'day') return { ok: false, reason: 'On ne dort que le soir ou la nuit.' };
  const a = g.assault;
  if (ph === 'night' && a && a.night === g.day && !a.done) return { ok: false, reason: 'La horde de cette nuit n’a pas encore été repoussée.' };
  if (ph === 'dusk') {
    // au crépuscule, la horde n'est pas encore venue : il faut l'affronter
    return { ok: false, reason: 'La horde arrive à la nuit : impossible de dormir maintenant.' };
  }
  if (g.final.state === 'active') return { ok: false, reason: 'L’assaut final est en cours !' };
  const p = g.player;
  if (g.enemies.some((e) => e.dying <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < 12 * TILE)) return { ok: false, reason: 'Des ennemis sont trop proches.' };
  if (p.hunger < 20) return { ok: false, reason: 'Vous avez trop faim pour dormir.' };
  return { ok: true };
}

export function sleep(g: Game): Check {
  const c = canSleep(g);
  if (!c.ok) return c;
  const p = g.player;
  const skip = g.dayTime >= DAY.dawnStart ? 0 : DAY.dawnStart - g.dayTime;
  g.dayTime = DAY.dawnStart;
  g.clock += skip;
  p.hunger = Math.max(0, p.hunger - 18);
  p.hp = Math.min(PLAYER.maxHealth, p.hp + 35);
  p.stamina = PLAYER.maxStamina;
  g.toast('Vous dormez jusqu’à l’aube. (-18 faim, +35 PV)', 'good');
  return { ok: true };
}
