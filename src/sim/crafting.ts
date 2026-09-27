// Logique de l'écran de fabrication, indépendante de l'affichage : liste dans un ordre fixe,
// caractéristiques chiffrées, prérequis de maîtrise, comparaison avec l'équipement, ressources
// manquantes (directes ou à fabriquer) pour la recette suivie.
import { TILE } from '../config/balance';
import { ENCHANT_BY_ID } from '../data/enchants';
import { item, type Station } from '../data/items';
import { producingEntry, RECIPE_ENTRIES, STATION_NAMES, type Recipe, type RecipeEntry } from '../data/recipes';
import { FAMILY, SKILLS, ULTS, weaponStats } from '../data/weapons';
import { available, canCraft, maxCraftable, recipeQty } from './actions';
import type { Game } from './game';
import { canEquipItem, currentFamily, currentTier, mastery, masteryRequirement } from './profile';

export type CraftFilter = Station | 'all';

export function listEntries(g: Game, filter: CraftFilter, onlyCraftable: boolean): RecipeEntry[] {
  return RECIPE_ENTRIES.filter((e) => (filter === 'all' || e.station === filter) && (!onlyCraftable || e.recipes.some((r) => canCraft(g, r).ok)));
}

export function entryByKey(key: string): RecipeEntry | null {
  return RECIPE_ENTRIES.find((e) => e.key === key) ?? null;
}

const cases = (px: number) => `${Math.round((px / TILE) * 10) / 10}`.replace('.', ',');
const n1 = (v: number) => `${Math.round(v * 10) / 10}`.replace('.', ',');

/** Caractéristiques chiffrées d'un objet (lisibles sans survol). */
export function benefits(id: string): string[] {
  const d = item(id);
  const out: string[] = [];
  if (d.food) {
    out.push(`+${d.food.hunger} faim`);
    if (d.food.health) out.push(`+${d.food.health} PV`);
    if (d.food.regen) out.push('récupération accrue 60 s');
  }
  if (d.use?.heal) out.push(`+${d.use.heal} PV en ${n1(d.use.healTime ?? 3)} s`);
  if (d.use?.restore) out.push('endurance et mana au maximum', 'récupération accrue 20 s');
  if (d.use?.bomb) out.push(`${d.use.bomb.damage} dégâts dans un rayon de ${cases(d.use.bomb.radius)} case(s)`);
  if (d.tool) out.push(`${d.tool.type === 'axe' ? 'Bûcheronnage' : 'Minage'} ×${d.tool.power} (utilisé depuis le sac)`);
  if (d.weapon) {
    const f = d.weapon.family;
    const s = weaponStats(f, d.tier ?? 1);
    const rate = f === 'crossbow' ? 1 / (s.cooldown + (s.reload ?? 0)) : 1 / s.cooldown;
    out.push(`${FAMILY[f].name} · rang ${['I', 'II', 'III'][(d.tier ?? 1) - 1]}`);
    out.push(`Dégâts ${s.damage} · ${n1(rate)} coup(s)/s (≈ ${Math.round(s.damage * rate)} par seconde)`);
    out.push(FAMILY[f].ranged ? `Portée ${cases(s.reach)} cases` : `Allonge ${cases(s.reach)} case`);
    out.push(`Coût : ${s.cost} ${FAMILY[f].resource === 'mana' ? 'mana' : 'endurance'} par attaque${f === 'crossbow' ? ` · rechargement ${n1(s.reload ?? 0)} s` : ''}`);
  }
  if (d.armor) out.push(`Dégâts subis −${Math.round(d.armor.reduction * 100)} %`);
  const a = d.accessory;
  if (a?.light) out.push(`Éclaire à ${cases(a.light)} cases`);
  if (a?.staminaRegen) out.push(`Endurance +${Math.round(a.staminaRegen * 100)} %`);
  if (a?.manaRegen) out.push(`Mana +${Math.round(a.manaRegen * 100)} %`);
  if (a?.damage) out.push(`Dégâts +${Math.round(a.damage * 100)} %`);
  if (a?.ultCharge) out.push(`Charge de l’ultime +${Math.round(a.ultCharge * 100)} %`);
  if (a?.maxHp) out.push(`PV max +${a.maxHp}`);
  return out;
}

/** Compétences associées à une arme (famille). */
export function weaponSkillsText(id: string): string[] {
  const d = item(id);
  if (!d.weapon) return [];
  const f = d.weapon.family;
  return [
    ...SKILLS.filter((s) => s.family === f).map((s) => `${s.name} (maîtrise ${s.unlock}) : ${s.desc}`),
    `Ultime — ${ULTS[f].name} (maîtrise ${ULTS[f].unlock}) : ${ULTS[f].desc}`,
  ];
}

export function enchantText(ench?: string): string | null {
  return ench ? `${ENCHANT_BY_ID[ench]?.name} : ${ENCHANT_BY_ID[ench]?.desc}` : null;
}

/** Prérequis de maîtrise, toujours affiché avant fabrication ou équipement. */
export function requirementText(g: Game, id: string): { text: string; ok: boolean } | null {
  const req = masteryRequirement(id);
  if (!req) return null;
  const have = mastery(g, req.family);
  if (req.level === 0) return { text: `Aucune maîtrise requise (${FAMILY[req.family].short} : niveau ${have})`, ok: true };
  return { text: `Maîtrise ${FAMILY[req.family].short} ${req.level} requise pour l’équiper (actuelle : ${have})`, ok: canEquipItem(g, id).ok };
}

/** Comparaison avec ce qui est actuellement équipé. */
export function compareWithEquipped(g: Game, id: string): string | null {
  const d = item(id);
  const e = g.player.equip;
  if (d.weapon) {
    const f = d.weapon.family;
    const s = weaponStats(f, d.tier ?? 1);
    const cur = currentFamily(g);
    if (!e.weapon) return `Aucune arme en main : dégâts ${s.damage} au lieu de 4 à mains nues.`;
    if (e.weapon.id === id) return 'C’est votre arme actuelle.';
    const cs = weaponStats(cur!, currentTier(g));
    const dps = (st: typeof s, fam: typeof f) => st.damage / (st.cooldown + (fam === 'crossbow' ? st.reload ?? 0 : 0));
    return `Par rapport à ${item(e.weapon.id).name.toLowerCase()} : dégâts ${cs.damage} → ${s.damage}, par seconde ≈ ${Math.round(dps(cs, cur!))} → ${Math.round(dps(s, f))}${cur !== f ? ` (autre famille : ${FAMILY[f].short})` : ''}.`;
  }
  if (d.armor) {
    const cur = e.armor ? item(e.armor.id).armor!.reduction : 0;
    return `Protection : −${Math.round(cur * 100)} % → −${Math.round(d.armor.reduction * 100)} % de dégâts subis.`;
  }
  if (d.accessory && e.accessory && e.accessory.id !== id) return `Remplacerait ${item(e.accessory.id).name.toLowerCase()}.`;
  if (d.tool) {
    const best = g.player.inv.filter((s) => s && item(s.id).tool?.type === d.tool!.type).map((s) => item(s!.id).tool!.power);
    const cur = Math.max(1, ...best);
    const verb = d.tool.type === 'axe' ? 'couper un arbre' : 'casser un rocher';
    if (cur >= d.tool.power) return `Vous avez déjà un outil aussi efficace (×${cur}).`;
    return `Pour ${verb} : ${Math.ceil(6 / cur)} coups → ${Math.ceil(6 / d.tool.power)} coups.`;
  }
  return null;
}

export function stationText(g: Game, r: Recipe): { text: string; ok: boolean } {
  if (r.station === 'hand') return { text: 'À la main, n’importe où', ok: true };
  const near = g.nearStation(r.station);
  return { text: `${STATION_NAMES[r.station]} à moins de 2 cases${near ? ' ✓' : ' (pas à portée)'}`, ok: near };
}

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
  direct: { id: string; have: number; need: number }[];
  crafted: { id: string; have: number; need: number; via: string }[];
  station: { ok: boolean; text: string };
}

export function missingFor(g: Game, key: string): MissingInfo | null {
  const e = entryByKey(key);
  if (!e) return null;
  let bestR = e.recipes[0];
  let bestMiss = Infinity;
  for (const r of e.recipes) {
    const miss = Object.entries(r.inputs).reduce((n, [id, k]) => n + Math.max(0, k - available(g, id)), 0);
    if (miss < bestMiss) {
      bestMiss = miss;
      bestR = r;
    }
  }
  const direct: MissingInfo['direct'] = [];
  const crafted: MissingInfo['crafted'] = [];
  for (const [id, need] of Object.entries(bestR.inputs)) {
    const have = available(g, id);
    if (have >= need) continue;
    const pe = producingEntry(id);
    if (pe) crafted.push({ id, have, need, via: STATION_NAMES[pe.station] });
    else direct.push({ id, have, need });
  }
  return { ready: !direct.length && !crafted.length, direct, crafted, station: stationText(g, bestR) };
}

export { recipeQty };
