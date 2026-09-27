// Progression du personnage : maîtrises, niveau global, caractéristiques dérivées de
// l'équipement (arme active, protection, accessoire, enchantements).
import { HUNGER, PLAYER, DEATH } from '../config/balance';
import { ENCHANT_BY_ID } from '../data/enchants';
import { item, type ItemDef } from '../data/items';
import {
  FAMILIES, FAMILY, GLOBAL_LEVEL, MASTERY_DAMAGE_PER_LEVEL, SKILL, TIER_MASTERY, ULTS, UNARMED,
  familySkills, masteryLevel, weaponStats, type Family, type SkillId, type WeaponStats,
} from '../data/weapons';
import type { Game } from './game';
import type { Stack } from './inventory';

export function mastery(g: Game, f: Family): number {
  return masteryLevel(g.mastery[f] ?? 0);
}

export function globalLevel(g: Game): number {
  return Math.min(GLOBAL_LEVEL.maxLevel, FAMILIES.reduce((n, f) => n + mastery(g, f), 0));
}

function enchFx(st: Stack | null) {
  return st?.ench ? ENCHANT_BY_ID[st.ench]?.fx ?? null : null;
}

function equipped(g: Game): (Stack | null)[] {
  const e = g.player.equip;
  return [e.weapon, e.armor, e.accessory];
}

function sumFx(g: Game, k: 'damage' | 'reduction' | 'maxHp' | 'speed' | 'manaRegen' | 'staminaRegen' | 'ultCharge' | 'leech' | 'burnChance' | 'slowChance' | 'poisonChance'): number {
  let n = 0;
  for (const st of equipped(g)) {
    const fx = enchFx(st);
    if (fx && fx[k]) n += fx[k]!;
  }
  return n;
}

function accessory(g: Game): ItemDef['accessory'] | null {
  const a = g.player.equip.accessory;
  return a ? item(a.id).accessory ?? null : null;
}

export function currentFamily(g: Game): Family | null {
  const w = g.player.equip.weapon;
  return w ? item(w.id).weapon!.family : null;
}

export function currentTier(g: Game): 1 | 2 | 3 {
  const w = g.player.equip.weapon;
  return (w ? item(w.id).tier : 1) ?? 1;
}

export function currentWeapon(g: Game): WeaponStats {
  const f = currentFamily(g);
  if (!f) return UNARMED;
  return weaponStats(f, currentTier(g));
}

export function maxHp(g: Game): number {
  return PLAYER.maxHealth + globalLevel(g) * GLOBAL_LEVEL.hpPerLevel + (accessory(g)?.maxHp ?? 0) + sumFx(g, 'maxHp');
}

/** Multiplicateur de dégâts du joueur (maîtrise, niveau, équipement, faim, épuisement). */
export function damageMul(g: Game, f: Family | null = currentFamily(g)): number {
  let m = 1 + (f ? mastery(g, f) * MASTERY_DAMAGE_PER_LEVEL : 0) + globalLevel(g) * GLOBAL_LEVEL.damagePerLevel;
  m += (accessory(g)?.damage ?? 0) + sumFx(g, 'damage');
  if (g.player.hunger < HUNGER.weakBelow && g.run) m *= 0.85;
  if (g.player.weakT > 0) m *= 1 - DEATH.weakDamage;
  if (g.player.st.curseT > 0) m *= 0.75;
  return m;
}

export function armorReduction(g: Game): number {
  const a = g.player.equip.armor;
  const base = a ? item(a.id).armor?.reduction ?? 0 : 0;
  return Math.min(0.6, base + sumFx(g, 'reduction'));
}

export function staminaRegenMul(g: Game): number {
  let m = 1 + (accessory(g)?.staminaRegen ?? 0) + sumFx(g, 'staminaRegen');
  if (g.player.hunger < HUNGER.slowStaminaBelow && g.run) m *= 0.6;
  if (g.player.boostT > 0) m *= 1.6;
  return m;
}

export function manaRegenMul(g: Game): number {
  let m = 1 + (accessory(g)?.manaRegen ?? 0) + sumFx(g, 'manaRegen');
  if (g.player.hunger < HUNGER.slowStaminaBelow && g.run) m *= 0.6;
  if (g.player.boostT > 0) m *= 1.6;
  return m;
}

export function speedMul(g: Game): number {
  return 1 + sumFx(g, 'speed');
}

export function ultChargeMul(g: Game): number {
  return 1 + (accessory(g)?.ultCharge ?? 0) + sumFx(g, 'ultCharge');
}

export function weaponProcs(g: Game): { leech: number; burn: number; slow: number; poison: number } {
  const fx = enchFx(g.player.equip.weapon);
  return { leech: fx?.leech ?? 0, burn: fx?.burnChance ?? 0, slow: fx?.slowChance ?? 0, poison: fx?.poisonChance ?? 0 };
}

export function lightRadius(g: Game): number {
  return accessory(g)?.light ?? 0;
}

// ------------------------------------------------------------ prérequis
export interface Check {
  ok: boolean;
  reason?: string;
}

/** Maîtrise requise pour équiper une arme (toujours affichée avant fabrication ou équipement). */
export function masteryRequirement(id: string): { family: Family; level: number } | null {
  const d = item(id);
  if (!d.weapon) return null;
  return { family: d.weapon.family, level: TIER_MASTERY[d.tier ?? 1] };
}

export function canEquipItem(g: Game, id: string): Check {
  const req = masteryRequirement(id);
  if (!req) return { ok: true };
  const have = mastery(g, req.family);
  if (have < req.level) return { ok: false, reason: `Maîtrise ${FAMILY[req.family].short} ${req.level} requise (actuelle : ${have})` };
  return { ok: true };
}

export function skillUnlocked(g: Game, id: SkillId): boolean {
  return mastery(g, SKILL[id].family) >= SKILL[id].unlock;
}

export function ultUnlocked(g: Game, f: Family): boolean {
  return mastery(g, f) >= ULTS[f].unlock;
}

/** Les deux compétences équipées d'une famille (choix mémorisé ; par défaut, les premières débloquées). */
export function loadout(g: Game, f: Family): (SkillId | null)[] {
  const saved = g.loadouts[f];
  const unlocked = familySkills(f).filter((s) => skillUnlocked(g, s.id)).map((s) => s.id);
  const out: (SkillId | null)[] = [null, null];
  if (saved) {
    saved.forEach((id, i) => {
      if (id && unlocked.includes(id) && !out.includes(id)) out[i] = id;
    });
  }
  // remplit les cases vides avec les compétences débloquées non choisies
  for (let i = 0; i < 2; i++) {
    if (out[i]) continue;
    const next = unlocked.find((id) => !out.includes(id) && !(saved ?? []).includes(id));
    if (next) out[i] = next;
  }
  return out;
}

export function setLoadout(g: Game, f: Family, slot: 0 | 1, id: SkillId): void {
  const cur = loadout(g, f);
  const other = slot === 0 ? 1 : 0;
  if (cur[other] === id) cur[other] = cur[slot];
  cur[slot] = id;
  g.loadouts[f] = cur;
}

/** Armes possédées (sac + équipée), pour le sélecteur rapide. */
export function ownedWeapons(g: Game): { id: string; where: 'equip' | number; ench?: string }[] {
  const out: { id: string; where: 'equip' | number; ench?: string }[] = [];
  const w = g.player.equip.weapon;
  if (w) out.push({ id: w.id, where: 'equip', ench: w.ench });
  g.player.inv.forEach((s, i) => {
    if (s && item(s.id).weapon) out.push({ id: s.id, where: i, ench: s.ench });
  });
  return out;
}
