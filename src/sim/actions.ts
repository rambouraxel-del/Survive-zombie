// Actions du joueur hors combat : fabrication, objets, équipement, camp (construction,
// déplacement, démolition), enchantement, repos, choix de l'arme de départ, raccourcis.
import { PLAYER, TILE } from '../config/balance';
import { BUILDING_BY_ID, buildingStats } from '../data/buildings';
import { ENCHANT_BY_ID } from '../data/enchants';
import { item, type EquipSlot } from '../data/items';
import { RECIPE_BY_ID, STATION_NAMES, type Recipe } from '../data/recipes';
import type { Game } from './game';
import { addItem, cloneSlots, countItem, moveBetween, quickTransfer, removeItem, type Slots, type Stack } from './inventory';
import { hotbarQty, isEquipped } from './hotbar';
import { canEquipItem, currentFamily, maxHp, type Check } from './profile';
import { throwBomb } from './combat';
import type { Building } from '../world/world';

export type { Check };

// ------------------------------------------------------------ réserves du camp
/** Quantité utilisable : le sac, plus les coffres du camp quand on y est. */
export function available(g: Game, id: string): number {
  let n = countItem(g.player.inv, id);
  for (const c of g.campChests()) n += countItem(c, id);
  return n;
}

/** Retire un coût : le sac d'abord, puis les coffres du camp (tout ou rien). */
export function payCost(g: Game, cost: Record<string, number>, times = 1): boolean {
  for (const [id, n] of Object.entries(cost)) if (available(g, id) < n * times) return false;
  const chests = g.campChests();
  for (const [id, n] of Object.entries(cost)) {
    let left = n * times;
    const inBag = Math.min(left, countItem(g.player.inv, id));
    if (inBag) removeItem(g.player.inv, id, inBag);
    left -= inBag;
    for (const c of chests) {
      if (left <= 0) break;
      const k = Math.min(left, countItem(c, id));
      if (k) removeItem(c, id, k);
      left -= k;
    }
  }
  return true;
}

export function missingText(g: Game, cost: Record<string, number>, times = 1): string {
  return Object.entries(cost).filter(([id, n]) => available(g, id) < n * times).map(([id, n]) => `${n * times - available(g, id)} ${item(id).name}`).join(', ');
}

// ------------------------------------------------------------ fabrication
export function recipeQty(g: Game, r: Recipe): number {
  if (r.id === 'r_planks' && g.stationLevel('workbench') >= 2) return r.qty + 1;
  return r.qty;
}

export function canCraft(g: Game, r: Recipe, times = 1): Check {
  if (!g.nearStation(r.station)) return { ok: false, reason: `Nécessite : ${STATION_NAMES[r.station]} à proximité` };
  const miss = missingText(g, r.inputs, times);
  if (miss) return { ok: false, reason: `Manque : ${miss}` };
  // place dans le sac pour le résultat (les ingrédients du sac sont retirés d'abord)
  const test = cloneSlots(g.player.inv);
  for (const [id, n] of Object.entries(r.inputs)) removeItem(test, id, Math.min(n * times, countItem(test, id)));
  if (addItem(test, r.output, recipeQty(g, r) * times) > 0) return { ok: false, reason: 'Sac plein : libérez de la place' };
  return { ok: true };
}

export function maxCraftable(g: Game, r: Recipe, cap = 99): number {
  if (!g.nearStation(r.station)) return 0;
  let n = Math.min(cap, ...Object.entries(r.inputs).map(([id, k]) => Math.floor(available(g, id) / k)));
  while (n > 0 && !canCraft(g, r, n).ok) n--;
  return n;
}

export function craft(g: Game, recipeId: string, times = 1): Check {
  const r = RECIPE_BY_ID[recipeId];
  if (!r) return { ok: false, reason: 'Recette inconnue' };
  times = Math.max(1, Math.floor(times));
  const c = canCraft(g, r, times);
  if (!c.ok) {
    g.emit({ type: 'sound', key: 'error' });
    return c;
  }
  const qty = recipeQty(g, r) * times;
  payCost(g, r.inputs, times);
  addItem(g.player.inv, r.output, qty);
  g.stats.crafted[r.output] = (g.stats.crafted[r.output] ?? 0) + qty;
  g.stats.craftedBy[r.id] = (g.stats.craftedBy[r.id] ?? 0) + times;
  const d = item(r.output);
  if (d.slot && !g.player.equip[d.slot] && canEquipItem(g, r.output).ok) {
    const idx = g.player.inv.findIndex((s) => s && s.id === r.output);
    if (idx >= 0) equipSlot(g, idx);
  }
  g.emit({ type: 'sound', key: 'craft' });
  g.toast(`Fabriqué : ${qty > 1 ? `${qty} × ` : ''}${d.name}`, 'good');
  g.log(`Fabriqué : ${qty > 1 ? `${qty} × ` : ''}${d.name}.`);
  return { ok: true };
}

// ------------------------------------------------------------ nourriture et consommables
export interface FoodGain {
  nominal: number;
  effective: number;
  surplus: number;
  heal: number;
  regen: boolean;
  useful: boolean;
}

export function foodGain(g: Game, id: string): FoodGain | null {
  const f = item(id).food;
  if (!f) return null;
  const p = g.player;
  const effective = Math.max(0, Math.min(PLAYER.maxHunger, p.hunger + f.hunger) - p.hunger);
  const mhp = maxHp(g);
  const heal = f.health ? Math.max(0, Math.min(mhp, p.hp + f.health) - p.hp) : 0;
  const regen = !!f.regen && p.hp < mhp;
  const e = Math.round(effective);
  return { nominal: f.hunger, effective: e, surplus: f.hunger - e, heal: Math.round(heal), regen, useful: e >= 1 || heal >= 1 || regen };
}

/** Effet réel d'un consommable (soin, récupération) : sert aussi à bloquer un usage inutile. */
export function useGain(g: Game, id: string): { text: string; useful: boolean } | null {
  const u = item(id).use;
  if (!u) return null;
  const p = g.player;
  if (u.heal) {
    const n = Math.round(Math.max(0, Math.min(maxHp(g), p.hp + u.heal) - p.hp));
    return { text: `+${n} PV`, useful: n >= 1 };
  }
  if (u.restore) {
    const n = Math.round(PLAYER.maxStamina - p.stamina + PLAYER.maxMana - p.mana);
    return { text: `endurance et mana au maximum, récupération accrue 20 s`, useful: n >= 10 || p.boostT <= 0 };
  }
  if (u.bomb) return { text: `${u.bomb.damage} dégâts de zone`, useful: !g.atCamp };
  return null;
}

export function useSlot(g: Game, idx: number): Check {
  const p = g.player;
  const st = p.inv[idx];
  if (!st) return { ok: false };
  const d = item(st.id);
  if (d.food) {
    const gain = foodGain(g, st.id)!;
    if (!gain.useful) {
      g.toast('Vous n’avez pas faim.', 'info');
      return { ok: false, reason: 'Pas faim' };
    }
    p.hunger = Math.min(PLAYER.maxHunger, p.hunger + d.food.hunger);
    if (d.food.health) p.hp = Math.min(maxHp(g), p.hp + d.food.health);
    if (d.food.regen) {
      p.regenT = 60;
      p.regenRate = d.food.regen;
    }
    consume(p.inv, idx);
    g.stats.ate++;
    g.emit({ type: 'sound', key: 'eat' });
    g.emit({ type: 'float', x: p.x, y: p.y - 46, text: `+${gain.effective} faim${gain.heal ? ` · +${gain.heal} PV` : ''}`, color: '#f5d76e' });
    return { ok: true };
  }
  if (d.use) {
    const gain = useGain(g, st.id)!;
    if (!gain.useful) {
      g.toast(d.use.bomb ? 'Pas de bombe au camp.' : d.use.heal ? 'Vous n’êtes pas blessé.' : 'Endurance et mana sont déjà au maximum.', 'info');
      return { ok: false, reason: 'Inutile' };
    }
    if (d.use.heal) {
      p.healT = d.use.healTime ?? 3;
      p.healRate = d.use.heal / p.healT;
      g.emit({ type: 'fx', kind: 'heal', x: p.x, y: p.y - 30 });
      g.emit({ type: 'sound', key: 'bottle' });
    }
    if (d.use.restore) {
      p.stamina = PLAYER.maxStamina;
      p.mana = PLAYER.maxMana;
      p.boostT = 20;
      g.emit({ type: 'sound', key: 'bottle' });
    }
    if (d.use.bomb) throwBomb(g, d.use.bomb.damage, d.use.bomb.radius, d.use.bomb.knockback);
    consume(p.inv, idx);
    return { ok: true };
  }
  if (d.slot) return equipSlot(g, idx);
  g.toast(d.desc, 'info');
  return { ok: false };
}

function consume(slots: Slots, idx: number): void {
  const st = slots[idx]!;
  st.qty--;
  if (st.qty <= 0) slots[idx] = null;
}

// ------------------------------------------------------------ équipement
export function equipSlot(g: Game, idx: number): Check {
  const p = g.player;
  const st = p.inv[idx];
  if (!st) return { ok: false };
  const d = item(st.id);
  if (!d.slot) return { ok: false, reason: 'Ne s’équipe pas' };
  const c = canEquipItem(g, st.id);
  if (!c.ok) {
    g.toast(c.reason!, 'warn');
    g.emit({ type: 'sound', key: 'error' });
    return c;
  }
  const prev = p.equip[d.slot];
  const prevFam = currentFamily(g);
  p.equip[d.slot] = st;
  p.inv[idx] = prev; // échange : rien n'est perdu
  if (d.slot === 'weapon') onWeaponChanged(g, prevFam);
  g.emit({ type: 'sound', key: d.slot === 'weapon' ? 'sword_draw' : 'chain' });
  return { ok: true };
}

/** Changement d'arme (autorisé partout, même en combat) : rien n'est réinitialisé. */
function onWeaponChanged(g: Game, prevFam: ReturnType<typeof currentFamily>): void {
  const p = g.player;
  const fam = currentFamily(g);
  if (fam !== prevFam) {
    p.pendingHit = 0;
    p.combo = null;
    p.parryT = 0;
    if (fam !== 'occult') g.allies = [];
    if (fam === 'crossbow' && prevFam !== 'crossbow' && !p.xbowLoaded) p.reloadT = 0;
  }
  p.attackCd = Math.max(p.attackCd, 0.25);
}

export function unequip(g: Game, slot: EquipSlot): Check {
  const p = g.player;
  const st = p.equip[slot];
  if (!st) return { ok: false };
  const free = p.inv.findIndex((s) => !s);
  if (free < 0) {
    g.toast('Sac plein : impossible de retirer cet équipement.', 'warn');
    return { ok: false, reason: 'Sac plein' };
  }
  const prevFam = currentFamily(g);
  p.inv[free] = st;
  p.equip[slot] = null;
  if (slot === 'weapon') onWeaponChanged(g, prevFam);
  return { ok: true };
}

/** Sélecteur rapide : équipe l'arme choisie (depuis le sac). */
export function selectWeapon(g: Game, invIdx: number): Check {
  return equipSlot(g, invIdx);
}

export function dropSlot(g: Game, idx: number): Check {
  const p = g.player;
  const st = p.inv[idx];
  if (!st) return { ok: false };
  if (item(st.id).unique || item(st.id).kind === 'component') {
    g.toast('Objet précieux : rangez-le dans un coffre du camp plutôt que de le jeter.', 'warn');
    return { ok: false, reason: 'Objet précieux' };
  }
  p.inv[idx] = null;
  g.dropNear(p.x + p.aimX * 18, p.y + p.aimY * 18, [st]);
  g.emit({ type: 'sound', key: 'pick_0' });
  return { ok: true };
}

export function moveSlot(g: Game, a: number, b: number): void {
  moveBetween(g.player.inv, a, g.player.inv, b);
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
  if (c.kind === 'obj') return g.world.objects[c.id]?.label ?? 'Coffre';
  if (c.kind === 'building') {
    const b = g.world.buildings.get(c.id);
    return b ? buildingStats(b.type, b.level).name : 'Coffre';
  }
  return 'Sac';
}

function afterContainerChange(g: Game): void {
  const c = g.openContainer;
  if (c?.kind === 'obj') {
    const o = g.world.objects[c.id];
    if (o) g.recordChest(o);
  }
  if (c?.kind === 'bag') {
    const bag = g.world.bags.get(c.id);
    if (bag && bag.items.every((s) => !s)) {
      g.world.bags.delete(c.id);
      g.openContainer = null;
      g.emit({ type: 'bagsChanged' });
    }
  }
}

export function takeFromContainer(g: Game, idx: number): number {
  const slots = containerSlots(g);
  if (!slots) return 0;
  const st = slots[idx];
  if (!st) return 0;
  const before = st.qty;
  const id = st.id;
  const n = quickTransfer(slots, idx, g.player.inv);
  if (n < before) g.toast('Sac plein.', 'warn');
  trackLoot(g, id, n);
  afterContainerChange(g);
  return n;
}

/** Objets pris dans un coffre d'expédition : comptés comme ressources de sortie. */
function trackLoot(g: Game, id: string, n: number): void {
  const run = g.run;
  if (!run || run.kind !== 'farm' || n <= 0 || g.openContainer?.kind !== 'obj') return;
  const k = item(id).kind;
  if (k === 'resource' || k === 'rare' || k === 'food') run.gains[id] = (run.gains[id] ?? 0) + n;
}

export function putInContainer(g: Game, idx: number): number {
  const slots = containerSlots(g);
  if (!slots) return 0;
  const st = g.player.inv[idx];
  if (!st) return 0;
  const n = quickTransfer(g.player.inv, idx, slots);
  if (n === 0) g.toast('Ce coffre est plein.', 'warn');
  afterContainerChange(g);
  return n;
}

export function takeAll(g: Game): void {
  const slots = containerSlots(g);
  if (!slots) return;
  let blocked = false;
  for (let i = 0; i < slots.length; i++) {
    const st = slots[i];
    if (!st) continue;
    const id = st.id;
    const n = quickTransfer(slots, i, g.player.inv);
    trackLoot(g, id, n);
    if (slots[i]) blocked = true;
  }
  if (blocked) g.toast('Sac plein : une partie reste dans le coffre.', 'warn');
  g.emit({ type: 'sound', key: 'pick_1' });
  afterContainerChange(g);
}

/** Range tout le sac (sauf l'équipement et les raccourcis de soin) dans le coffre ouvert. */
export function depositAll(g: Game): number {
  const slots = containerSlots(g);
  if (!slots) return 0;
  let n = 0;
  g.player.inv.forEach((st, i) => {
    if (!st) return;
    const k = item(st.id).kind;
    if (k === 'resource' || k === 'rare' || k === 'component') n += quickTransfer(g.player.inv, i, slots);
  });
  if (n) g.emit({ type: 'sound', key: 'pick_1' });
  afterContainerChange(g);
  return n;
}

// ------------------------------------------------------------ camp : construction
function whereOk(g: Game, type: string): boolean {
  const w = BUILDING_BY_ID[type].where;
  if (g.world === g.campWorld) return w === 'camp' || w === 'both';
  if (g.world === g.houseWorld) return w === 'house' || w === 'both';
  return false;
}

/** Accès garanti : portes, poteau de départ, râtelier et installations restent atteignables. */
function accessOk(g: Game): boolean {
  const w = g.world;
  const seen = new Uint8Array(w.w * w.h);
  const q: number[] = [];
  const sx = Math.floor(g.player.x / TILE);
  const sy = Math.floor(g.player.y / TILE);
  const start = w.passableForPlayer(sx, sy) ? [sx, sy] : [w.start.x, w.start.y];
  q.push(w.idx(start[0], start[1]));
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % w.w;
    const y = (i - x) / w.w;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (!w.inBounds(nx, ny)) continue;
      const j = w.idx(nx, ny);
      if (seen[j] || !w.passableForPlayer(nx, ny)) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  const reach = (x0: number, y0: number, ww: number, hh: number) => {
    for (let y = y0 - 1; y <= y0 + hh; y++)
      for (let x = x0 - 1; x <= x0 + ww; x++) {
        const inside = x >= x0 && x < x0 + ww && y >= y0 && y < y0 + hh;
        if (w.inBounds(x, y) && (!inside || w.passableForPlayer(x, y)) && seen[w.idx(x, y)]) return true;
      }
    return false;
  };
  for (const o of w.objects) if ((o.type === 'door' || o.type === 'travel' || o.type === 'rack') && !reach(o.fx, o.fy, o.fw, o.fh)) return false;
  for (const b of w.buildings.values()) {
    const d = BUILDING_BY_ID[b.type];
    if ((d.station || d.storage || d.rest) && !reach(b.x, b.y, d.w, d.h)) return false;
  }
  return true;
}

export function canPlace(g: Game, type: string, tx: number, ty: number, moving?: Building): Check {
  const d = BUILDING_BY_ID[type];
  const w = g.world;
  const p = g.player;
  if (!g.atCamp) return { ok: false, reason: 'Constructions au camp et dans la maison seulement' };
  if (!whereOk(g, type)) return { ok: false, reason: d.where === 'house' ? 'Se place dans la maison' : 'Se place au camp, dehors' };
  if (!moving) {
    const miss = missingText(g, d.cost);
    if (miss) return { ok: false, reason: `Manque : ${miss}` };
  }
  const cx = (tx + d.w / 2) * TILE;
  const cy = (ty + d.h / 2) * TILE;
  if (Math.hypot(cx - p.x, cy - p.y) > PLAYER.buildRange) return { ok: false, reason: 'Trop loin' };
  for (let y = ty; y < ty + d.h; y++)
    for (let x = tx; x < tx + d.w; x++) {
      if (!w.inBounds(x, y) || x < 1 || y < 1 || x >= w.w - 1 || y >= w.h - 1) return { ok: false, reason: 'Hors des limites' };
      const i = w.idx(x, y);
      if (w.reserved[i]) return { ok: false, reason: 'Emplacement protégé (passage ou élément fixe)' };
      const other = w.buildingAt[i];
      if (other >= 0 && other !== moving?.id) return { ok: false, reason: 'Déjà occupé' };
      if (w.terrainBlocked(x, y)) return { ok: false, reason: 'Terrain impraticable' };
      const o = w.objectAtTile(x, y);
      if (o && !o.depleted) return { ok: false, reason: 'Emplacement occupé' };
      if (d.needsGrass && !w.isGrassTile(x, y)) return { ok: false, reason: 'Doit être posé sur l’herbe' };
    }
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  const x1 = (tx + d.w) * TILE;
  const y1 = (ty + d.h) * TILE;
  if (d.blocks && p.x + PLAYER.radius > x0 && p.x - PLAYER.radius < x1 && p.y + 4 > y0 && p.y - 6 < y1) return { ok: false, reason: 'Vous êtes sur l’emplacement' };
  // essai : l'accès aux portes et installations doit rester libre
  const temp = { id: -99, type, x: tx, y: ty } as Building;
  if (moving) w.unstampBuilding(moving);
  w.buildings.set(temp.id, temp);
  w.stampBuilding(temp);
  const ok = accessOk(g);
  w.unstampBuilding(temp);
  w.buildings.delete(temp.id);
  if (moving) w.stampBuilding(moving);
  if (!ok) return { ok: false, reason: 'Bloquerait l’accès à une porte ou à une installation' };
  return { ok: true };
}

export function place(g: Game, type: string, tx: number, ty: number): Check {
  const c = canPlace(g, type, tx, ty);
  if (!c.ok) {
    g.emit({ type: 'sound', key: 'error' });
    return c;
  }
  const d = BUILDING_BY_ID[type];
  payCost(g, d.cost);
  g.world.addBuilding(type, tx, ty);
  g.stats.built[type] = (g.stats.built[type] ?? 0) + 1;
  g.emit({ type: 'sound', key: 'build' });
  g.emit({ type: 'buildChanged' });
  g.toast(`${d.name} installé(e).`, 'good');
  g.emit({ type: 'save', reason: 'build' });
  return { ok: true };
}

/** Déplace une installation : gratuit, même identité, contenu et niveau conservés. */
export function moveBuilding(g: Game, id: number, tx: number, ty: number): Check {
  const b = g.world.buildings.get(id);
  if (!b) return { ok: false, reason: 'Introuvable' };
  const c = canPlace(g, b.type, tx, ty, b);
  if (!c.ok) {
    g.emit({ type: 'sound', key: 'error' });
    return c;
  }
  g.world.unstampBuilding(b);
  b.x = tx;
  b.y = ty;
  g.world.stampBuilding(b);
  g.emit({ type: 'sound', key: 'build' });
  g.emit({ type: 'buildChanged' });
  g.emit({ type: 'save', reason: 'move' });
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
  if (b.items && b.items.some((s) => s)) return { ok: false, reason: 'Videz d’abord ce coffre : son contenu est toujours conservé.' };
  const refund = demolishRefund(b.type);
  g.world.removeBuilding(b.id);
  for (const [id, n] of Object.entries(refund)) g.give(id, n);
  g.emit({ type: 'sound', key: 'build' });
  g.emit({ type: 'buildChanged' });
  g.toast(`${BUILDING_BY_ID[b.type].name} démonté(e). Remboursé : ${Object.entries(refund).map(([id, n]) => `${n} ${item(id).name}`).join(', ') || 'rien'}.`, 'info');
  g.emit({ type: 'save', reason: 'demolish' });
  return { ok: true };
}

export function canUpgrade(g: Game, buildingId: number): Check {
  const b = g.world.buildings.get(buildingId);
  if (!b) return { ok: false, reason: 'Introuvable' };
  const d = BUILDING_BY_ID[b.type];
  if (!d.upgrade) return { ok: false, reason: 'Pas d’amélioration' };
  if ((b.level ?? 1) >= 2) return { ok: false, reason: 'Déjà améliorée' };
  const miss = missingText(g, d.upgrade.cost);
  if (miss) return { ok: false, reason: `Manque : ${miss}` };
  return { ok: true };
}

export function upgradeBuilding(g: Game, buildingId: number): Check {
  const c = canUpgrade(g, buildingId);
  if (!c.ok) {
    g.emit({ type: 'sound', key: 'error' });
    return c;
  }
  const b = g.world.buildings.get(buildingId)!;
  const d = BUILDING_BY_ID[b.type];
  payCost(g, d.upgrade!.cost);
  b.level = 2;
  const st = buildingStats(b.type, 2);
  if (st.storage && b.items) while (b.items.length < st.storage) b.items.push(null);
  g.stats.built[`${b.type}_up`] = (g.stats.built[`${b.type}_up`] ?? 0) + 1;
  g.emit({ type: 'sound', key: 'build' });
  g.emit({ type: 'buildChanged' });
  g.toast(`${d.name} amélioré(e) : ${st.name}.`, 'good');
  g.emit({ type: 'save', reason: 'upgrade' });
  return { ok: true };
}

// ------------------------------------------------------------ enchantement
export function enchantable(g: Game): { where: EquipSlot | number; st: Stack }[] {
  const out: { where: EquipSlot | number; st: Stack }[] = [];
  const e = g.player.equip;
  for (const k of ['weapon', 'armor', 'accessory'] as const) {
    const st = e[k];
    if (st && item(st.id).enchantable) out.push({ where: k, st });
  }
  g.player.inv.forEach((st, i) => {
    if (st && item(st.id).enchantable) out.push({ where: i, st });
  });
  return out;
}

export function canEnchant(g: Game, where: EquipSlot | number, enchId: string): Check {
  const st = typeof where === 'number' ? g.player.inv[where] : g.player.equip[where];
  const e = ENCHANT_BY_ID[enchId];
  if (!st || !e) return { ok: false, reason: 'Rien à enchanter' };
  if (!g.nearStation('enchanter')) return { ok: false, reason: 'Nécessite l’autel d’enchantement à proximité' };
  const slot = item(st.id).slot;
  if (!slot || !e.slots.includes(slot) || !item(st.id).enchantable) return { ok: false, reason: 'Enchantement incompatible avec cet objet' };
  if (st.ench === enchId) return { ok: false, reason: 'Déjà gravé sur cet objet' };
  const miss = missingText(g, e.cost);
  if (miss) return { ok: false, reason: `Manque : ${miss}` };
  return { ok: true };
}

/** Grave un enchantement (un seul par objet : l'ancien est remplacé, jamais cumulé). */
export function enchantItem(g: Game, where: EquipSlot | number, enchId: string): Check {
  const c = canEnchant(g, where, enchId);
  if (!c.ok) {
    g.emit({ type: 'sound', key: 'error' });
    return c;
  }
  const st = (typeof where === 'number' ? g.player.inv[where] : g.player.equip[where])!;
  const prev = st.ench ? ENCHANT_BY_ID[st.ench]?.name : null;
  payCost(g, ENCHANT_BY_ID[enchId].cost);
  st.ench = enchId;
  g.emit({ type: 'sound', key: 'spell_4' });
  g.emit({ type: 'fx', kind: 'rays', x: g.player.x, y: g.player.y - 24 });
  g.toast(`${item(st.id).name} : ${ENCHANT_BY_ID[enchId].name}${prev ? ` (remplace ${prev})` : ''}.`, 'good');
  g.log(`Enchantement : ${item(st.id).name} — ${ENCHANT_BY_ID[enchId].name}.`);
  g.emit({ type: 'save', reason: 'enchant' });
  return { ok: true };
}

// ------------------------------------------------------------ repos, arme de départ
export function rest(g: Game): Check {
  const p = g.player;
  p.hp = maxHp(g);
  p.stamina = PLAYER.maxStamina;
  p.mana = PLAYER.maxMana;
  p.weakT = 0;
  g.emit({ type: 'sound', key: 'confirm' });
  g.toast('Vous vous reposez : PV, endurance et mana au maximum.', 'good');
  return { ok: true };
}

export const STARTER_WEAPONS = ['dagger_1', 'sword_1', 'mace_1', 'bow_1', 'xbow_1', 'staff_1', 'occ_1'];

export function chooseStarter(g: Game, id: string): Check {
  if (g.starter) return { ok: false, reason: 'Arme de départ déjà choisie' };
  if (!STARTER_WEAPONS.includes(id)) return { ok: false, reason: 'Arme inconnue' };
  g.starter = id;
  const p = g.player;
  const prev = p.equip.weapon;
  p.equip.weapon = { id, qty: 1 };
  if (prev) addItem(p.inv, prev.id, 1, prev.ench);
  g.flags.add('starter');
  g.emit({ type: 'sound', key: 'sword_draw' });
  g.toast(`${item(id).name} en main. Les autres armes se fabriquent à l’établi et à la forge.`, 'good');
  g.log(`Arme de départ : ${item(id).name}.`);
  g.emit({ type: 'save', reason: 'starter' });
  return { ok: true };
}

// ------------------------------------------------------------ barre rapide
export function useHotbar(g: Game, slot: number): Check & { empty?: boolean } {
  const e = g.hotbar[slot];
  if (!e) return { ok: false, empty: true };
  const d = item(e.id);
  if (hotbarQty(g, e.id) <= 0) {
    g.toast(`Plus de ${d.name.toLowerCase()} : raccourci épuisé.`, 'info');
    return { ok: false, reason: 'Épuisé' };
  }
  let idx = -1;
  g.player.inv.forEach((s, i) => {
    if (!s || s.id !== e.id) return;
    if (idx < 0 || s.qty < g.player.inv[idx]!.qty) idx = i;
  });
  if (idx < 0) {
    if (isEquipped(g, e.id)) {
      g.toast(`${d.name} : déjà en main.`, 'info');
      return { ok: false, reason: 'Déjà équipé' };
    }
    return { ok: false };
  }
  return useSlot(g, idx);
}

// ------------------------------------------------------------ marqueurs de carte
export const MARKER_CATS: { cat: import('./types').MarkerCat; name: string; icon: string }[] = [
  { cat: 'resource', name: 'Ressource', icon: 'world:i_wood' },
  { cat: 'danger', name: 'Danger', icon: 'items:fx_alert' },
  { cat: 'camp', name: 'Repère', icon: 'world:campfire_1' },
  { cat: 'revisit', name: 'À revoir', icon: 'items:i_note' },
];

export function addMarker(g: Game, x: number, y: number, cat: import('./types').MarkerCat, name: string): number {
  const id = g.nextMarkerId++;
  const clean = name.trim().slice(0, 24) || MARKER_CATS.find((m) => m.cat === cat)!.name;
  g.markers.push({ id, map: g.mapId, x: Math.max(0, Math.min(g.world.w - 1, x)), y: Math.max(0, Math.min(g.world.h - 1, y)), cat, name: clean });
  if (g.markers.length > 60) g.markers.shift();
  return id;
}

export function removeMarker(g: Game, id: number): void {
  g.markers = g.markers.filter((m) => m.id !== id);
}

export function pinRecipe(g: Game, key: string | null): void {
  g.pinned = key;
}
