// Enchantements : un seul emplacement par objet compatible, effets modestes.
// Ils restent attachés à l'objet (transfert, changement d'arme, mort, sauvegarde).
import type { EquipSlot } from './items';

export interface EnchantDef {
  id: string;
  name: string;
  desc: string;
  slots: EquipSlot[];
  cost: Record<string, number>;
  /** effets (appliqués par la simulation) */
  fx: {
    damage?: number; // +x (fraction)
    burnChance?: number;
    slowChance?: number;
    poisonChance?: number;
    leech?: number; // fraction des dégâts rendue en PV
    reduction?: number;
    maxHp?: number;
    speed?: number;
    manaRegen?: number;
    staminaRegen?: number;
    ultCharge?: number;
  };
}

export const ENCHANTS: EnchantDef[] = [
  { id: 'keen', name: 'Affûtage', desc: 'Dégâts +8 %.', slots: ['weapon'], cost: { iron: 2, blackmoss: 2 }, fx: { damage: 0.08 } },
  { id: 'ember', name: 'Braise', desc: '12 % de chances d’enflammer (3 dégâts/s, 3 s).', slots: ['weapon'], cost: { coal: 3, ember: 1, glowcap: 1 }, fx: { burnChance: 0.12 } },
  { id: 'frost', name: 'Givre', desc: '12 % de chances de ralentir la cible (30 %, 2 s).', slots: ['weapon'], cost: { wisp: 1, glowcap: 2 }, fx: { slowChance: 0.12 } },
  { id: 'venom', name: 'Venin', desc: '15 % de chances d’empoisonner (3 dégâts/s, 4 s).', slots: ['weapon'], cost: { venom: 2, blackmoss: 1 }, fx: { poisonChance: 0.15 } },
  { id: 'leech', name: 'Saignée', desc: '3 % des dégâts infligés rendus en PV.', slots: ['weapon'], cost: { wisp: 2, pelt: 1 }, fx: { leech: 0.03 } },
  { id: 'ward', name: 'Garde', desc: 'Dégâts subis −5 %.', slots: ['armor'], cost: { iron: 2, blackmoss: 2 }, fx: { reduction: 0.05 } },
  { id: 'vigor', name: 'Vigueur', desc: 'PV max +12.', slots: ['armor', 'accessory'], cost: { pelt: 2, herb: 3 }, fx: { maxHp: 12 } },
  { id: 'swift', name: 'Vivacité', desc: 'Vitesse de déplacement +6 %.', slots: ['armor'], cost: { hide: 3, glowcap: 1 }, fx: { speed: 0.06 } },
  { id: 'focus', name: 'Concentration', desc: 'Récupération de mana +15 %.', slots: ['accessory', 'weapon'], cost: { glowcap: 2, wisp: 1 }, fx: { manaRegen: 0.15 } },
  { id: 'endure', name: 'Endurance', desc: 'Récupération d’endurance +15 %.', slots: ['accessory', 'armor'], cost: { herb: 3, pelt: 1 }, fx: { staminaRegen: 0.15 } },
  { id: 'resolve', name: 'Résolution', desc: 'Charge de l’ultime +8 %.', slots: ['accessory'], cost: { crystal: 1, wisp: 1 }, fx: { ultCharge: 0.08 } },
];

export const ENCHANT_BY_ID: Record<string, EnchantDef> = Object.fromEntries(ENCHANTS.map((e) => [e.id, e]));
