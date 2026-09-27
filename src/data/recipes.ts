import type { Station } from './items';

export interface Recipe {
  id: string;
  station: Station;
  inputs: Record<string, number>;
  output: string;
  qty: number;
  /** recettes regroupées dans une même fiche (plusieurs méthodes pour un même résultat) */
  group?: string;
  method?: string;
}

export const STATION_NAMES: Record<Station, string> = {
  hand: 'À la main',
  workbench: 'Établi',
  campfire: 'Feu et chaudron',
  forge: 'Forge',
  enchanter: 'Autel d’enchantement',
};

// Ordre fixe : la liste ne bouge jamais sous le doigt. Les meilleurs équipements se fabriquent.
export const RECIPES: Recipe[] = [
  // À la main
  { id: 'r_rope', station: 'hand', inputs: { fiber: 3 }, output: 'rope', qty: 1 },
  { id: 'r_bandage', station: 'hand', inputs: { cloth: 1, fiber: 1 }, output: 'bandage', qty: 2 },
  { id: 'r_stone_axe', station: 'hand', inputs: { wood: 3, stone: 3, fiber: 2 }, output: 'stone_axe', qty: 1 },
  { id: 'r_stone_hammer', station: 'hand', inputs: { wood: 2, stone: 4, fiber: 2 }, output: 'stone_hammer', qty: 1 },
  // Établi
  { id: 'r_planks', station: 'workbench', inputs: { wood: 3 }, output: 'planks', qty: 2 },
  { id: 'r_dagger_1', station: 'workbench', inputs: { wood: 1, stone: 2, hide: 1 }, output: 'dagger_1', qty: 1 },
  { id: 'r_mace_1', station: 'workbench', inputs: { wood: 4, stone: 3, rope: 1 }, output: 'mace_1', qty: 1 },
  { id: 'r_bow_1', station: 'workbench', inputs: { planks: 2, rope: 2, hide: 1 }, output: 'bow_1', qty: 1 },
  { id: 'r_xbow_1', station: 'workbench', inputs: { planks: 3, rope: 2, scrap: 2 }, output: 'xbow_1', qty: 1 },
  { id: 'r_staff_1', station: 'workbench', inputs: { wood: 3, herb: 2, coal: 1 }, output: 'staff_1', qty: 1 },
  { id: 'r_occ_1', station: 'workbench', inputs: { cloth: 2, hide: 1, herb: 2 }, output: 'occ_1', qty: 1 },
  { id: 'r_gambison', station: 'workbench', inputs: { cloth: 4, rope: 2 }, output: 'gambison', qty: 1 },
  { id: 'r_torch', station: 'workbench', inputs: { wood: 2, fiber: 2, coal: 1 }, output: 'torch', qty: 1 },
  { id: 'r_bomb', station: 'workbench', inputs: { coal: 2, scrap: 1, cloth: 1 }, output: 'bomb', qty: 1 },
  { id: 'r_bow_2', station: 'workbench', inputs: { planks: 3, pelt: 2, rope: 2, steel: 1 }, output: 'bow_2', qty: 1 },
  { id: 'r_xbow_2', station: 'workbench', inputs: { planks: 3, rope: 2, steel: 2 }, output: 'xbow_2', qty: 1 },
  { id: 'r_occ_2', station: 'workbench', inputs: { blackmoss: 3, venom: 2, wisp: 1 }, output: 'occ_2', qty: 1 },
  { id: 'r_acc_fangs', station: 'workbench', inputs: { pelt: 2, hide: 1, rope: 1 }, output: 'acc_fangs', qty: 1 },
  { id: 'r_bow_3', station: 'workbench', inputs: { pred_fang: 1, planks: 3, pelt: 2, crystal: 1 }, output: 'bow_3', qty: 1 },
  { id: 'r_occ_3', station: 'workbench', inputs: { worm_plate: 1, blackmoss: 3, wisp: 2, crystal: 1 }, output: 'occ_3', qty: 1 },
  // Feu et chaudron (cuisine et potions)
  { id: 'r_cook_meat', station: 'campfire', inputs: { meat_raw: 1 }, output: 'meat_cooked', qty: 1 },
  { id: 'r_skewer', station: 'campfire', inputs: { morel: 2 }, output: 'skewer', qty: 1 },
  { id: 'r_stew', station: 'campfire', inputs: { meat_raw: 1, morel: 1, berries: 2 }, output: 'stew', qty: 1 },
  { id: 'r_jerky', station: 'campfire', inputs: { meat_raw: 2, fiber: 1 }, output: 'jerky', qty: 2 },
  { id: 'r_potion_heal', station: 'campfire', inputs: { herb: 3, berries: 2 }, output: 'potion_heal', qty: 1 },
  { id: 'r_potion_vigor', station: 'campfire', inputs: { glowcap: 2, herb: 1 }, output: 'potion_vigor', qty: 1 },
  { id: 'r_charcoal', station: 'campfire', inputs: { wood: 3 }, output: 'coal', qty: 1 },
  // Forge
  { id: 'r_ingot', station: 'forge', inputs: { iron_ore: 2, coal: 1 }, output: 'iron', qty: 1, group: 'iron', method: 'Fondre du minerai' },
  { id: 'r_scrap_ingot', station: 'forge', inputs: { scrap: 3, coal: 1 }, output: 'iron', qty: 1, group: 'iron', method: 'Refondre de la ferraille' },
  { id: 'r_iron_axe', station: 'forge', inputs: { iron: 2, planks: 2, rope: 1 }, output: 'iron_axe', qty: 1 },
  { id: 'r_iron_pick', station: 'forge', inputs: { iron: 2, planks: 2, rope: 1 }, output: 'iron_pick', qty: 1 },
  { id: 'r_sword_1', station: 'forge', inputs: { iron: 2, planks: 1, hide: 1 }, output: 'sword_1', qty: 1 },
  { id: 'r_dagger_2', station: 'forge', inputs: { steel: 2, iron: 1, hide: 1 }, output: 'dagger_2', qty: 1 },
  { id: 'r_sword_2', station: 'forge', inputs: { steel: 3, iron: 2, hide: 1 }, output: 'sword_2', qty: 1 },
  { id: 'r_mace_2', station: 'forge', inputs: { steel: 3, iron: 2, planks: 2 }, output: 'mace_2', qty: 1 },
  { id: 'r_staff_2', station: 'forge', inputs: { steel: 1, glowcap: 3, wisp: 1 }, output: 'staff_2', qty: 1 },
  { id: 'r_chainmail', station: 'forge', inputs: { iron: 5, steel: 2, cloth: 2 }, output: 'chainmail', qty: 1 },
  { id: 'r_acc_vigor', station: 'forge', inputs: { iron: 1, pelt: 1, glowcap: 2 }, output: 'acc_vigor', qty: 1 },
  { id: 'r_acc_focus', station: 'forge', inputs: { iron: 1, wisp: 1, glowcap: 2 }, output: 'acc_focus', qty: 1 },
  { id: 'r_dagger_3', station: 'forge', inputs: { pred_fang: 1, steel: 2, crystal: 1 }, output: 'dagger_3', qty: 1 },
  { id: 'r_sword_3', station: 'forge', inputs: { chief_insignia: 1, steel: 4, crystal: 2 }, output: 'sword_3', qty: 1 },
  { id: 'r_xbow_3', station: 'forge', inputs: { chief_insignia: 1, steel: 3, planks: 3, crystal: 1 }, output: 'xbow_3', qty: 1 },
  { id: 'r_mace_3', station: 'forge', inputs: { worm_plate: 1, iron: 4, crystal: 2 }, output: 'mace_3', qty: 1 },
  { id: 'r_staff_3', station: 'forge', inputs: { worm_plate: 1, crystal: 3, wisp: 2 }, output: 'staff_3', qty: 1 },
  { id: 'r_brigandine', station: 'forge', inputs: { chief_insignia: 1, steel: 4, hide: 3, cloth: 2 }, output: 'brigandine', qty: 1 },
];

export const RECIPE_BY_ID: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

/** Entrées de la liste de fabrication : une recette seule, ou un groupe de méthodes. */
export interface RecipeEntry {
  key: string;
  output: string;
  station: Station;
  recipes: Recipe[];
}

export const RECIPE_ENTRIES: RecipeEntry[] = (() => {
  const out: RecipeEntry[] = [];
  for (const r of RECIPES) {
    if (r.group) {
      const e = out.find((x) => x.key === r.group);
      if (e) {
        e.recipes.push(r);
        continue;
      }
      out.push({ key: r.group, output: r.output, station: r.station, recipes: [r] });
    } else out.push({ key: r.id, output: r.output, station: r.station, recipes: [r] });
  }
  return out;
})();

/** Matériaux intermédiaires : fabriqués à partir d'autres ressources. */
export function producingEntry(itemId: string): RecipeEntry | null {
  return RECIPE_ENTRIES.find((e) => e.output === itemId && !['coal'].includes(itemId)) ?? null;
}
