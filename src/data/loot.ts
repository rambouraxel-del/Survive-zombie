// Tables de butin. Chaque conteneur tire `rolls` entrées pondérées.
// Les objets essentiels à la progression ne dépendent jamais du hasard :
// ils sont soit récoltables, soit placés en `guaranteed`.

export interface LootEntry {
  id: string;
  min: number;
  max: number;
  weight: number;
}

export interface LootTable {
  rolls: [number, number];
  entries: LootEntry[];
}

export const LOOT: Record<string, LootTable> = {
  // Chargements abandonnés le long des chemins
  cart: {
    rolls: [2, 3],
    entries: [
      { id: 'planks', min: 2, max: 4, weight: 4 },
      { id: 'cloth', min: 1, max: 2, weight: 4 },
      { id: 'rope', min: 1, max: 2, weight: 3 },
      { id: 'bread', min: 1, max: 2, weight: 3 },
      { id: 'scrap', min: 1, max: 3, weight: 3 },
      { id: 'jerky', min: 1, max: 2, weight: 2 },
    ],
  },
  // Petites caches en forêt
  cache: {
    rolls: [1, 2],
    entries: [
      { id: 'berries', min: 2, max: 4, weight: 3 },
      { id: 'bandage', min: 1, max: 2, weight: 3 },
      { id: 'arrow', min: 4, max: 8, weight: 2 },
      { id: 'jerky', min: 1, max: 2, weight: 3 },
      { id: 'cloth', min: 1, max: 1, weight: 2 },
      { id: 'coal', min: 1, max: 3, weight: 2 },
    ],
  },
  // Coffres du hameau
  hamlet: {
    rolls: [2, 4],
    entries: [
      { id: 'cloth', min: 1, max: 3, weight: 5 },
      { id: 'scrap', min: 2, max: 4, weight: 4 },
      { id: 'bread', min: 1, max: 3, weight: 3 },
      { id: 'rope', min: 1, max: 2, weight: 3 },
      { id: 'bandage', min: 1, max: 2, weight: 3 },
      { id: 'iron', min: 1, max: 2, weight: 2 },
      { id: 'arrow', min: 5, max: 10, weight: 2 },
    ],
  },
  // Crypte et tombes du cimetière
  crypt: {
    rolls: [2, 3],
    entries: [
      { id: 'scrap', min: 2, max: 5, weight: 4 },
      { id: 'iron', min: 1, max: 2, weight: 3 },
      { id: 'cloth', min: 1, max: 2, weight: 2 },
      { id: 'bandage', min: 1, max: 3, weight: 3 },
      { id: 'coal', min: 2, max: 4, weight: 2 },
    ],
  },
  // Bois corrompus
  corrupt: {
    rolls: [2, 4],
    entries: [
      { id: 'iron', min: 1, max: 3, weight: 4 },
      { id: 'bandage', min: 2, max: 3, weight: 3 },
      { id: 'stew', min: 1, max: 1, weight: 2 },
      { id: 'arrow', min: 8, max: 14, weight: 3 },
      { id: 'coal', min: 2, max: 4, weight: 2 },
    ],
  },
};

// Contenus fixes (progression garantie)
export const GUARANTEED: Record<string, { id: string; qty: number }[]> = {
  start_chest: [
    { id: 'cloth', qty: 2 },
    { id: 'rope', qty: 1 },
    { id: 'bread', qty: 2 },
    { id: 'bandage', qty: 1 },
  ],
  hamlet_forge_chest: [
    { id: 'iron', qty: 2 },
    { id: 'coal', qty: 3 },
    { id: 'cloth', qty: 2 },
  ],
};
