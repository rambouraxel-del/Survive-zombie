// Installations du camp et mobilier de la maison.
// Le camp est sûr : aucune installation n'y est attaquée ; palissades et pieux sont décoratifs.
import type { Station } from './items';

export type Where = 'camp' | 'house' | 'both';

export interface BuildingDef {
  id: string;
  name: string;
  desc: string;
  cost: Record<string, number>;
  w: number; // empreinte en tuiles
  h: number;
  blocks: boolean;
  playerPasses?: boolean;
  station?: Station;
  storage?: number;
  light?: number;
  /** image : "atlas:frame" */
  sprite: string;
  icon: string;
  needsGrass?: boolean;
  where: Where;
  /** point de repos (lit) */
  rest?: boolean;
  /** mannequin d'entraînement */
  dummy?: boolean;
  refund: number; // part remboursée à la démolition
  /** non constructible (coffre de transfert d'une ancienne partie) */
  hidden?: boolean;
  category: 'station' | 'storage' | 'furniture' | 'decor';
  upgrade?: UpgradeDef;
}

export interface UpgradeDef {
  name: string;
  desc: string;
  benefits: string[];
  cost: Record<string, number>;
  sprite: string;
  icon: string;
  storage?: number;
  light?: number;
}

export const BUILDINGS: BuildingDef[] = [
  // Stations
  { id: 'workbench', name: 'Établi', desc: 'Planches, armes de bois, arcs, arbalètes, protections de cuir.', cost: { wood: 10, stone: 4 }, w: 2, h: 1, blocks: true, station: 'workbench', sprite: 'world:workbench', icon: 'world:workbench', where: 'both', refund: 1, category: 'station',
    upgrade: { name: 'Établi renforcé', desc: 'Un plan de travail cerclé de fer.', benefits: ['Planches : 3 par fabrication au lieu de 2'], cost: { planks: 4, rope: 2, stone: 4 }, sprite: 'world:workbench_smith', icon: 'world:workbench_smith' } },
  { id: 'campfire', name: 'Feu de cuisine', desc: 'Cuisine, potions et charbon de bois.', cost: { wood: 5, stone: 3 }, w: 1, h: 1, blocks: true, station: 'campfire', light: 190, sprite: 'world:campfire_0', icon: 'world:campfire_1', where: 'camp', refund: 1, category: 'station',
    upgrade: { name: 'Chaudron suspendu', desc: 'Un chaudron au-dessus d’un foyer de pierres.', benefits: ['Lumière portée plus loin', 'Ragoûts et potions : même recette, cuisson plus sûre (aucune différence de coût)'], cost: { stone: 6, scrap: 2 }, sprite: 'world:cauldron_fire_0', icon: 'world:cauldron_fire_0', light: 256 } },
  { id: 'forge', name: 'Forge', desc: 'Fonte du fer, armes et protections de métal.', cost: { stone: 16, wood: 6, coal: 2 }, w: 2, h: 2, blocks: true, station: 'forge', light: 120, sprite: 'world:forge', icon: 'world:forge', where: 'camp', refund: 1, category: 'station' },
  { id: 'enchanter', name: 'Autel d’enchantement', desc: 'Grave un enchantement sur une arme, une protection ou un accessoire.', cost: { stone: 12, iron: 2, glowcap: 2 }, w: 2, h: 2, blocks: true, station: 'enchanter', light: 110, sprite: 'world:seal_stone_on', icon: 'world:seal_stone_on', where: 'camp', refund: 1, category: 'station' },
  { id: 'dummy', name: 'Mannequin d’entraînement', desc: 'Pour essayer armes, compétences et ultimes. Ne donne ni maîtrise ni charge d’ultime.', cost: { wood: 4, fiber: 4 }, w: 1, h: 1, blocks: true, dummy: true, sprite: 'items:scarecrow', icon: 'items:scarecrow', where: 'camp', refund: 1, category: 'station' },
  // Rangement
  { id: 'chest', name: 'Coffre', desc: '16 emplacements. Au camp, la fabrication puise aussi dans les coffres.', cost: { planks: 4 }, w: 1, h: 1, blocks: true, storage: 16, sprite: 'world:chest_closed', icon: 'world:chest_closed', where: 'both', refund: 1, category: 'storage',
    upgrade: { name: 'Coffre agrandi', desc: 'Un grand coffre cerclé de fer.', benefits: ['24 emplacements au lieu de 16 (le contenu est conservé)'], cost: { planks: 6, rope: 2 }, sprite: 'world:chest_big_closed', icon: 'world:chest_big_closed', storage: 24 } },
  { id: 'transfer', name: 'Coffre de transfert', desc: 'Contient les possessions importées d’une ancienne partie (48 emplacements).', cost: {}, w: 1, h: 1, blocks: true, storage: 48, sprite: 'world:chest_big_closed', icon: 'world:chest_big_closed', where: 'camp', refund: 1, category: 'storage', hidden: true },
  // Mobilier de la maison
  { id: 'bed', name: 'Lit', desc: 'Se reposer : PV, endurance et mana au maximum.', cost: { planks: 4, cloth: 3 }, w: 1, h: 2, blocks: true, rest: true, sprite: 'props:bed_house', icon: 'props:bed_house', where: 'house', refund: 1, category: 'furniture' },
  { id: 'bookshelf', name: 'Bibliothèque', desc: 'Des livres et des carnets de route.', cost: { planks: 4 }, w: 1, h: 1, blocks: true, sprite: 'props:bookshelf', icon: 'props:bookshelf', where: 'house', refund: 1, category: 'furniture' },
  { id: 'wardrobe', name: 'Armoire', desc: 'Grande armoire de bois sombre.', cost: { planks: 5 }, w: 1, h: 1, blocks: true, sprite: 'props:wardrobe', icon: 'props:wardrobe', where: 'house', refund: 1, category: 'furniture' },
  { id: 'dresser', name: 'Commode', desc: 'Tiroirs et petits rangements.', cost: { planks: 4 }, w: 1, h: 1, blocks: true, sprite: 'props:dresser', icon: 'props:dresser', where: 'house', refund: 1, category: 'furniture' },
  { id: 'table_round', name: 'Guéridon', desc: 'Petite table ronde.', cost: { planks: 2 }, w: 1, h: 1, blocks: true, sprite: 'props:table_round', icon: 'props:table_round', where: 'house', refund: 1, category: 'furniture' },
  { id: 'table_long', name: 'Grande table', desc: 'Table de repas.', cost: { planks: 4 }, w: 2, h: 1, blocks: true, sprite: 'props:table_long', icon: 'props:table_long', where: 'both', refund: 1, category: 'furniture' },
  { id: 'weapon_rack', name: 'Râtelier d’armes', desc: 'Pour exposer lances et hallebardes.', cost: { planks: 3, iron: 1 }, w: 1, h: 1, blocks: true, sprite: 'props:weapon_rack', icon: 'props:weapon_rack', where: 'both', refund: 1, category: 'furniture' },
  { id: 'armor_shelf', name: 'Étagère d’armures', desc: 'Casques alignés.', cost: { planks: 3, scrap: 2 }, w: 2, h: 1, blocks: true, sprite: 'props:armor_shelf', icon: 'props:armor_shelf', where: 'house', refund: 1, category: 'furniture' },
  { id: 'hearth', name: 'Poêle en briques', desc: 'Chauffe la maison et l’éclaire.', cost: { stone: 8, iron: 1 }, w: 1, h: 1, blocks: true, light: 130, sprite: 'props:hearth', icon: 'props:hearth', where: 'house', refund: 1, category: 'furniture' },
  { id: 'cask', name: 'Tonneau', desc: 'Un tonneau debout.', cost: { planks: 2 }, w: 1, h: 1, blocks: true, sprite: 'props:cask', icon: 'props:cask', where: 'both', refund: 1, category: 'decor' },
  { id: 'barrels_big', name: 'Tonneaux couchés', desc: 'Réserve de cidre ou de vin.', cost: { planks: 4 }, w: 2, h: 1, blocks: true, sprite: 'props:barrels_big', icon: 'props:barrels_big', where: 'both', refund: 1, category: 'decor' },
  // Décors du camp
  { id: 'lamp', name: 'Lanterne sur poteau', desc: 'Éclaire le camp.', cost: { wood: 3, coal: 1, scrap: 1 }, w: 1, h: 1, blocks: true, light: 210, sprite: 'world:lamp_on', icon: 'world:lamp_on', where: 'camp', refund: 1, category: 'decor' },
  { id: 'table_rough', name: 'Table de camp', desc: 'Table de bois brut.', cost: { wood: 4 }, w: 2, h: 1, blocks: true, sprite: 'props:table_rough', icon: 'props:table_rough', where: 'camp', refund: 1, category: 'decor' },
  { id: 'trough', name: 'Abreuvoir', desc: 'Pour d’éventuelles bêtes de somme.', cost: { planks: 3 }, w: 2, h: 1, blocks: true, sprite: 'props:trough', icon: 'props:trough', where: 'camp', refund: 1, category: 'decor' },
  { id: 'palisade', name: 'Palissade (décor)', desc: 'Clôture décorative : le camp n’est jamais attaqué.', cost: { wood: 2 }, w: 1, h: 1, blocks: true, sprite: 'world:fence_h', icon: 'world:fence_h', where: 'camp', refund: 1, category: 'decor' },
  { id: 'spikes', name: 'Chevaux de frise (décor)', desc: 'Décoratifs.', cost: { wood: 3 }, w: 1, h: 1, blocks: true, sprite: 'world:spikes', icon: 'world:spikes', where: 'camp', refund: 1, category: 'decor' },
  { id: 'trap', name: 'Piège à gibier', desc: 'Sur l’herbe du camp : capture du petit gibier pendant vos séjours au camp.', cost: { wood: 4, rope: 2 }, w: 1, h: 1, blocks: false, needsGrass: true, sprite: 'world:trap', icon: 'world:trap', where: 'camp', refund: 1, category: 'decor' },
];

export const BUILDING_BY_ID: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

/** Nom, stockage, lumière et sprite effectifs d'une construction selon son niveau. */
export function buildingStats(type: string, level = 1): { name: string; storage?: number; light?: number; sprite: string; icon: string } {
  const d = BUILDING_BY_ID[type];
  if (level >= 2 && d.upgrade) {
    const u = d.upgrade;
    return { name: u.name, storage: u.storage ?? d.storage, light: u.light ?? d.light, sprite: u.sprite, icon: u.icon };
  }
  return { name: d.name, storage: d.storage, light: d.light, sprite: d.sprite, icon: d.icon };
}

/** Coffre de transfert (import d'une ancienne partie) : grande capacité, non constructible. */
export const TRANSFER_CHEST_SIZE = 48;
