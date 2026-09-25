// Sélection automatique de la cible d'interaction, avec priorité lisible :
// sacs > objets de quête > notes/conteneurs > constructions > récolte.
import { PLAYER, TILE } from '../config/balance';
import { BUILDING_BY_ID } from '../data/buildings';
import { item } from '../data/items';
import type { Game } from './game';
import { addItem, countItem, isEmpty } from './inventory';
import { spawnEnemy, findSpawnPoint } from './enemies';
import type { WObj } from '../world/world';

export interface Target {
  kind: 'harvest' | 'open' | 'pickup' | 'read' | 'take' | 'use' | 'repair' | 'sanctuary' | 'info';
  label: string;
  icon: string;
  x: number; // centre (px) pour la surbrillance
  y: number;
  w: number;
  h: number;
  objId?: number;
  buildingId?: number;
  bagId?: number;
  run: (g: Game) => void;
}

const HARVEST_LABEL: Record<string, [string, string]> = {
  tree: ['Couper', 'world:i_wood'],
  rock: ['Miner', 'world:i_stone'],
  ore_iron: ['Miner le fer', 'world:i_iron_ore'],
  ore_coal: ['Miner le charbon', 'world:i_coal'],
  bush: ['Cueillir', 'world:i_berries'],
  grass: ['Arracher', 'world:i_fiber'],
  morel: ['Cueillir', 'world:i_morel'],
};

function rectDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = Math.max(x0 - px, 0, px - x1);
  const dy = Math.max(y0 - py, 0, py - y1);
  return Math.hypot(dx, dy);
}

export function interactionTarget(g: Game): Target | null {
  const p = g.player;
  const w = g.world;
  const fx = p.x + p.aimX * 14;
  const fy = p.y + p.aimY * 14 - 4;
  const range = PLAYER.interactRange;
  let best: Target | null = null;
  let bestScore = Infinity;
  const consider = (t: Target, dist: number, prio: number) => {
    if (dist > range) return;
    const score = dist + prio * 18;
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  };

  // sacs au sol
  for (const bag of w.bags.values()) {
    const d = Math.hypot(bag.x - fx, bag.y - fy);
    if (d > range + 10) continue;
    consider({
      kind: 'pickup', label: 'Ramasser le sac', icon: 'items:i_bag', x: bag.x, y: bag.y - 8, w: 24, h: 24, bagId: bag.id,
      run: (gg) => pickupBag(gg, bag.id),
    }, d, 0);
  }

  const tx0 = Math.floor((p.x - range - 40) / TILE);
  const tx1 = Math.floor((p.x + range + 40) / TILE);
  const ty0 = Math.floor((p.y - range - 40) / TILE);
  const ty1 = Math.floor((p.y + range + 40) / TILE);
  const seenObj = new Set<number>();
  const seenB = new Set<number>();
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      const o = w.objectAtTile(tx, ty);
      if (o && !seenObj.has(o.id) && !o.removed) {
        seenObj.add(o.id);
        const d = rectDist(fx, fy, o.fx * TILE, o.fy * TILE, (o.fx + o.fw) * TILE, (o.fy + o.fh) * TILE);
        const t = objectTarget(g, o);
        if (t) consider(t.t, d, t.prio);
      }
      const b = w.buildingAtTile(tx, ty);
      if (b && !seenB.has(b.id)) {
        seenB.add(b.id);
        const bd = BUILDING_BY_ID[b.type];
        const d = rectDist(fx, fy, b.x * TILE, b.y * TILE, (b.x + bd.w) * TILE, (b.y + bd.h) * TILE);
        const box = { x: (b.x + bd.w / 2) * TILE, y: (b.y + bd.h / 2) * TILE, w: bd.w * TILE, h: bd.h * TILE, buildingId: b.id };
        if (b.type === 'chest') {
          consider({ kind: 'open', label: 'Ouvrir le coffre', icon: 'world:chest_closed', ...box, run: (gg) => { gg.openContainer = { kind: 'building', id: b.id }; gg.emit({ type: 'sound', key: 'chest' }); gg.emit({ type: 'ui', panel: 'container' }); } }, d, 3);
        } else if (b.type === 'bed') {
          consider({ kind: 'use', label: 'Dormir', icon: 'world:bed_straw', ...box, run: (gg) => gg.emit({ type: 'ui', panel: 'bed' }) }, d, 3);
        } else if (bd.station) {
          consider({ kind: 'use', label: `Utiliser : ${bd.name}`, icon: bd.icon, ...box, run: (gg) => gg.emit({ type: 'ui', panel: 'craft', ref: bd.station }) }, d, 3);
        } else if (b.type === 'trap') {
          if ((b.meat ?? 0) > 0) {
            consider({ kind: 'take', label: `Relever le piège (${b.meat})`, icon: 'world:i_meat_raw', ...box, run: (gg) => {
              const n = b.meat ?? 0;
              b.meat = 0;
              gg.give('meat_raw', n, undefined, true);
              gg.emit({ type: 'float', x: box.x, y: box.y - 24, text: `+${n} Viande crue`, color: '#d9f7a6' });
              gg.emit({ type: 'sound', key: 'pick_0' });
              gg.emit({ type: 'buildChanged' });
            } }, d, 2);
          }
        } else if (b.hp < bd.hp) {
          consider({ kind: 'repair', label: `Réparer : ${bd.name}`, icon: 'world:i_hammer', ...box, run: (gg) => { repairBuildingAction(gg, b.id); } }, d, 4);
        }
      }
    }
  return best;
}

function objectTarget(g: Game, o: WObj): { t: Target; prio: number } | null {
  const box = { x: (o.fx + o.fw / 2) * 32, y: (o.fy + o.fh / 2) * 32 - (o.type === 'tree' ? 10 : 0), w: o.fw * 32, h: o.fh * 32, objId: o.id };
  switch (o.type) {
    case 'note':
      return { prio: 1, t: { kind: 'read', label: 'Lire la note', icon: 'items:i_note', ...box, run: (gg) => readNote(gg, o) } };
    case 'container':
      return { prio: 1, t: { kind: 'open', label: o.opened && o.items && isEmpty(o.items) ? `${o.label ?? 'Conteneur'} (vide)` : `Fouiller : ${o.label ?? 'conteneur'}`, icon: 'items:i_chest', ...box, run: (gg) => { gg.openWorldContainer(o); gg.openContainer = { kind: 'obj', id: o.id }; gg.emit({ type: 'ui', panel: 'container' }); } } };
    case 'altar':
      if (o.frag && !o.taken) return { prio: 0, t: { kind: 'take', label: 'Prendre le fragment', icon: `items:i_${o.frag}`, ...box, run: (gg) => takeFragment(gg, o) } };
      return null;
    case 'sanctuary':
      return { prio: 0, t: sanctuaryTarget(g, o, box) };
    default: {
      const hl = HARVEST_LABEL[o.type];
      if (!hl || o.depleted) return null;
      return { prio: 5, t: { kind: 'harvest', label: hl[0], icon: hl[1], ...box, run: (gg) => gg.harvest(o) } };
    }
  }
}

function sanctuaryTarget(g: Game, o: WObj, box: { x: number; y: number; w: number; h: number; objId: number }): Target {
  const f = g.final.state;
  if (f === 'locked') {
    const have = ['frag_1', 'frag_2', 'frag_3'].filter((id) => countItem(g.player.inv, id) > 0).length;
    if (have >= 3) return { kind: 'sanctuary', label: 'Restaurer le sceau', icon: 'world:seal_stone_on', ...box, run: (gg) => restoreSanctuary(gg) };
    return { kind: 'info', label: `Sceau brisé (${have}/3)`, icon: 'world:seal_stone', ...box, run: (gg) => gg.toast(`Il manque ${3 - have} fragment(s) pour restaurer le sceau.`, 'info') };
  }
  if (f === 'ready') return { kind: 'sanctuary', label: 'Lancer l’assaut final', icon: 'world:seal_stone_on', ...box, run: (gg) => gg.emit({ type: 'ui', panel: 'sanctuary' }) };
  if (f === 'active') return { kind: 'info', label: 'Tenez bon !', icon: 'world:seal_stone_on', ...box, run: () => {} };
  void o;
  return { kind: 'info', label: 'La forêt est libre', icon: 'world:seal_stone_on', ...box, run: (gg) => gg.toast('Le sceau est entier. La forêt respire à nouveau.', 'good') };
}

export function readNote(g: Game, o: WObj): void {
  if (!o.noteId) return;
  if (!g.stats.notesRead.includes(o.noteId)) g.stats.notesRead.push(o.noteId);
  g.emit({ type: 'sound', key: 'pick_1' });
  g.emit({ type: 'ui', panel: 'note', ref: o.noteId });
}

export function takeFragment(g: Game, o: WObj): void {
  if (!o.frag || o.taken) return;
  const left = addItem(g.player.inv, o.frag, 1);
  if (left > 0) {
    g.toast('Inventaire plein : libérez un emplacement pour prendre le fragment.', 'warn');
    g.emit({ type: 'sound', key: 'error' });
    return;
  }
  o.taken = true;
  g.fragmentsTaken.push(o.frag);
  g.emit({ type: 'objChanged', id: o.id });
  g.emit({ type: 'sound', key: 'objective' });
  g.toast(`${item(o.frag).name} récupéré ! (${g.fragmentsFound()}/3)`, 'good');
  // embuscade
  for (let i = 0; i < 3; i++) {
    const pt = findSpawnPoint(g, g.player.x, g.player.y, 9 * TILE, 14 * TILE);
    if (pt) spawnEnemy(g, 'affame', pt.x, pt.y, 'assault');
  }
  g.toast('Des cris s’élèvent autour de vous…', 'warn');
  g.emit({ type: 'save', reason: 'fragment' });
}

export function restoreSanctuary(g: Game): void {
  if (g.final.state !== 'locked') return;
  const frags = ['frag_1', 'frag_2', 'frag_3'];
  if (!frags.every((id) => countItem(g.player.inv, id) > 0)) return;
  // les fragments quittent l'inventaire pour rejoindre le sceau (jamais perdus)
  for (let i = 0; i < g.player.inv.length; i++) {
    const s = g.player.inv[i];
    if (s && frags.includes(s.id)) g.player.inv[i] = null;
  }
  g.final.state = 'ready';
  g.sanctuaryRestored = true;
  const o = g.world.objects[g.world.sanctuaryId];
  o.sprite = 'world:seal_stone_on';
  g.emit({ type: 'objChanged', id: o.id });
  g.emit({ type: 'sound', key: 'objective' });
  g.toast('Le sceau est restauré. Préparez vos défenses, puis lancez l’assaut final depuis la pierre.', 'good');
  g.emit({ type: 'save', reason: 'restore' });
}

export function startFinalAssault(g: Game): boolean {
  if (g.final.state !== 'ready') return false;
  g.final = { state: 'active', wave: 0, pause: 0, spawnedWave: false };
  g.emit({ type: 'save', reason: 'final' });
  return true;
}

export function pickupBag(g: Game, bagId: number): void {
  const bag = g.world.bags.get(bagId);
  if (!bag) return;
  let took = 0;
  let left = 0;
  for (let i = 0; i < bag.items.length; i++) {
    const s = bag.items[i];
    if (!s) continue;
    const rest = addItem(g.player.inv, s.id, s.qty, s.dur);
    took += s.qty - rest;
    if (rest > 0) {
      s.qty = rest;
      left += rest;
    } else bag.items[i] = null;
  }
  if (isEmpty(bag.items)) {
    g.world.bags.delete(bagId);
    if (g.deathBagId === bagId) g.deathBagId = -1;
  }
  g.emit({ type: 'bagsChanged' });
  g.emit({ type: 'sound', key: 'pick_1' });
  if (left > 0) g.toast(`Inventaire plein : ${left} objet(s) restent dans le sac.`, 'warn');
  else if (took > 0) g.toast(`Sac récupéré (${took} objet(s)).`, 'good');
}

export function repairCost(g: Game, buildingId: number): Record<string, number> | null {
  const b = g.world.buildings.get(buildingId);
  if (!b) return null;
  const bd = BUILDING_BY_ID[b.type];
  const missing = 1 - b.hp / bd.hp;
  if (missing <= 0) return {};
  const cost: Record<string, number> = {};
  for (const [id, n] of Object.entries(bd.cost)) cost[id] = Math.max(1, Math.ceil(n * missing * 0.5));
  return cost;
}

export function repairBuildingAction(g: Game, buildingId: number): boolean {
  const b = g.world.buildings.get(buildingId);
  if (!b) return false;
  const cost = repairCost(g, buildingId)!;
  const missing = Object.entries(cost).filter(([id, n]) => countItem(g.player.inv, id) < n);
  if (missing.length) {
    g.toast(`Réparation impossible : il faut ${Object.entries(cost).map(([id, n]) => `${n} ${item(id).name}`).join(', ')}.`, 'warn');
    g.emit({ type: 'sound', key: 'error' });
    return false;
  }
  for (const [id, n] of Object.entries(cost)) {
    // retrait atomique : vérifié ci-dessus
    let left = n;
    for (let i = 0; i < g.player.inv.length && left > 0; i++) {
      const s = g.player.inv[i];
      if (s && s.id === id) {
        const k = Math.min(s.qty, left);
        s.qty -= k;
        left -= k;
        if (s.qty <= 0) g.player.inv[i] = null;
      }
    }
  }
  b.hp = BUILDING_BY_ID[b.type].hp;
  g.emit({ type: 'buildChanged' });
  g.emit({ type: 'sound', key: 'build' });
  g.toast(`${BUILDING_BY_ID[b.type].name} réparé(e).`, 'good');
  return true;
}
