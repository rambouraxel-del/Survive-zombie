// Définitions des objets (V2). `icon` = "<atlas>:<frame>" (voir public/assets/atlas).
// Les caractéristiques de combat des armes sont dans data/weapons.ts.
import type { Family } from './weapons';

export type ItemKind = 'resource' | 'rare' | 'component' | 'food' | 'consumable' | 'tool' | 'weapon' | 'armor' | 'accessory';
export type ToolType = 'axe' | 'pick';
export type EquipSlot = 'weapon' | 'armor' | 'accessory';
export type Station = 'hand' | 'workbench' | 'campfire' | 'forge' | 'enchanter';

export interface FoodInfo {
  hunger: number;
  health?: number;
  regen?: number; // bonus de récupération (PV/s) pendant 60 s
  note?: string;
}

export interface ConsumableInfo {
  heal?: number; // PV rendus (sur `healTime` s)
  healTime?: number;
  restore?: boolean; // endurance et mana au maximum
  regenBoost?: number; // bonus de récupération d'endurance/mana pendant 20 s
  bomb?: { damage: number; radius: number; knockback: number };
}

export interface AccessoryInfo {
  light?: number;
  staminaRegen?: number; // +x (fraction)
  manaRegen?: number;
  damage?: number;
  ultCharge?: number;
  maxHp?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  kind: ItemKind;
  stack: number;
  /** rang d'équipement (I, II, III) */
  tier?: 1 | 2 | 3;
  food?: FoodInfo;
  use?: ConsumableInfo;
  tool?: { type: ToolType; power: number };
  weapon?: { family: Family };
  armor?: { reduction: number };
  accessory?: AccessoryInfo;
  slot?: EquipSlot;
  /** objet unique (jamais perdu, jamais dupliqué) */
  unique?: boolean;
  /** peut recevoir un enchantement */
  enchantable?: boolean;
}

const W = (id: string, name: string, family: Family, tier: 1 | 2 | 3, icon: string, desc: string): ItemDef => ({
  id, name, desc, icon, kind: 'weapon', slot: 'weapon', stack: 1, tier, weapon: { family }, enchantable: true, unique: tier === 3,
});

const defs: ItemDef[] = [
  // ---------------------------------------------------------------- ressources ordinaires
  { id: 'wood', name: 'Bois', desc: 'Bûches tirées des arbres. Base de presque tout.', icon: 'world:i_wood', kind: 'resource', stack: 50 },
  { id: 'stone', name: 'Pierre', desc: 'Pierres ramassées sur les rochers.', icon: 'world:i_stone', kind: 'resource', stack: 50 },
  { id: 'fiber', name: 'Fibres', desc: 'Herbes hautes séchées. Sert aux liens et aux cordes.', icon: 'world:i_fiber', kind: 'resource', stack: 50 },
  { id: 'planks', name: 'Planches', desc: 'Bois équarri à l’établi.', icon: 'world:i_planks', kind: 'resource', stack: 40 },
  { id: 'rope', name: 'Corde', desc: 'Fibres tressées, solides.', icon: 'items:i_rope', kind: 'resource', stack: 20 },
  { id: 'iron_ore', name: 'Minerai de fer', desc: 'À fondre à la forge avec du charbon.', icon: 'world:i_iron_ore', kind: 'resource', stack: 30 },
  { id: 'coal', name: 'Charbon', desc: 'Combustible de forge. En filon, ou préparé au feu de camp.', icon: 'world:i_coal', kind: 'resource', stack: 30 },
  { id: 'iron', name: 'Fer travaillé', desc: 'Lingot de fer prêt à être forgé.', icon: 'world:i_iron', kind: 'resource', stack: 20 },
  { id: 'cloth', name: 'Tissu', desc: 'Étoffe récupérée dans les caisses et les ruines.', icon: 'world:i_cloth', kind: 'resource', stack: 20 },
  { id: 'scrap', name: 'Ferraille', desc: 'Métal de récupération. Refondable à la forge.', icon: 'world:i_scrap', kind: 'resource', stack: 30 },
  { id: 'hide', name: 'Peau', desc: 'Peau de cerf ou de bête. Sert aux protections et aux arcs.', icon: 'items:i_leather', kind: 'resource', stack: 20 },
  { id: 'herb', name: 'Herbe de soin', desc: 'Plante amère des sous-bois et des marais. Base des potions.', icon: 'items:i_herb', kind: 'resource', stack: 30 },

  // ---------------------------------------------------------------- matériaux rares
  { id: 'pelt', name: 'Fourrure grise', desc: 'Fourrure épaisse des loups des cendres.', icon: 'items:i_trophy', kind: 'rare', stack: 20 },
  { id: 'venom', name: 'Glande à venin', desc: 'Prélevée sur les renards corrompus. Poison et enchantements.', icon: 'items:i_potion_green', kind: 'rare', stack: 20 },
  { id: 'blackmoss', name: 'Mousse noire', desc: 'Mousse qui ne pousse que dans l’eau morte du marais. Matériau d’enchantement.', icon: 'items:i_moss', kind: 'rare', stack: 30 },
  { id: 'glowcap', name: 'Champignon luminescent', desc: 'Champignon pâle du marais. Potions de vigueur, enchantements.', icon: 'items:i_sprout', kind: 'rare', stack: 30 },
  { id: 'wisp', name: 'Essence de feu follet', desc: 'Lueur recueillie sur les âmes corrompues. Rare.', icon: 'items:i_gem_white', kind: 'rare', stack: 20 },
  { id: 'steel', name: 'Acier de rempart', desc: 'Acier trempé récupéré au bastion. Armes de rang II.', icon: 'items:i_gem_blue', kind: 'rare', stack: 20 },
  { id: 'crystal', name: 'Cristal de carrière', desc: 'Cristal extrait des galeries profondes. Rang III et enchantements.', icon: 'items:i_gem_green', kind: 'rare', stack: 20 },
  { id: 'ember', name: 'Braise éternelle', desc: 'Braise qui ne s’éteint jamais. Récompense des donjons.', icon: 'items:i_gem_red', kind: 'rare', stack: 20 },

  // ---------------------------------------------------------------- composants de boss (garantis)
  { id: 'pred_fang', name: 'Croc du Prédateur', desc: 'Arraché au prédateur corrompu du Bois des chasseurs (2 par victoire).', icon: 'items:i_claws', kind: 'component', stack: 10 },
  { id: 'chief_insignia', name: 'Insigne du capitaine', desc: 'Insignes du chef des mercenaires du bastion (3 par victoire).', icon: 'items:i_banner', kind: 'component', stack: 10 },
  { id: 'worm_plate', name: 'Carapace du ver', desc: 'Plaques de la créature de la carrière (3 par victoire).', icon: 'items:i_skull_green', kind: 'component', stack: 10 },

  // ---------------------------------------------------------------- nourriture
  { id: 'berries', name: 'Myrtilles', desc: 'Se mangent crues.', icon: 'world:i_berries', kind: 'food', stack: 20, food: { hunger: 9 } },
  { id: 'morel', name: 'Morille', desc: 'Champignon comestible au chapeau alvéolé.', icon: 'world:i_morel', kind: 'food', stack: 20, food: { hunger: 7 } },
  { id: 'meat_raw', name: 'Viande crue', desc: 'Peu nourrissante crue : mieux vaut la cuire.', icon: 'world:i_meat_raw', kind: 'food', stack: 10, food: { hunger: 6, note: 'Crue : peu nourrissante' } },
  { id: 'meat_cooked', name: 'Viande rôtie', desc: 'Cuite sur le feu du camp.', icon: 'world:i_meat_cooked', kind: 'food', stack: 10, food: { hunger: 30, health: 8 } },
  { id: 'skewer', name: 'Brochette de morilles', desc: 'Morilles grillées.', icon: 'world:i_skewer', kind: 'food', stack: 10, food: { hunger: 22, health: 4 } },
  { id: 'stew', name: 'Ragoût du forestier', desc: 'Repas complet : nourrit, soigne et aide à récupérer.', icon: 'world:i_stew', kind: 'food', stack: 5, food: { hunger: 55, health: 20, regen: 0.8 } },
  { id: 'bread', name: 'Pain de route', desc: 'Pain dur qui se conserve.', icon: 'items:i_bread', kind: 'food', stack: 10, food: { hunger: 24 } },
  { id: 'jerky', name: 'Viande séchée', desc: 'Provision de voyage.', icon: 'world:i_jerky', kind: 'food', stack: 10, food: { hunger: 20 } },

  // ---------------------------------------------------------------- consommables
  { id: 'bandage', name: 'Bandage', desc: 'Rend 30 PV en 4 secondes.', icon: 'world:i_bandage', kind: 'consumable', stack: 10, use: { heal: 30, healTime: 4 } },
  { id: 'potion_heal', name: 'Potion de soin', desc: 'Rend 55 PV en 1,5 seconde.', icon: 'items:i_potion_red', kind: 'consumable', stack: 5, use: { heal: 55, healTime: 1.5 } },
  { id: 'potion_vigor', name: 'Potion de vigueur', desc: 'Endurance et mana au maximum, récupération accrue 20 s.', icon: 'items:i_potion_blue', kind: 'consumable', stack: 5, use: { restore: true, regenBoost: 0.6 } },
  { id: 'bomb', name: 'Bombe artisanale', desc: 'Lancée devant vous : 45 dégâts autour du point d’impact et fort recul.', icon: 'items:i_bomb', kind: 'consumable', stack: 5, use: { bomb: { damage: 45, radius: 58, knockback: 260 } } },

  // ---------------------------------------------------------------- outils (utilisés automatiquement pour récolter)
  { id: 'stone_axe', name: 'Hache de pierre', desc: 'Coupe les arbres deux fois plus vite (utilisée depuis le sac).', icon: 'items:i_axe_stone', kind: 'tool', stack: 1, tool: { type: 'axe', power: 2 } },
  { id: 'stone_hammer', name: 'Masse de carrier', desc: 'Casse la roche et extrait le minerai (utilisée depuis le sac).', icon: 'items:i_hammer_big', kind: 'tool', stack: 1, tool: { type: 'pick', power: 2 } },
  { id: 'iron_axe', name: 'Hache de fer', desc: 'Coupe les arbres très rapidement.', icon: 'items:i_axe_iron', kind: 'tool', stack: 1, tool: { type: 'axe', power: 3 } },
  { id: 'iron_pick', name: 'Pioche de fer', desc: 'Extrait pierre, minerai et cristal rapidement.', icon: 'items:i_pick_iron', kind: 'tool', stack: 1, tool: { type: 'pick', power: 3 } },

  // ---------------------------------------------------------------- armes : 7 familles × 3 rangs
  W('dagger_1', 'Couteau de chasse', 'dagger', 1, 'items:i_knife', 'Lame courte et vive.'),
  W('dagger_2', 'Dague d’acier', 'dagger', 2, 'items:i_dagger', 'Dague équilibrée, trempée au bastion.'),
  W('dagger_3', 'Croc du Prédateur', 'dagger', 3, 'items:i_dagger_red', 'Lame taillée dans le croc du prédateur corrompu.'),
  W('sword_1', 'Épée d’armes', 'sword', 1, 'items:i_sword', 'Épée droite à une main.'),
  W('sword_2', 'Épée longue', 'sword', 2, 'items:i_longsword', 'Longue lame, à une ou deux mains.'),
  W('sword_3', 'Lame du capitaine', 'sword', 3, 'items:i_flamesword', 'L’épée reforgée du chef des mercenaires.'),
  W('mace_1', 'Massue cloutée', 'mace', 1, 'items:i_club', 'Lourde, repousse fortement.'),
  W('mace_2', 'Hache de guerre', 'mace', 2, 'items:i_waraxe', 'Tranchant massif qui brise les gardes.'),
  W('mace_3', 'Marteau du carrier', 'mace', 3, 'items:i_warhammer', 'Masse cerclée de la carapace du ver.'),
  W('bow_1', 'Arc de chasse', 'bow', 1, 'items:i_bow', 'Arc court et précis. Pas de flèches à fabriquer : seulement de l’endurance.'),
  W('bow_2', 'Arc long', 'bow', 2, 'items:i_longbow', 'Grande allonge, flèches plus lourdes.'),
  W('bow_3', 'Arc en croc', 'bow', 3, 'items:i_longbow', 'Arc renforcé du croc du prédateur.'),
  W('xbow_1', 'Arbalète légère', 'crossbow', 1, 'items:i_crossbow', 'Carreaux puissants ; rechargement après chaque tir.'),
  W('xbow_2', 'Arbalète de rempart', 'crossbow', 2, 'items:i_crossbow', 'Arbalète lourde des murailles.'),
  W('xbow_3', 'Arbalète du capitaine', 'crossbow', 3, 'items:i_crossbow', 'Arbalète à cranequin du chef mercenaire.'),
  W('staff_1', 'Bâton de braise', 'elemental', 1, 'items:i_scepter_silver', 'Canalise le feu, la glace et la pierre (mana).'),
  W('staff_2', 'Bâton des trois éléments', 'elemental', 2, 'items:i_scepter_silver', 'Focalise mieux les éléments.'),
  W('staff_3', 'Bâton de cœur-de-pierre', 'elemental', 3, 'items:i_scepter_red', 'Serti d’un éclat de carapace du ver : les éléments grondent.'),
  W('occ_1', 'Grimoire cendré', 'occult', 1, 'items:i_book_dark', 'Pages noircies : projectiles d’ombre et malédictions (mana).'),
  W('occ_2', 'Fétiche des marais', 'occult', 2, 'items:i_book_dark', 'Relié de mousse noire.'),
  W('occ_3', 'Grimoire du ver', 'occult', 3, 'items:i_book_red', 'Ce qui dormait sous la carrière y a laissé sa marque.'),

  // ---------------------------------------------------------------- protections
  { id: 'gambison', name: 'Gambison', desc: 'Veste matelassée : dégâts subis −15 %.', icon: 'items:i_armor_light', kind: 'armor', slot: 'armor', stack: 1, tier: 1, armor: { reduction: 0.15 }, enchantable: true },
  { id: 'chainmail', name: 'Cotte de mailles', desc: 'Anneaux de fer rivetés : dégâts subis −25 %.', icon: 'items:i_armor_iron', kind: 'armor', slot: 'armor', stack: 1, tier: 2, armor: { reduction: 0.25 }, enchantable: true },
  { id: 'brigandine', name: 'Brigandine', desc: 'Plaques rivetées sur cuir épais : dégâts subis −35 %.', icon: 'items:i_armor_plate', kind: 'armor', slot: 'armor', stack: 1, tier: 3, armor: { reduction: 0.35 }, enchantable: true },

  // ---------------------------------------------------------------- accessoires
  { id: 'torch', name: 'Torche de ceinture', desc: 'Éclaire autour de vous dans les lieux sombres.', icon: 'items:i_torch', kind: 'accessory', slot: 'accessory', stack: 1, accessory: { light: 170 }, enchantable: true },
  { id: 'acc_vigor', name: 'Amulette de vigueur', desc: 'Récupération d’endurance +20 %.', icon: 'items:i_amulet_red', kind: 'accessory', slot: 'accessory', stack: 1, accessory: { staminaRegen: 0.2 }, enchantable: true },
  { id: 'acc_focus', name: 'Anneau de concentration', desc: 'Récupération de mana +20 %.', icon: 'items:i_ring', kind: 'accessory', slot: 'accessory', stack: 1, accessory: { manaRegen: 0.2 }, enchantable: true },
  { id: 'acc_fangs', name: 'Collier de crocs', desc: 'Dégâts +5 %.', icon: 'items:i_trophy', kind: 'accessory', slot: 'accessory', stack: 1, accessory: { damage: 0.05 }, enchantable: true },
  { id: 'acc_relic', name: 'Relique du rempart', desc: 'Trouvaille exceptionnelle des souterrains : charge de l’ultime +10 %, PV max +10.', icon: 'items:i_amulet_purple', kind: 'accessory', slot: 'accessory', stack: 1, unique: true, accessory: { ultCharge: 0.1, maxHp: 10 }, enchantable: true },
  { id: 'acc_geode', name: 'Géode vivante', desc: 'Trouvaille exceptionnelle des galeries : mana et endurance +12 %, PV max +10.', icon: 'items:i_amulet_blue', kind: 'accessory', slot: 'accessory', stack: 1, unique: true, accessory: { manaRegen: 0.12, staminaRegen: 0.12, maxHp: 10 }, enchantable: true },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(defs.map((d) => [d.id, d]));

export function item(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`Objet inconnu : ${id}`);
  return d;
}

export const TIER_LABEL: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III' };

/** Ressources de sortie : récoltées ou ramassées en expédition, concernées par la perte de 20 %. */
export function isFarmResource(id: string): boolean {
  const k = ITEMS[id]?.kind;
  return k === 'resource' || k === 'rare' || k === 'food';
}
