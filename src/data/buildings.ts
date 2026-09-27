import type { Station } from './items';

export interface BuildingDef {
  id: string;
  name: string;
  desc: string;
  cost: Record<string, number>;
  w: number; // empreinte en tuiles
  h: number;
  hp: number;
  blocks: boolean; // bloque le passage des zombies
  playerPasses?: boolean; // le joueur peut traverser (porte)
  station?: Station;
  storage?: number;
  light?: number;
  sprite: string; // frame dans l'atlas "world"
  icon: string;
  needsGrass?: boolean;
  spawnPoint?: boolean;
  contactDamage?: number; // dégâts/s infligés aux zombies au contact
  refund: number; // part remboursée à la démolition
  /** amélioration possible (niveau 2) : même position, même identité, contenu conservé */
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
  { id: 'campfire', name: 'Feu de camp', desc: 'Cuisine, éclaire et accélère la récupération.', cost: { wood: 5, stone: 3 }, w: 1, h: 1, hp: 80, blocks: true, station: 'campfire', light: 190, sprite: 'campfire_0', icon: 'world:campfire_1', refund: 0.5,
    upgrade: { name: 'Feu amélioré', desc: 'Un chaudron suspendu au-dessus d’un foyer de pierres.', benefits: ['Lumière portée plus loin (+35 %)', 'Repos plus réparateur autour du feu (zone plus large, soins ×1,5)'], cost: { stone: 6, scrap: 2 }, sprite: 'cauldron_fire_0', icon: 'world:cauldron_fire_0', light: 256 } },
  { id: 'workbench', name: 'Établi', desc: 'Planches, armes, arc et réparations.', cost: { wood: 10, stone: 4 }, w: 2, h: 1, hp: 120, blocks: true, station: 'workbench', sprite: 'workbench', icon: 'world:workbench', refund: 0.5,
    upgrade: { name: 'Établi renforcé', desc: 'Un plan de travail cerclé de fer, avec ses outils à portée.', benefits: ['Réparations d’objets à moitié prix', 'Planches : 3 par fabrication au lieu de 2'], cost: { planks: 4, rope: 2, stone: 4 }, sprite: 'workbench_smith', icon: 'world:workbench_smith' } },
  { id: 'chest', name: 'Coffre', desc: 'Stocke 16 emplacements. Détruit, il laisse un sac avec son contenu.', cost: { planks: 4 }, w: 1, h: 1, hp: 100, blocks: true, storage: 16, sprite: 'chest_closed', icon: 'world:chest_closed', refund: 0.5,
    upgrade: { name: 'Coffre agrandi', desc: 'Un grand coffre cerclé de fer.', benefits: ['24 emplacements au lieu de 16 (le contenu est conservé)'], cost: { planks: 6, rope: 2 }, sprite: 'chest_big_closed', icon: 'world:chest_big_closed', storage: 24 } },
  { id: 'bed', name: 'Paillasse', desc: 'Point de réapparition. Permet de dormir la nuit une fois la horde repoussée.', cost: { fiber: 8, wood: 4 }, w: 2, h: 2, hp: 80, blocks: true, spawnPoint: true, sprite: 'bed_straw', icon: 'world:bed_straw', refund: 0.5 },
  { id: 'palisade', name: 'Palissade', desc: 'Mur de bois. Les zombies doivent la détruire pour passer.', cost: { wood: 4 }, w: 1, h: 1, hp: 160, blocks: true, sprite: 'fence_h', icon: 'world:fence_h', refund: 0.5 },
  { id: 'door', name: 'Porte', desc: 'Vous la traversez librement ; les zombies, jamais.', cost: { planks: 4, rope: 2 }, w: 1, h: 1, hp: 200, blocks: true, playerPasses: true, sprite: 'door_closed', icon: 'world:door_closed', refund: 0.5 },
  { id: 'spikes', name: 'Pieux défensifs', desc: 'Blessent les zombies qui s’y frottent.', cost: { wood: 6, rope: 1 }, w: 1, h: 1, hp: 140, blocks: true, contactDamage: 6, sprite: 'spikes', icon: 'world:spikes', refund: 0.5 },
  { id: 'forge', name: 'Forge', desc: 'Fonte du fer et outils de métal.', cost: { stone: 16, wood: 6, coal: 2 }, w: 2, h: 2, hp: 250, blocks: true, station: 'forge', light: 120, sprite: 'forge', icon: 'world:forge', refund: 0.5 },
  { id: 'trap', name: 'Piège à gibier', desc: 'À poser sur l’herbe. Capture régulièrement du petit gibier (viande crue).', cost: { wood: 4, rope: 2 }, w: 1, h: 1, hp: 50, blocks: false, needsGrass: true, sprite: 'trap', icon: 'world:trap', refund: 0.5 },
  { id: 'lamp', name: 'Lanterne sur poteau', desc: 'Éclaire durablement le camp la nuit.', cost: { wood: 3, coal: 1, scrap: 1 }, w: 1, h: 1, hp: 60, blocks: true, light: 210, sprite: 'lamp_on', icon: 'world:lamp_on', refund: 0.5 },
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
