// Barre rapide indépendante du sac : cinq raccourcis vers des types d'objets.
// Un raccourci ne déplace jamais d'objet ; il désigne un objet par son identifiant et
// affiche la quantité totale possédée (sac + équipement). Épuisé, il reste en place.
import { item } from '../data/items';
import type { Game } from './game';
import { countItem } from './inventory';

export const HOTBAR_SIZE = 5;

export interface HotbarSlot {
  id: string;
  /** affectation choisie par le joueur : jamais remplacée automatiquement */
  manual: boolean;
}

export type Hotbar = (HotbarSlot | null)[];

export function emptyHotbar(): Hotbar {
  return Array.from({ length: HOTBAR_SIZE }, () => null);
}

/** Types d'objets utiles en raccourci (les matériaux n'y vont jamais d'eux-mêmes). */
export function isHotbarUseful(id: string): boolean {
  const k = item(id).kind;
  return k === 'food' || k === 'consumable';
}

/** Objets qu'on peut affecter à la main à un raccourci (armes et protections aussi). */
export function isHotbarAssignable(id: string): boolean {
  const k = item(id).kind;
  return isHotbarUseful(id) || k === 'weapon' || k === 'armor' || k === 'accessory';
}

/** Quantité disponible pour un raccourci (sac + objet équipé). */
export function hotbarQty(g: Game, id: string): number {
  const e = g.player.equip;
  let n = countItem(g.player.inv, id);
  for (const s of [e.weapon, e.armor, e.accessory]) if (s && s.id === id) n += s.qty;
  return n;
}

export function isEquipped(g: Game, id: string): boolean {
  const e = g.player.equip;
  return [e.weapon, e.armor, e.accessory].some((s) => s && s.id === id);
}

/** Affecte un objet à une case précise (choix du joueur). Retire le doublon éventuel. */
export function assignHotbar(g: Game, slot: number, id: string | null): void {
  if (slot < 0 || slot >= HOTBAR_SIZE) return;
  const hb = g.hotbar;
  if (id === null) {
    hb[slot] = null;
    return;
  }
  const prev = hb.findIndex((s) => s && s.id === id);
  if (prev >= 0 && prev !== slot) {
    // l'objet change de case : il échange sa place avec le raccourci visé
    hb[prev] = hb[slot];
  }
  hb[slot] = { id, manual: true };
}

/** Échange deux raccourcis (réorganisation sans toucher au sac). */
export function swapHotbar(g: Game, a: number, b: number): void {
  const hb = g.hotbar;
  if (a === b || a < 0 || b < 0 || a >= HOTBAR_SIZE || b >= HOTBAR_SIZE) return;
  [hb[a], hb[b]] = [hb[b], hb[a]];
  if (hb[a]) hb[a]!.manual = true;
  if (hb[b]) hb[b]!.manual = true;
}

/**
 * Affectation automatique des premiers objets utiles obtenus : seulement dans une case
 * vide, ou à la place d'un raccourci automatique épuisé. Une affectation manuelle n'est
 * jamais remplacée. Appelée après chaque changement d'inventaire.
 */
export function autoAssignHotbar(g: Game): boolean {
  const hb = g.hotbar;
  const ids: string[] = [];
  for (const s of g.player.inv) if (s && !ids.includes(s.id)) ids.push(s.id);
  let changed = false;
  for (const id of ids) {
    if (!isHotbarUseful(id) || g.hotbarSeen.has(id)) continue;
    // chaque type d'objet n'est proposé automatiquement qu'une fois : un raccourci vidé par
    // le joueur ne revient pas tout seul
    g.hotbarSeen.add(id);
    if (hb.some((s) => s && s.id === id)) continue;
    let idx = hb.findIndex((s) => !s);
    if (idx < 0) idx = hb.findIndex((s) => s && !s.manual && hotbarQty(g, s.id) === 0);
    if (idx < 0) continue;
    hb[idx] = { id, manual: false };
    changed = true;
  }
  return changed;
}
