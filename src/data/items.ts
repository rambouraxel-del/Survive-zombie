// Définitions des objets. `icon` = "<atlas>:<frame>" (voir public/assets/atlas).

export type ItemKind = 'resource' | 'food' | 'tool' | 'weapon' | 'armor' | 'consumable' | 'ammo' | 'quest';
export type ToolType = 'axe' | 'pick' | 'light';
export type EquipSlot = 'weapon' | 'tool' | 'armor';
export type Station = 'hand' | 'workbench' | 'campfire' | 'forge';

export interface FoodInfo {
  hunger: number;
  health?: number;
  regen?: number; // bonus de récupération (PV/s) pendant 60 s
  note?: string;
}

export interface WeaponInfo {
  damage: number;
  reach: number; // portée en px depuis le joueur
  cooldown: number;
  stamina: number;
  knockback: number;
  ranged?: boolean;
  anim: 'slash' | 'thrust' | 'shoot';
}

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  kind: ItemKind;
  stack: number;
  food?: FoodInfo;
  tool?: { type: ToolType; power: number };
  weapon?: WeaponInfo;
  armor?: { reduction: number };
  durability?: number;
  heal?: number; // soin d'un consommable (bandage)
  light?: number; // rayon de lumière si équipé
  repair?: { station: Station; cost: Record<string, number> };
  slot?: EquipSlot;
}

const defs: ItemDef[] = [
  // Ressources
  { id: 'wood', name: 'Bois', desc: 'Bûches tirées des arbres. Base de presque tout.', icon: 'world:i_wood', kind: 'resource', stack: 50 },
  { id: 'stone', name: 'Pierre', desc: 'Pierres ramassées sur les rochers.', icon: 'world:i_stone', kind: 'resource', stack: 50 },
  { id: 'fiber', name: 'Fibres', desc: 'Herbes hautes séchées. Sert aux liens et aux cordes.', icon: 'world:i_fiber', kind: 'resource', stack: 50 },
  { id: 'planks', name: 'Planches', desc: 'Bois équarri à l’établi.', icon: 'world:i_planks', kind: 'resource', stack: 40 },
  { id: 'rope', name: 'Corde', desc: 'Fibres tressées, solides.', icon: 'items:i_rope', kind: 'resource', stack: 20 },
  { id: 'iron_ore', name: 'Minerai de fer', desc: 'À fondre à la forge avec du charbon.', icon: 'world:i_iron_ore', kind: 'resource', stack: 30 },
  { id: 'coal', name: 'Charbon', desc: 'Combustible de forge. Se trouve en filon ou se prépare au feu de camp.', icon: 'world:i_coal', kind: 'resource', stack: 30 },
  { id: 'iron', name: 'Fer travaillé', desc: 'Lingot de fer prêt à être forgé.', icon: 'world:i_iron', kind: 'resource', stack: 20 },
  { id: 'cloth', name: 'Tissu', desc: 'Étoffe récupérée dans les maisons et les caisses.', icon: 'world:i_cloth', kind: 'resource', stack: 20 },
  { id: 'scrap', name: 'Ferraille', desc: 'Pièces de métal de récupération. Refondable à la forge.', icon: 'world:i_scrap', kind: 'resource', stack: 30 },

  // Nourriture
  { id: 'berries', name: 'Myrtilles', desc: 'Se mangent crues.', icon: 'world:i_berries', kind: 'food', stack: 20, food: { hunger: 9 } },
  { id: 'morel', name: 'Morille', desc: 'Champignon comestible, reconnaissable à son chapeau alvéolé.', icon: 'world:i_morel', kind: 'food', stack: 20, food: { hunger: 7 } },
  { id: 'meat_raw', name: 'Viande crue', desc: 'Prise au piège. Peu nourrissante crue : mieux vaut la cuire.', icon: 'world:i_meat_raw', kind: 'food', stack: 10, food: { hunger: 6, note: 'Crue : peu nourrissante' } },
  { id: 'meat_cooked', name: 'Viande rôtie', desc: 'Cuite au feu de camp.', icon: 'world:i_meat_cooked', kind: 'food', stack: 10, food: { hunger: 30, health: 6 } },
  { id: 'skewer', name: 'Brochette de morilles', desc: 'Morilles grillées au feu.', icon: 'world:i_skewer', kind: 'food', stack: 10, food: { hunger: 22, health: 3 } },
  { id: 'stew', name: 'Ragoût du forestier', desc: 'Repas complet : nourrit, soigne et aide à récupérer.', icon: 'world:i_stew', kind: 'food', stack: 5, food: { hunger: 55, health: 15, regen: 0.8 } },
  { id: 'bread', name: 'Pain de route', desc: 'Pain sec et dur qui se conserve.', icon: 'items:i_bread', kind: 'food', stack: 10, food: { hunger: 24 } },
  { id: 'jerky', name: 'Viande séchée', desc: 'Provision de voyage retrouvée.', icon: 'world:i_jerky', kind: 'food', stack: 10, food: { hunger: 20 } },

  // Consommables
  { id: 'bandage', name: 'Bandage', desc: 'Rend 30 PV en quelques secondes.', icon: 'world:i_bandage', kind: 'consumable', stack: 10, heal: 30 },
  { id: 'arrow', name: 'Flèche', desc: 'Munition pour l’arc.', icon: 'items:i_arrow', kind: 'ammo', stack: 40 },

  // Outils
  { id: 'stone_axe', name: 'Hache de pierre', desc: 'Abat les arbres deux fois plus vite qu’à mains nues.', icon: 'items:i_axe_stone', kind: 'tool', slot: 'tool', stack: 1, tool: { type: 'axe', power: 2 }, durability: 70, weapon: { damage: 7, reach: 36, cooldown: 0.5, stamina: 10, knockback: 90, anim: 'slash' }, repair: { station: 'workbench', cost: { wood: 1, stone: 2 } } },
  { id: 'stone_hammer', name: 'Masse de carrier', desc: 'Casse la roche et extrait le minerai.', icon: 'items:i_hammer_big', kind: 'tool', slot: 'tool', stack: 1, tool: { type: 'pick', power: 2 }, durability: 70, weapon: { damage: 7, reach: 36, cooldown: 0.55, stamina: 11, knockback: 110, anim: 'slash' }, repair: { station: 'workbench', cost: { wood: 1, stone: 2 } } },
  { id: 'iron_axe', name: 'Hache de fer', desc: 'Abat les arbres très rapidement.', icon: 'items:i_axe_iron', kind: 'tool', slot: 'tool', stack: 1, tool: { type: 'axe', power: 3 }, durability: 160, weapon: { damage: 12, reach: 38, cooldown: 0.5, stamina: 10, knockback: 110, anim: 'slash' }, repair: { station: 'forge', cost: { iron: 1 } } },
  { id: 'iron_pick', name: 'Pioche de fer', desc: 'Extrait pierre et minerai très rapidement.', icon: 'items:i_pick_iron', kind: 'tool', slot: 'tool', stack: 1, tool: { type: 'pick', power: 3 }, durability: 160, weapon: { damage: 10, reach: 38, cooldown: 0.55, stamina: 11, knockback: 110, anim: 'slash' }, repair: { station: 'forge', cost: { iron: 1 } } },
  { id: 'torch', name: 'Torche', desc: 'Éclaire autour de vous tant qu’elle est équipée comme outil. Brûle la nuit.', icon: 'items:i_torch', kind: 'tool', slot: 'tool', stack: 1, tool: { type: 'light', power: 0 }, durability: 300, light: 170 },

  // Armes
  { id: 'spear', name: 'Lance en bois', desc: 'Longue allonge : frappe avant d’être touché.', icon: 'items:i_spear', kind: 'weapon', slot: 'weapon', stack: 1, durability: 90, weapon: { damage: 11, reach: 52, cooldown: 0.55, stamina: 11, knockback: 120, anim: 'thrust' }, repair: { station: 'workbench', cost: { wood: 2 } } },
  { id: 'club', name: 'Massue renforcée', desc: 'Lourde, repousse fortement les ennemis.', icon: 'items:i_club', kind: 'weapon', slot: 'weapon', stack: 1, durability: 120, weapon: { damage: 15, reach: 38, cooldown: 0.65, stamina: 14, knockback: 190, anim: 'slash' }, repair: { station: 'workbench', cost: { wood: 2, stone: 1 } } },
  { id: 'sword', name: 'Épée', desc: 'Arme forgée, rapide et puissante.', icon: 'items:i_sword', kind: 'weapon', slot: 'weapon', stack: 1, durability: 220, weapon: { damage: 22, reach: 42, cooldown: 0.42, stamina: 10, knockback: 140, anim: 'slash' }, repair: { station: 'forge', cost: { iron: 1 } } },
  { id: 'bow', name: 'Arc', desc: 'Tire des flèches sur la cible la plus proche. Nécessite des flèches.', icon: 'items:i_bow', kind: 'weapon', slot: 'weapon', stack: 1, durability: 140, weapon: { damage: 16, reach: 300, cooldown: 0.7, stamina: 8, knockback: 80, ranged: true, anim: 'shoot' }, repair: { station: 'workbench', cost: { planks: 1, rope: 1 } } },

  // Protections
  { id: 'gambison', name: 'Gambison', desc: 'Veste matelassée : réduit les dégâts de 25 %.', icon: 'items:i_armor_light', kind: 'armor', slot: 'armor', stack: 1, armor: { reduction: 0.25 }, durability: 160, repair: { station: 'workbench', cost: { cloth: 1 } } },
  { id: 'brigandine', name: 'Brigandine', desc: 'Protection renforcée de fer : réduit les dégâts de 45 %.', icon: 'items:i_armor_iron', kind: 'armor', slot: 'armor', stack: 1, armor: { reduction: 0.45 }, durability: 260, repair: { station: 'forge', cost: { iron: 1 } } },

  // Quête
  { id: 'frag_1', name: 'Fragment du Hameau', desc: 'Premier fragment du sceau. Objet de quête : il ne peut être ni perdu ni jeté.', icon: 'items:i_frag_1', kind: 'quest', stack: 1 },
  { id: 'frag_2', name: 'Fragment de la Crypte', desc: 'Deuxième fragment du sceau. Objet de quête : il ne peut être ni perdu ni jeté.', icon: 'items:i_frag_2', kind: 'quest', stack: 1 },
  { id: 'frag_3', name: 'Fragment des Pierres noires', desc: 'Troisième fragment du sceau. Objet de quête : il ne peut être ni perdu ni jeté.', icon: 'items:i_frag_3', kind: 'quest', stack: 1 },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(defs.map((d) => [d.id, d]));

export function item(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`Objet inconnu : ${id}`);
  return d;
}

export const FRAGMENTS = ['frag_1', 'frag_2', 'frag_3'];
