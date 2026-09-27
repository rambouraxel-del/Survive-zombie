// Tables de butin des coffres. Chaque coffre tire `rolls` entrées pondérées, puis ajoute
// ses objets garantis. Rien d'indispensable à la progression ne dépend du hasard : les
// composants de boss sont garantis, les matériaux rares se récoltent aussi.

export interface LootEntry {
  id: string;
  min: number;
  max: number;
  weight: number;
}

export interface LootTable {
  rolls: [number, number];
  entries: LootEntry[];
  guaranteed?: { id: string; qty: number }[];
  /** très faible chance d'une trouvaille exceptionnelle (jamais nécessaire) */
  rare?: { id: string; chance: number };
}

export const LOOT: Record<string, LootTable> = {
  // --- Bois des chasseurs
  bois_lodge: { rolls: [2, 3], entries: [
    { id: 'rope', min: 1, max: 2, weight: 3 }, { id: 'bread', min: 1, max: 2, weight: 3 }, { id: 'hide', min: 1, max: 2, weight: 3 },
    { id: 'cloth', min: 1, max: 2, weight: 3 }, { id: 'bandage', min: 1, max: 2, weight: 2 }, { id: 'jerky', min: 1, max: 2, weight: 2 },
  ] },
  bois_pond: { rolls: [1, 2], entries: [
    { id: 'herb', min: 1, max: 3, weight: 4 }, { id: 'berries', min: 2, max: 4, weight: 3 }, { id: 'fiber', min: 2, max: 4, weight: 3 }, { id: 'cloth', min: 1, max: 1, weight: 1 },
  ] },
  bois_reserve: { rolls: [3, 4], entries: [
    { id: 'hide', min: 2, max: 3, weight: 3 }, { id: 'pelt', min: 1, max: 2, weight: 2 }, { id: 'jerky', min: 2, max: 3, weight: 3 },
    { id: 'potion_heal', min: 1, max: 1, weight: 2 }, { id: 'scrap', min: 1, max: 3, weight: 2 }, { id: 'iron', min: 1, max: 1, weight: 1 },
  ] },
  bois_poacher: { rolls: [2, 2], entries: [{ id: 'cloth', min: 2, max: 3, weight: 2 }, { id: 'rope', min: 2, max: 3, weight: 2 }], guaranteed: [{ id: 'acc_fangs', qty: 1 }, { id: 'potion_heal', qty: 2 }] },
  // --- Marais corrompu
  marais_common: { rolls: [2, 3], entries: [
    { id: 'herb', min: 2, max: 3, weight: 3 }, { id: 'blackmoss', min: 1, max: 2, weight: 3 }, { id: 'glowcap', min: 1, max: 2, weight: 3 },
    { id: 'cloth', min: 1, max: 2, weight: 2 }, { id: 'bandage', min: 1, max: 2, weight: 2 },
  ] },
  marais_rare: { rolls: [3, 4], entries: [
    { id: 'wisp', min: 1, max: 2, weight: 3 }, { id: 'blackmoss', min: 2, max: 3, weight: 3 }, { id: 'glowcap', min: 2, max: 3, weight: 3 },
    { id: 'venom', min: 1, max: 2, weight: 2 }, { id: 'potion_vigor', min: 1, max: 1, weight: 2 }, { id: 'ember', min: 1, max: 1, weight: 1 },
  ] },
  marais_hidden: { rolls: [2, 2], entries: [{ id: 'glowcap', min: 2, max: 3, weight: 2 }, { id: 'herb', min: 2, max: 3, weight: 2 }], guaranteed: [{ id: 'acc_focus', qty: 1 }, { id: 'wisp', qty: 2 }] },
  // --- Bastion abandonné
  bastion_common: { rolls: [2, 3], entries: [
    { id: 'scrap', min: 2, max: 4, weight: 3 }, { id: 'cloth', min: 1, max: 3, weight: 3 }, { id: 'planks', min: 2, max: 3, weight: 2 },
    { id: 'bread', min: 1, max: 2, weight: 2 }, { id: 'steel', min: 1, max: 1, weight: 2 }, { id: 'bomb', min: 1, max: 2, weight: 1 },
  ] },
  bastion_armory: { rolls: [2, 3], entries: [
    { id: 'steel', min: 1, max: 2, weight: 3 }, { id: 'iron', min: 1, max: 2, weight: 3 }, { id: 'bomb', min: 1, max: 2, weight: 2 }, { id: 'potion_heal', min: 1, max: 1, weight: 2 },
  ], guaranteed: [{ id: 'steel', qty: 2 }, { id: 'chainmail', qty: 1 }] },
  bastion_boss: { rolls: [2, 3], entries: [
    { id: 'steel', min: 2, max: 3, weight: 3 }, { id: 'iron', min: 2, max: 3, weight: 3 }, { id: 'potion_heal', min: 1, max: 2, weight: 2 }, { id: 'ember', min: 1, max: 1, weight: 1 },
  ], guaranteed: [{ id: 'potion_vigor', qty: 1 }] },
  // --- Ancienne carrière
  carriere_common: { rolls: [2, 3], entries: [
    { id: 'iron_ore', min: 2, max: 4, weight: 3 }, { id: 'coal', min: 2, max: 3, weight: 3 }, { id: 'stone', min: 4, max: 8, weight: 2 },
    { id: 'rope', min: 1, max: 2, weight: 2 }, { id: 'jerky', min: 1, max: 2, weight: 2 }, { id: 'crystal', min: 1, max: 1, weight: 1 },
  ] },
  carriere_rare: { rolls: [3, 3], entries: [
    { id: 'crystal', min: 1, max: 2, weight: 3 }, { id: 'iron', min: 2, max: 3, weight: 2 }, { id: 'wisp', min: 1, max: 1, weight: 2 }, { id: 'potion_vigor', min: 1, max: 1, weight: 1 },
  ], guaranteed: [{ id: 'iron_pick', qty: 1 }] },
  carriere_boss: { rolls: [2, 3], entries: [
    { id: 'crystal', min: 2, max: 3, weight: 3 }, { id: 'iron', min: 2, max: 3, weight: 2 }, { id: 'ember', min: 1, max: 1, weight: 1 }, { id: 'potion_heal', min: 1, max: 2, weight: 2 },
  ] },
  // --- Donjons : récompenses de fin selon le palier
  d_bastion_1: { rolls: [3, 3], entries: [{ id: 'steel', min: 1, max: 2, weight: 3 }, { id: 'iron', min: 2, max: 3, weight: 3 }, { id: 'bomb', min: 1, max: 2, weight: 2 }, { id: 'potion_heal', min: 1, max: 1, weight: 2 }], rare: { id: 'acc_relic', chance: 0.02 } },
  d_bastion_2: { rolls: [3, 4], entries: [{ id: 'steel', min: 2, max: 3, weight: 3 }, { id: 'iron', min: 2, max: 3, weight: 2 }, { id: 'ember', min: 1, max: 1, weight: 1 }, { id: 'potion_heal', min: 1, max: 2, weight: 2 }], rare: { id: 'acc_relic', chance: 0.03 } },
  d_bastion_3: { rolls: [4, 4], entries: [{ id: 'steel', min: 2, max: 4, weight: 3 }, { id: 'ember', min: 1, max: 2, weight: 2 }, { id: 'crystal', min: 1, max: 1, weight: 1 }, { id: 'potion_vigor', min: 1, max: 1, weight: 2 }], guaranteed: [{ id: 'chief_insignia', qty: 1 }], rare: { id: 'acc_relic', chance: 0.04 } },
  d_bastion_4: { rolls: [4, 5], entries: [{ id: 'steel', min: 3, max: 4, weight: 3 }, { id: 'ember', min: 1, max: 2, weight: 2 }, { id: 'crystal', min: 1, max: 2, weight: 2 }, { id: 'potion_vigor', min: 1, max: 2, weight: 2 }], guaranteed: [{ id: 'chief_insignia', qty: 1 }], rare: { id: 'acc_relic', chance: 0.05 } },
  d_bastion_5: { rolls: [5, 5], entries: [{ id: 'steel', min: 3, max: 5, weight: 3 }, { id: 'ember', min: 2, max: 2, weight: 2 }, { id: 'crystal', min: 2, max: 2, weight: 2 }, { id: 'wisp', min: 1, max: 2, weight: 2 }], guaranteed: [{ id: 'chief_insignia', qty: 2 }], rare: { id: 'acc_relic', chance: 0.06 } },
  d_carriere_1: { rolls: [3, 3], entries: [{ id: 'crystal', min: 1, max: 2, weight: 3 }, { id: 'iron', min: 2, max: 3, weight: 3 }, { id: 'coal', min: 2, max: 4, weight: 2 }, { id: 'potion_heal', min: 1, max: 1, weight: 2 }], rare: { id: 'acc_geode', chance: 0.02 } },
  d_carriere_2: { rolls: [3, 4], entries: [{ id: 'crystal', min: 2, max: 3, weight: 3 }, { id: 'iron', min: 2, max: 3, weight: 2 }, { id: 'ember', min: 1, max: 1, weight: 1 }, { id: 'potion_vigor', min: 1, max: 1, weight: 2 }], rare: { id: 'acc_geode', chance: 0.03 } },
  d_carriere_3: { rolls: [4, 4], entries: [{ id: 'crystal', min: 2, max: 4, weight: 3 }, { id: 'wisp', min: 1, max: 2, weight: 2 }, { id: 'ember', min: 1, max: 2, weight: 2 }], guaranteed: [{ id: 'worm_plate', qty: 1 }], rare: { id: 'acc_geode', chance: 0.04 } },
  d_carriere_4: { rolls: [4, 5], entries: [{ id: 'crystal', min: 3, max: 4, weight: 3 }, { id: 'wisp', min: 1, max: 2, weight: 2 }, { id: 'ember', min: 1, max: 2, weight: 2 }, { id: 'potion_vigor', min: 1, max: 2, weight: 2 }], guaranteed: [{ id: 'worm_plate', qty: 1 }], rare: { id: 'acc_geode', chance: 0.05 } },
  d_carriere_5: { rolls: [5, 5], entries: [{ id: 'crystal', min: 3, max: 5, weight: 3 }, { id: 'wisp', min: 2, max: 3, weight: 2 }, { id: 'ember', min: 2, max: 2, weight: 2 }], guaranteed: [{ id: 'worm_plate', qty: 2 }], rare: { id: 'acc_geode', chance: 0.06 } },
};

/** Coffre de départ (au camp, nouvelle partie). */
export const START_CHEST: { id: string; qty: number }[] = [
  { id: 'bread', qty: 3 }, { id: 'bandage', qty: 3 }, { id: 'wood', qty: 12 }, { id: 'stone', qty: 8 }, { id: 'fiber', qty: 6 },
  { id: 'stone_axe', qty: 1 }, { id: 'stone_hammer', qty: 1 }, { id: 'rope', qty: 2 },
];
