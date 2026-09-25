import type { Station } from './items';

export interface Recipe {
  id: string;
  station: Station;
  inputs: Record<string, number>;
  output: string;
  qty: number;
}

export const STATION_NAMES: Record<Station, string> = {
  hand: 'À la main',
  workbench: 'Établi',
  campfire: 'Feu de camp',
  forge: 'Forge',
};

export const RECIPES: Recipe[] = [
  // À la main
  { id: 'r_stone_axe', station: 'hand', inputs: { wood: 3, stone: 3, fiber: 2 }, output: 'stone_axe', qty: 1 },
  { id: 'r_stone_hammer', station: 'hand', inputs: { wood: 2, stone: 4, fiber: 2 }, output: 'stone_hammer', qty: 1 },
  { id: 'r_spear', station: 'hand', inputs: { wood: 4, fiber: 2 }, output: 'spear', qty: 1 },
  { id: 'r_rope', station: 'hand', inputs: { fiber: 3 }, output: 'rope', qty: 1 },
  { id: 'r_torch', station: 'hand', inputs: { wood: 1, fiber: 2 }, output: 'torch', qty: 1 },
  { id: 'r_bandage', station: 'hand', inputs: { cloth: 1, fiber: 1 }, output: 'bandage', qty: 2 },
  // Établi
  { id: 'r_planks', station: 'workbench', inputs: { wood: 3 }, output: 'planks', qty: 2 },
  { id: 'r_club', station: 'workbench', inputs: { wood: 4, stone: 3, rope: 1 }, output: 'club', qty: 1 },
  { id: 'r_bow', station: 'workbench', inputs: { planks: 2, rope: 2 }, output: 'bow', qty: 1 },
  { id: 'r_arrows', station: 'workbench', inputs: { wood: 2, stone: 1, fiber: 1 }, output: 'arrow', qty: 6 },
  { id: 'r_gambison', station: 'workbench', inputs: { cloth: 4, rope: 2 }, output: 'gambison', qty: 1 },
  // Feu de camp
  { id: 'r_cook_meat', station: 'campfire', inputs: { meat_raw: 1 }, output: 'meat_cooked', qty: 1 },
  { id: 'r_skewer', station: 'campfire', inputs: { morel: 2 }, output: 'skewer', qty: 1 },
  { id: 'r_stew', station: 'campfire', inputs: { meat_raw: 1, morel: 1, berries: 2 }, output: 'stew', qty: 1 },
  { id: 'r_charcoal', station: 'campfire', inputs: { wood: 3 }, output: 'coal', qty: 1 },
  // Forge
  { id: 'r_ingot', station: 'forge', inputs: { iron_ore: 2, coal: 1 }, output: 'iron', qty: 1 },
  { id: 'r_scrap_ingot', station: 'forge', inputs: { scrap: 3, coal: 1 }, output: 'iron', qty: 1 },
  { id: 'r_iron_axe', station: 'forge', inputs: { iron: 2, planks: 2, rope: 1 }, output: 'iron_axe', qty: 1 },
  { id: 'r_iron_pick', station: 'forge', inputs: { iron: 2, planks: 2, rope: 1 }, output: 'iron_pick', qty: 1 },
  { id: 'r_sword', station: 'forge', inputs: { iron: 3, planks: 1, cloth: 1 }, output: 'sword', qty: 1 },
  { id: 'r_brigandine', station: 'forge', inputs: { iron: 4, cloth: 3, rope: 1 }, output: 'brigandine', qty: 1 },
];

export const RECIPE_BY_ID: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
