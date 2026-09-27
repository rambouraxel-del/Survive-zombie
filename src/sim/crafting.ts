// Logique de l'écran de fabrication, indépendante de l'affichage :
// liste dans un ordre fixe, bénéfices chiffrés, comparaison avec l'équipement,
// ressources manquantes (directes ou à fabriquer) pour la recette suivie.
import { TILE } from '../config/balance';
import { item, type Station } from '../data/items';
import { producingEntry, RECIPE_ENTRIES, STATION_NAMES, type Recipe, type RecipeEntry } from '../data/recipes';
import { canCraft, maxCraftable, recipeQty } from './actions';
import type { Game } from './game';
import { countItem } from './inventory';

export type CraftFilter = Station | 'all';

/** Entrées affichées : l'ordre ne dépend jamais de la disponibilité (liste stable). */
export function listEntries(g: Game, filter: CraftFilter, onlyCraftable: boolean): RecipeEntry[] {
  return RECIPE_ENTRIES.filter((e) => (filter === 'all' || e.station === filter) && (!onlyCraftable || e.recipes.some((r) => canCraft(g, r).ok)));
}

export function entryByKey(key: string): RecipeEntry | null {
  return RECIPE_ENTRIES.find((e) => e.key === key) ?? null;
}

const cases = (px: number) => `${Math.round((px / TILE) * 10) / 10}`.replace('.', ',');

/** Bénéfices chiffrés d'un objet (lisibles sans survol). */
export function benefits(id: string): string[] {
  const d = item(id);
  const out: string[] = [];
  if (d.food) {
    out.push(`+${d.food.hunger} faim`);
    if (d.food.health) out.push(`+${d.food.health} PV`);
    if (d.food.regen) out.push('récupération accrue 60 s');
  }
  if (d.heal) out.push(`+${d.heal} PV en 4 s`);
  if (d.tool && d.tool.type !== 'light') out.push(`${d.tool.type === 'axe' ? 'Bûcheronnage' : 'Minage'} ×${d.tool.power}`);
  if (d.light) out.push(`Éclaire à ${cases(d.light)} cases`);
  if (d.weapon) out.push(`Dégâts ${d.weapon.damage}`, `Portée ${cases(d.weapon.reach)} case${d.weapon.reach > TILE ? 's' : ''}`, `${Math.round((1 / d.weapon.cooldown) * 10) / 10} coups/s`.replace('.', ','));
  if (d.armor) out.push(`Dégâts subis −${Math.round(d.armor.reduction * 100)} %`);
  if (d.durability) out.push(`Durabilité ${d.durability}`);
  return out;
}

/** Comparaison avec ce qui est actuellement équipé (quand c'est pertinent). */
export function compareWithEquipped(g: Game, id: string): string | null {
  const d = item(id);
  const e = g.player.equip;
  if (d.weapon && d.kind === 'weapon') {
    const cur = e.weapon ?? (e.tool && item(e.tool.id).weapon ? e.tool : null);
    if (!cur) return 'Aucune arme en main : +' + d.weapon.damage + ' dégâts par rapport aux poings (6).';
    if (cur.id === id) return 'Identique à votre arme actuelle.';
    const cw = item(cur.id).weapon!;
    return `Par rapport à ${item(cur.id).name.toLowerCase()} : dégâts ${cw.damage} → ${d.weapon.damage}, portée ${cases(cw.reach)} → ${cases(d.weapon.reach)} case(s).`;
  }
  if (d.tool && d.tool.type !== 'light') {
    const best = [e.tool, ...g.player.inv].filter((s) => s && s.dur !== 0 && item(s.id).tool?.type === d.tool!.type).map((s) => item(s!.id).tool!.power);
    const cur = Math.max(1, ...best);
    const verb = d.tool.type === 'axe' ? 'couper un arbre' : 'casser un rocher';
    if (cur >= d.tool.power) return `Vous avez déjà un outil aussi efficace (×${cur}).`;
    return `Pour ${verb} : ${Math.ceil(6 / cur)} coups → ${Math.ceil(6 / d.tool.power)} coups.`;
  }
  if (d.armor) {
    const cur = e.armor && e.armor.dur !== 0 ? item(e.armor.id).armor!.reduction : 0;
    return `Protection : −${Math.round(cur * 100)} % → −${Math.round(d.armor.reduction * 100)} % de dégâts.`;
  }
  return null;
}

/** Condition de station, lisible. */
export function stationText(g: Game, r: Recipe): { text: string; ok: boolean } {
  if (r.station === 'hand') return { text: 'À la main, n’importe où', ok: true };
  const near = g.nearStation(r.station);
  return { text: `${STATION_NAMES[r.station]} à moins de 2 cases${near ? ' ✓' : ' (pas à portée)'}`, ok: near };
}

/** Quantités pratiques proposées (×1, ×5, maximum) pour les consommables et matériaux. */
export function quantityOptions(g: Game, r: Recipe): { label: string; times: number; ok: boolean }[] {
  const d = item(r.output);
  const opts = [{ label: '×1', times: 1, ok: canCraft(g, r, 1).ok }];
  if (d.stack > 1) {
    const max = maxCraftable(g, r);
    opts.push({ label: '×5', times: 5, ok: canCraft(g, r, 5).ok });
    if (max > 1 && max !== 5) opts.push({ label: `Max (×${max})`, times: max, ok: true });
  }
  return opts;
}

export interface MissingInfo {
  ready: boolean;
  /** ingrédients à récolter ou trouver */
  direct: { id: string; have: number; need: number }[];
  /** ingrédients qui se fabriquent (planches, corde, fer, charbon…) */
  crafted: { id: string; have: number; need: number; via: string }[];
  station: { ok: boolean; text: string };
}

/** Ressources manquantes pour la recette suivie (méthode la plus proche d'être faisable). */
export function missingFor(g: Game, key: string): MissingInfo | null {
  const e = entryByKey(key);
  if (!e) return null;
  let bestR = e.recipes[0];
  let bestMiss = Infinity;
  for (const r of e.recipes) {
    const miss = Object.entries(r.inputs).reduce((n, [id, k]) => n + Math.max(0, k - countItem(g.player.inv, id)), 0);
    if (miss < bestMiss) {
      bestMiss = miss;
      bestR = r;
    }
  }
  const direct: MissingInfo['direct'] = [];
  const crafted: MissingInfo['crafted'] = [];
  for (const [id, need] of Object.entries(bestR.inputs)) {
    const have = countItem(g.player.inv, id);
    if (have >= need) continue;
    const pe = producingEntry(id);
    if (pe) crafted.push({ id, have, need, via: STATION_NAMES[pe.station] });
    else direct.push({ id, have, need });
  }
  const st = stationText(g, bestR);
  return { ready: !direct.length && !crafted.length, direct, crafted, station: st };
}

export { recipeQty };
