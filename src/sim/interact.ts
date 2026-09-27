// Sélection automatique de la cible d'interaction. Le score combine :
//  - la distance et la direction du regard (on agit sur ce qu'on a devant soi) ;
//  - la visibilité (pas d'interaction à travers un mur ou un arbre) ;
//  - l'intention probable (on continue de récolter le même type de ressource) ;
//  - l'état de l'objet (un coffre déjà vidé passe après une ressource utile, mais reste accessible) ;
//  - une légère inertie pour que la cible ne saute pas entre deux objets voisins.
// Le joueur peut aussi choisir une cible en la touchant (sans se déplacer).
import { PLAYER, TILE } from '../config/balance';
import { BUILDING_BY_ID, buildingStats } from '../data/buildings';
import { NOTE_BY_ID } from '../data/notes';
import type { Game } from './game';
import { addItem, isEmpty } from './inventory';
import type { WObj } from '../world/world';
import { enterHouse, leaveHouse, lightCheckpoint, openShortcut, pullLever, shortcutSideOk } from './travel';

export interface Target {
  kind: 'harvest' | 'open' | 'pickup' | 'read' | 'take' | 'use' | 'info' | 'travel';
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
  crystal: ['Miner', 'items:i_gem_green'],
  bush: ['Cueillir', 'world:i_berries'],
  grass: ['Arracher', 'world:i_fiber'],
  morel: ['Cueillir', 'world:i_morel'],
  herb: ['Cueillir', 'items:i_herb'],
  blackmoss: ['Racler', 'items:i_moss'],
  glowcap: ['Cueillir', 'items:i_sprout'],
};

export function objectName(o: WObj): string {
  switch (o.type) {
    case 'tree':
      return o.label === 'dead' || o.sprite.includes('dead') || o.sprite.includes('bare') || o.sprite.includes('twisted') ? 'Arbre mort' : o.sprite.includes('pine') ? 'Pin' : o.sprite.includes('autumn') ? 'Arbre roux' : 'Chêne';
    case 'rock':
      return o.label === 'big' ? 'Gros rocher' : 'Rocher';
    case 'crystal':
      return 'Veine de cristal';
    case 'herb':
      return 'Herbe de soin';
    case 'blackmoss':
      return 'Mousse noire';
    case 'glowcap':
      return 'Champignons luminescents';
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
    if (o && o.id !== selfObj && o.solid && (o.type === 'house' || o.type === 'lodge' || o.type === 'tree' || o.type === 'rock' || o.type === 'gate' || (o.type === 'prop' && o.fh > 1))) return false;
    if (w.wall[w.idx(cx, cy)]) return false;
    const b = w.buildingAtTile(cx, cy);
    if (b && b.id !== selfB && b.type === 'palisade') return false;
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
      t: { kind: 'pickup', label: 'Ramasser', name: 'Sac', icon: 'items:i_bag', key: `bag${bag.id}`, x: bag.x, y: bag.y - 8, w: 24, h: 24, bagId: bag.id, run: (gg) => pickupBag(gg, bag.id) },
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
      if (o && !seenObj.has(o.id)) {
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
        if (bd.storage) {
          const empty = !!b.items && isEmpty(b.items);
          t = { kind: 'open', label: 'Ouvrir', name: bs.name, icon: bs.icon, empty, ...tb, run: (gg) => { gg.openContainer = { kind: 'building', id: b.id }; gg.emit({ type: 'sound', key: 'chest' }); gg.emit({ type: 'ui', panel: 'container' }); } };
        } else if (bd.rest) {
          t = { kind: 'use', label: 'Dormir', name: bd.name, icon: bd.icon, ...tb, run: (gg) => gg.emit({ type: 'ui', panel: 'bed' }) };
        } else if (bd.station === 'enchanter') {
          t = { kind: 'use', label: 'Enchanter', name: bs.name, icon: bs.icon, ...tb, run: (gg) => gg.emit({ type: 'ui', panel: 'enchant' }) };
        } else if (bd.station) {
          t = { kind: 'use', label: 'Utiliser', name: bs.name, icon: bs.icon, ...tb, run: (gg) => gg.emit({ type: 'ui', panel: 'craft', ref: bd.station }) };
        } else if (bd.dummy) {
          prio = 5;
          t = { kind: 'info', label: 'Examiner', name: bd.name, icon: bd.icon, ...tb, run: (gg) => gg.toast('Frappez le mannequin pour essayer vos armes, compétences et ultimes : les dégâts s’affichent, sans gain de maîtrise ni de jauge.', 'info') };
        } else if (b.type === 'trap') {
          if ((b.meat ?? 0) > 0) {
            prio = 2;
            t = { kind: 'take', label: 'Relever', name: `Piège (${b.meat})`, icon: 'world:i_meat_raw', ...tb, run: (gg) => {
              const n = b.meat ?? 0;
              b.meat = 0;
              gg.give('meat_raw', n, { collected: true });
              gg.emit({ type: 'float', x: tb.x, y: tb.y - 24, text: `+${n} Viande crue`, color: '#d9f7a6' });
              gg.emit({ type: 'collect', id: 'meat_raw', n });
              gg.emit({ type: 'sound', key: 'pick_0' });
              gg.emit({ type: 'buildChanged' });
            } };
          }
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
    case 'checkpoint':
      if (!o.open) return { prio: 0, t: { kind: 'use', label: 'Allumer', name, icon: 'world:campfire_1', ...box, run: (gg) => lightCheckpoint(gg, o) } };
      return { prio: 2, t: { kind: 'use', label: 'Halte', name, icon: 'world:campfire_1', ...box, run: (gg) => { lightCheckpoint(gg, o); gg.emit({ type: 'ui', panel: 'checkpoint', ref: o.key }); } } };
    case 'exit':
      return { prio: 1, t: { kind: 'travel', label: 'Rentrer', name: 'Retour au camp', icon: 'items:signpost', ...box, run: (gg) => gg.emit({ type: 'ui', panel: 'exit' }) } };
    case 'gate':
      if (o.open) return null;
      return { prio: 4, t: { kind: 'info', label: 'Examiner', name, icon: 'props:portcullis', ...box, run: (gg) => gg.toast(o.openedBy === 'boss' ? `${name} : scellée tant que le maître des lieux est en vie.` : `${name} : fermée. Un mécanisme doit l’ouvrir, quelque part de l’autre côté.`, 'info') } };
    case 'lever':
      return { prio: o.open ? 5 : 0, t: { kind: 'use', label: o.open ? 'Actionné' : 'Actionner', name, icon: 'props:chains', empty: !!o.open, ...box, run: (gg) => pullLever(gg, o) } };
    case 'shortcut':
      if (o.open) return null;
      return { prio: 1, t: { kind: 'use', label: shortcutSideOk(g, o) ? (o.side === 'south' ? 'Abaisser' : 'Pousser') : 'Examiner', name, icon: o.sprite, ...box, run: (gg) => openShortcut(gg, o) } };
    case 'door':
      return { prio: 0, t: { kind: 'travel', label: o.destination === 'house' ? 'Entrer' : 'Sortir', name: o.destination === 'house' ? 'Votre maison' : 'Retour au camp', icon: 'world:door_closed', ...box, run: (gg) => (o.destination === 'house' ? enterHouse(gg) : leaveHouse(gg)) } };
    case 'travel':
      return { prio: 0, t: { kind: 'travel', label: 'Partir', name: 'Carrefour des expéditions', icon: 'items:signpost', ...box, run: (gg) => gg.emit({ type: 'ui', panel: 'travel' }) } };
    case 'rack':
      return { prio: 1, t: { kind: 'use', label: g.starter ? 'Examiner' : 'Choisir', name: g.starter ? 'Râtelier d’armes' : 'Choisir une arme de départ', icon: 'props:weapon_rack', ...box, run: (gg) => gg.emit({ type: 'ui', panel: 'rack' }) } };
    case 'reserved':
      return { prio: 6, t: { kind: 'info', label: 'Examiner', name, icon: 'world:hay_pile', ...box, run: (gg) => gg.toast('Emplacement réservé à un futur compagnon (rien à faire ici pour l’instant).', 'info') } };
    default: {
      const hv = HARVEST_VERB[o.type];
      if (!hv || o.depleted) return null;
      return { prio: 2, t: { kind: 'harvest', label: hv[0], name, icon: hv[1], ...box, run: (gg) => gg.harvest(o) } };
    }
  }
}

export function readNote(g: Game, o: WObj): void {
  if (!o.noteId) return;
  if (!g.stats.notesRead.includes(o.noteId)) {
    g.stats.notesRead.push(o.noteId);
    g.log(`Note lue : ${NOTE_BY_ID[o.noteId]?.title ?? ''}.`);
  }
  g.emit({ type: 'sound', key: 'pick_1' });
  g.emit({ type: 'ui', panel: 'note', ref: o.noteId });
}

export function pickupBag(g: Game, bagId: number): void {
  const bag = g.world.bags.get(bagId);
  if (!bag) return;
  let took = 0;
  let left = 0;
  for (let i = 0; i < bag.items.length; i++) {
    const s = bag.items[i];
    if (!s) continue;
    const rest = addItem(g.player.inv, s.id, s.qty, s.ench);
    took += s.qty - rest;
    if (rest > 0) {
      s.qty = rest;
      left += rest;
    } else bag.items[i] = null;
  }
  if (isEmpty(bag.items)) g.world.bags.delete(bagId);
  g.emit({ type: 'bagsChanged' });
  g.emit({ type: 'sound', key: 'pick_1' });
  if (left > 0) g.toast(`Inventaire plein : ${left} objet(s) restent dans le sac.`, 'warn');
  else if (took > 0) g.toast(`Sac récupéré (${took} objet(s)).`, 'good');
}

