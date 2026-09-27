// Sélection automatique de la cible d'interaction. Le score combine :
//  - la distance et la direction du regard (on agit sur ce qu'on a devant soi) ;
//  - la visibilité (pas d'interaction à travers un mur ou un arbre) ;
//  - l'intention probable (on continue de récolter le même type de ressource) ;
//  - l'état de l'objet (un coffre déjà vidé passe après une ressource utile, mais reste accessible) ;
//  - une légère inertie pour que la cible ne saute pas entre deux objets voisins.
// Le joueur peut aussi choisir une cible en la touchant (sans se déplacer).
import { PLAYER, TILE } from '../config/balance';
import { BUILDING_BY_ID, buildingStats } from '../data/buildings';
import { item } from '../data/items';
import { NOTE_BY_ID } from '../data/notes';
import type { Game } from './game';
import { addItem, countItem, isEmpty } from './inventory';
import { spawnEnemy, findSpawnPoint } from './enemies';
import type { WObj } from '../world/world';

export interface Target {
  kind: 'harvest' | 'open' | 'pickup' | 'read' | 'take' | 'use' | 'repair' | 'sanctuary' | 'info';
  /** verbe court affiché dans le bouton d'action */
  label: string;
  /** nom de la cible, affiché près d'elle */
  name: string;
  icon: string;
  key: string;
  x: number; // centre (px) pour la surbrillance
  y: number;
  w: number;
  h: number;
  objId?: number;
  buildingId?: number;
  bagId?: number;
  empty?: boolean;
  run: (g: Game) => void;
}

const HARVEST_VERB: Record<string, [string, string]> = {
  tree: ['Couper', 'world:i_wood'],
  rock: ['Miner', 'world:i_stone'],
  ore_iron: ['Miner', 'world:i_iron_ore'],
  ore_coal: ['Miner', 'world:i_coal'],
  bush: ['Cueillir', 'world:i_berries'],
  grass: ['Arracher', 'world:i_fiber'],
  morel: ['Cueillir', 'world:i_morel'],
};

export function objectName(o: WObj): string {
  switch (o.type) {
    case 'tree':
      return o.sprite.includes('dead') ? 'Arbre mort' : o.sprite.includes('pine') ? 'Pin' : o.sprite.includes('autumn') ? 'Arbre roux' : 'Chêne';
    case 'rock':
      return o.sprite.includes('pebble') ? 'Galet' : o.sprite.includes('big') ? 'Gros rocher' : 'Rocher';
    case 'ore_iron':
      return 'Filon de fer';
    case 'ore_coal':
      return 'Filon de charbon';
    case 'bush':
      return 'Myrtillier';
    case 'grass':
      return 'Herbes hautes';
    case 'morel':
      return 'Morille';
    case 'note':
      return o.noteId ? NOTE_BY_ID[o.noteId]?.title ?? 'Note' : 'Note';
    default:
      return o.label ?? 'Objet';
  }
}

function rectDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = Math.max(x0 - px, 0, px - x1);
  const dy = Math.max(y0 - py, 0, py - y1);
  return Math.hypot(dx, dy);
}

/** Aucun obstacle solide (autre que la cible) entre le joueur et le bord de la cible. */
function visible(g: Game, tx: number, ty: number, selfObj = -1, selfB = -1): boolean {
  const p = g.player;
  const w = g.world;
  const x0 = p.x;
  const y0 = p.y - 6;
  const dist = Math.hypot(tx - x0, ty - y0);
  const steps = Math.floor(dist / (TILE / 3));
  for (let i = 1; i < steps; i++) {
    const x = x0 + ((tx - x0) * i) / steps;
    const y = y0 + ((ty - y0) * i) / steps;
    const cx = Math.floor(x / TILE);
    const cy = Math.floor(y / TILE);
    if (cx === Math.floor(p.x / TILE) && cy === Math.floor(p.y / TILE)) continue;
    const o = w.objectAtTile(cx, cy);
    if (o && o.id !== selfObj && o.solid && !o.removed && (o.type === 'house' || o.type === 'tree' || o.type === 'rock' || o.type === 'decor')) return false;
    const b = w.buildingAtTile(cx, cy);
    if (b && b.id !== selfB && (b.type === 'palisade' || b.type === 'door')) return false;
  }
  return true;
}

interface Cand {
  t: Target;
  dist: number; // distance au bord (depuis le point devant le joueur)
  prio: number;
  box: { x0: number; y0: number; x1: number; y1: number };
  obj?: WObj;
}

function candidates(g: Game, reach: number): Cand[] {
  const p = g.player;
  const w = g.world;
  const fx = p.x + p.aimX * 14;
  const fy = p.y + p.aimY * 14 - 4;
  const out: Cand[] = [];

  for (const bag of w.bags.values()) {
    const d = Math.hypot(bag.x - fx, bag.y - fy);
    if (d > reach + 10) continue;
    out.push({
      t: { kind: 'pickup', label: 'Ramasser', name: bag.kind === 'death' ? 'Votre sac' : 'Sac', icon: 'items:i_bag', key: `bag${bag.id}`, x: bag.x, y: bag.y - 8, w: 24, h: 24, bagId: bag.id, run: (gg) => pickupBag(gg, bag.id) },
      dist: d, prio: 0, box: { x0: bag.x - 10, y0: bag.y - 20, x1: bag.x + 10, y1: bag.y },
    });
  }

  const tx0 = Math.floor((p.x - reach - 40) / TILE);
  const tx1 = Math.floor((p.x + reach + 40) / TILE);
  const ty0 = Math.floor((p.y - reach - 40) / TILE);
  const ty1 = Math.floor((p.y + reach + 40) / TILE);
  const seenObj = new Set<number>();
  const seenB = new Set<number>();
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      const o = w.objectAtTile(tx, ty);
      if (o && !seenObj.has(o.id) && !o.removed) {
        seenObj.add(o.id);
        const box = { x0: o.fx * TILE, y0: o.fy * TILE, x1: (o.fx + o.fw) * TILE, y1: (o.fy + o.fh) * TILE };
        const d = rectDist(fx, fy, box.x0, box.y0, box.x1, box.y1);
        if (d <= reach) {
          const t = objectTarget(g, o);
          if (t) out.push({ t: t.t, dist: d, prio: t.prio, box, obj: o });
        }
      }
      const b = w.buildingAtTile(tx, ty);
      if (b && !seenB.has(b.id)) {
        seenB.add(b.id);
        const bd = BUILDING_BY_ID[b.type];
        const bs = buildingStats(b.type, b.level);
        const box = { x0: b.x * TILE, y0: b.y * TILE, x1: (b.x + bd.w) * TILE, y1: (b.y + bd.h) * TILE };
        const d = rectDist(fx, fy, box.x0, box.y0, box.x1, box.y1);
        if (d > reach) continue;
        const tb = { x: (b.x + bd.w / 2) * TILE, y: (b.y + bd.h / 2) * TILE, w: bd.w * TILE, h: bd.h * TILE, buildingId: b.id, key: `b${b.id}` };
        let t: Target | null = null;
        let prio = 3;
        if (b.type === 'chest') {
          const empty = !!b.items && isEmpty(b.items);
          t = { kind: 'open', label: 'Ouvrir', name: bs.name, icon: bs.icon, empty, ...tb, run: (gg) => { gg.openContainer = { kind: 'building', id: b.id }; gg.emit({ type: 'sound', key: 'chest' }); gg.emit({ type: 'ui', panel: 'container' }); } };
        } else if (b.type === 'bed') {
          t = { kind: 'use', label: 'Dormir', name: bd.name, icon: bd.icon, ...tb, run: (gg) => gg.emit({ type: 'ui', panel: 'bed' }) };
        } else if (bd.station) {
          t = { kind: 'use', label: 'Utiliser', name: bs.name, icon: bs.icon, ...tb, run: (gg) => gg.emit({ type: 'ui', panel: 'craft', ref: bd.station }) };
        } else if (b.type === 'trap') {
          if ((b.meat ?? 0) > 0) {
            prio = 2;
            t = { kind: 'take', label: 'Relever', name: `Piège (${b.meat})`, icon: 'world:i_meat_raw', ...tb, run: (gg) => {
              const n = b.meat ?? 0;
              b.meat = 0;
              gg.give('meat_raw', n, undefined, true);
              gg.emit({ type: 'float', x: tb.x, y: tb.y - 24, text: `+${n} Viande crue`, color: '#d9f7a6' });
              gg.emit({ type: 'collect', id: 'meat_raw', n });
              gg.emit({ type: 'sound', key: 'pick_0' });
              gg.emit({ type: 'buildChanged' });
            } };
          }
        } else if (b.hp < bd.hp) {
          prio = 4;
          t = { kind: 'repair', label: 'Réparer', name: bd.name, icon: 'world:i_hammer', ...tb, run: (gg) => { repairBuildingAction(gg, b.id); } };
        }
        if (t) out.push({ t, dist: d, prio: t.empty ? 6 : prio, box });
      }
    }
  return out;
}

function score(g: Game, c: Cand): number {
  const p = g.player;
  const cx = (c.box.x0 + c.box.x1) / 2;
  const cy = (c.box.y0 + c.box.y1) / 2;
  const dx = cx - p.x;
  const dy = cy - p.y;
  const dl = Math.hypot(dx, dy) || 1;
  const dot = (dx * p.aimX + dy * p.aimY) / dl;
  let s = c.dist + c.prio * 14 + (1 - dot) * 12;
  // on continue de récolter le même type de ressource
  if (c.t.kind === 'harvest' && c.obj && c.obj.type === g.lastHarvestType && g.clock - g.lastHarvestAt < 6) s -= 12;
  // inertie : la cible actuelle garde un léger avantage
  if (c.t.key === g.lastTargetKey) s -= 10;
  return s;
}

export function interactionTarget(g: Game): Target | null {
  const reach = PLAYER.interactRange;
  // cible choisie au toucher : prioritaire tant qu'elle reste à portée
  const f = g.forcedTarget;
  if (f && g.clock < f.until) {
    const cs = candidates(g, reach + 24);
    const hit = cs.find((c) => c.t.key === f.key);
    if (hit) return (g.lastTargetKey = hit.t.key), hit.t;
    g.forcedTarget = null;
  } else if (f) g.forcedTarget = null;
  let best: Cand | null = null;
  let bestScore = Infinity;
  for (const c of candidates(g, reach)) {
    const cx = Math.max(c.box.x0 + 2, Math.min(c.box.x1 - 2, g.player.x));
    const cy = Math.max(c.box.y0 + 2, Math.min(c.box.y1 - 2, g.player.y - 6));
    if (c.dist > 10 && !visible(g, cx, cy, c.obj?.id ?? -1, c.t.buildingId ?? -1)) continue;
    const sc = score(g, c);
    if (sc < bestScore) {
      bestScore = sc;
      best = c;
    }
  }
  g.lastTargetKey = best ? best.t.key : '';
  return best ? best.t : null;
}

/**
 * Sélection explicite : le joueur touche un objet proche. La cible est retenue quelques
 * secondes sans provoquer de déplacement. Renvoie le nom de la cible ou null.
 */
export function selectTargetAt(g: Game, wx: number, wy: number): string | null {
  const cs = candidates(g, PLAYER.interactRange + 24);
  let best: Cand | null = null;
  let bestD = Infinity;
  for (const c of cs) {
    const d = rectDist(wx, wy, c.box.x0 - 8, c.box.y0 - 8, c.box.x1 + 8, c.box.y1 + 8);
    if (d > 0) continue;
    const dc = Math.hypot(wx - (c.box.x0 + c.box.x1) / 2, wy - (c.box.y0 + c.box.y1) / 2);
    if (dc < bestD) {
      bestD = dc;
      best = c;
    }
  }
  if (!best) return null;
  g.forcedTarget = { key: best.t.key, until: g.clock + 6 };
  return best.t.name;
}

function objectTarget(g: Game, o: WObj): { t: Target; prio: number } | null {
  const box = { x: (o.fx + o.fw / 2) * 32, y: (o.fy + o.fh / 2) * 32 - (o.type === 'tree' ? 10 : 0), w: o.fw * 32, h: o.fh * 32, objId: o.id, key: `o${o.id}` };
  const name = objectName(o);
  switch (o.type) {
    case 'note': {
      const read = !!o.noteId && g.stats.notesRead.includes(o.noteId);
      return { prio: read ? 3 : 1, t: { kind: 'read', label: 'Lire', name, icon: 'items:i_note', ...box, run: (gg) => readNote(gg, o) } };
    }
    case 'container': {
      const empty = !!o.opened && !!o.items && isEmpty(o.items);
      return { prio: empty ? 6 : 1, t: { kind: 'open', label: 'Fouiller', name: empty ? `${name} (vide)` : name, icon: 'items:i_chest', empty, ...box, run: (gg) => { gg.openWorldContainer(o); gg.openContainer = { kind: 'obj', id: o.id }; gg.emit({ type: 'ui', panel: 'container' }); } } };
    }
    case 'altar':
      if (o.frag && !o.taken) return { prio: 0, t: { kind: 'take', label: 'Prendre', name: item(o.frag).name, icon: `items:i_${o.frag}`, ...box, run: (gg) => takeFragment(gg, o) } };
      return null;
    case 'sanctuary':
      return { prio: 0, t: sanctuaryTarget(g, o, box) };
    default: {
      const hv = HARVEST_VERB[o.type];
      if (!hv || o.depleted) return null;
      return { prio: 2, t: { kind: 'harvest', label: hv[0], name, icon: hv[1], ...box, run: (gg) => gg.harvest(o) } };
    }
  }
}

function sanctuaryTarget(g: Game, o: WObj, box: { x: number; y: number; w: number; h: number; objId: number; key: string }): Target {
  const f = g.final.state;
  const name = 'Pierre du Loup';
  if (f === 'locked') {
    const have = ['frag_1', 'frag_2', 'frag_3'].filter((id) => countItem(g.player.inv, id) > 0).length;
    if (have >= 3) return { kind: 'sanctuary', label: 'Restaurer', name, icon: 'world:seal_stone_on', ...box, run: (gg) => restoreSanctuary(gg) };
    return { kind: 'info', label: 'Examiner', name: `Sceau brisé (${have}/3)`, icon: 'world:seal_stone', ...box, run: (gg) => gg.toast(`Il manque ${3 - have} fragment(s) pour restaurer le sceau.`, 'info') };
  }
  if (f === 'ready') return { kind: 'sanctuary', label: 'Assaut', name: 'Lancer l’assaut final', icon: 'world:seal_stone_on', ...box, run: (gg) => gg.emit({ type: 'ui', panel: 'sanctuary' }) };
  if (f === 'active') return { kind: 'info', label: 'Tenir', name: 'Tenez bon !', icon: 'world:seal_stone_on', ...box, run: () => {} };
  void o;
  return { kind: 'info', label: 'Examiner', name: 'La forêt est libre', icon: 'world:seal_stone_on', ...box, run: (gg) => gg.toast('Le sceau est entier. La forêt respire à nouveau.', 'good') };
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
