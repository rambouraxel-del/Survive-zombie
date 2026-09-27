// Familles d'armes, caractéristiques des attaques de base, compétences et ultimes.
// Tous les chiffres d'équilibrage du combat sont ici (voir aussi config/balance.ts).

export type Family = 'dagger' | 'sword' | 'mace' | 'bow' | 'crossbow' | 'elemental' | 'occult';
export const FAMILIES: Family[] = ['dagger', 'sword', 'mace', 'bow', 'crossbow', 'elemental', 'occult'];

export type Resource = 'stamina' | 'mana';
/** animation du corps utilisée pour l'attaque */
export type BodyAnim = 'slash' | 'thrust' | 'shoot' | 'spellcast';

export interface FamilyDef {
  id: Family;
  name: string;
  short: string;
  resource: Resource;
  ranged: boolean;
  /** calque visible par rang (atlas d'équipement) */
  look: [string, string, string];
  anim: BodyAnim;
  desc: string;
}

export const FAMILY: Record<Family, FamilyDef> = {
  dagger: { id: 'dagger', name: 'Dague', short: 'Dague', resource: 'stamina', ranged: false, look: ['dagger', 'dagger', 'dagger'], anim: 'slash', desc: 'Coups très rapides et mobiles. Poison, coups dans le dos.' },
  sword: { id: 'sword', name: 'Épée longue', short: 'Épée', resource: 'stamina', ranged: false, look: ['sword', 'longsword', 'longsword'], anim: 'slash', desc: 'Polyvalente : balayage, parade et riposte, estoc perçant.' },
  mace: { id: 'mace', name: 'Masse et hache de guerre', short: 'Masse', resource: 'stamina', ranged: false, look: ['club', 'waraxe', 'mace'], anim: 'slash', desc: 'Lente et lourde : écrase, brise les gardes, repousse.' },
  bow: { id: 'bow', name: 'Arc', short: 'Arc', resource: 'stamina', ranged: true, look: ['bow', 'bow', 'bow'], anim: 'shoot', desc: 'Tirs à distance réguliers. Aucune flèche à fabriquer.' },
  crossbow: { id: 'crossbow', name: 'Arbalète', short: 'Arbalète', resource: 'stamina', ranged: true, look: ['crossbow', 'crossbow', 'crossbow'], anim: 'thrust', desc: 'Carreaux lourds ; rechargement entre les tirs. Aucun carreau à fabriquer.' },
  elemental: { id: 'elemental', name: 'Magie élémentaire', short: 'Éléments', resource: 'mana', ranged: true, look: ['staff', 'staff', 'staff'], anim: 'spellcast', desc: 'Feu offensif, glace qui ralentit et immobilise, pierre qui protège.' },
  occult: { id: 'occult', name: 'Magie occulte', short: 'Occulte', resource: 'mana', ranged: true, look: ['gnarled', 'gnarled', 'gnarled'], anim: 'thrust', desc: 'Ombre, malédictions qui affaiblissent, serviteur temporaire.' },
};

export interface WeaponStats {
  damage: number;
  /** temps entre deux attaques (s) ; pour l'arbalète : durée du tir */
  cooldown: number;
  /** portée (px) : allonge au corps à corps, distance de tir à distance */
  reach: number;
  cost: number; // endurance ou mana par attaque de base
  knockback: number;
  /** projectile (armes à distance) */
  projSpeed?: number;
  projKind?: ProjKind;
  /** arbalète : durée du rechargement (s) */
  reload?: number;
  /** petite zone à l'impact (feu) */
  splash?: number;
}

export type ProjKind = 'arrow' | 'bolt' | 'fire' | 'shadow' | 'ice' | 'spit' | 'rock' | 'bomb' | 'enemy_arrow';

const BASE: Record<Family, WeaponStats> = {
  dagger: { damage: 7, cooldown: 0.3, reach: 30, cost: 5, knockback: 45 },
  sword: { damage: 12, cooldown: 0.48, reach: 40, cost: 9, knockback: 110 },
  mace: { damage: 20, cooldown: 0.82, reach: 38, cost: 14, knockback: 200 },
  bow: { damage: 11, cooldown: 0.58, reach: 290, cost: 7, knockback: 60, projSpeed: 470, projKind: 'arrow' },
  crossbow: { damage: 26, cooldown: 0.2, reach: 320, cost: 10, knockback: 150, projSpeed: 560, projKind: 'bolt', reload: 1.15 },
  elemental: { damage: 13, cooldown: 0.62, reach: 260, cost: 9, knockback: 70, projSpeed: 360, projKind: 'fire', splash: 22 },
  occult: { damage: 11, cooldown: 0.55, reach: 250, cost: 7, knockback: 40, projSpeed: 330, projKind: 'shadow' },
};

/** multiplicateur de dégâts par rang */
export const TIER_DAMAGE = { 1: 1, 2: 1.45, 3: 2 } as const;
/** maîtrise requise pour équiper une arme de ce rang */
export const TIER_MASTERY = { 1: 0, 2: 2, 3: 4 } as const;

export function weaponStats(family: Family, tier: 1 | 2 | 3): WeaponStats {
  const b = BASE[family];
  const s = { ...b, damage: Math.round(b.damage * TIER_DAMAGE[tier]) };
  if (tier >= 2) s.cooldown = +(b.cooldown * 0.95).toFixed(3);
  if (family === 'bow' || family === 'crossbow') s.reach = b.reach + (tier - 1) * 20;
  if (family === 'crossbow' && b.reload) s.reload = +(b.reload * (tier === 3 ? 0.85 : tier === 2 ? 0.93 : 1)).toFixed(2);
  return s;
}

/** dégâts à mains nues (aucune arme équipée) */
export const UNARMED: WeaponStats = { damage: 4, cooldown: 0.45, reach: 28, cost: 6, knockback: 60 };

// ------------------------------------------------------------ maîtrises
/** dégâts réels cumulés nécessaires pour chaque niveau de maîtrise (0 à 10) */
export const MASTERY_XP = [0, 90, 240, 480, 850, 1350, 2000, 2900, 4000, 5400, 7200];
export const MASTERY_MAX = MASTERY_XP.length - 1;
/** bonus de dégâts par niveau de maîtrise de la famille */
export const MASTERY_DAMAGE_PER_LEVEL = 0.025;

export function masteryLevel(xp: number): number {
  let l = 0;
  for (let i = 0; i < MASTERY_XP.length; i++) if (xp >= MASTERY_XP[i]) l = i;
  return l;
}

/** niveau global : somme des maîtrises (bonus modestes) */
export const GLOBAL_LEVEL = { hpPerLevel: 2, damagePerLevel: 0.004, maxLevel: 70 };

// ------------------------------------------------------------ compétences
export type SkillId =
  | 'd_lunge' | 'd_poison' | 'd_backstab'
  | 's_sweep' | 's_parry' | 's_thrust'
  | 'm_crush' | 'm_break' | 'm_whirl'
  | 'b_pierce' | 'b_slow' | 'b_volley'
  | 'x_pierce' | 'x_heavy' | 'x_rapid'
  | 'e_fire' | 'e_ice' | 'e_stone'
  | 'o_zone' | 'o_curse' | 'o_summon';

export interface SkillDef {
  id: SkillId;
  family: Family;
  name: string;
  desc: string;
  cost: number; // endurance ou mana (selon la famille)
  cooldown: number;
  /** maîtrise requise */
  unlock: number;
  icon: string;
}

export const SKILLS: SkillDef[] = [
  { id: 'd_lunge', family: 'dagger', name: 'Fente preste', desc: 'Bond de trois cases vers l’avant : frappe chaque ennemi traversé (×1,6).', cost: 16, cooldown: 5, unlock: 0, icon: 'items:i_boots' },
  { id: 'd_poison', family: 'dagger', name: 'Lame empoisonnée', desc: 'Vos 5 prochains coups empoisonnent (4 dégâts/s pendant 5 s).', cost: 14, cooldown: 12, unlock: 2, icon: 'items:i_potion_green' },
  { id: 'd_backstab', family: 'dagger', name: 'Coup dans le dos', desc: 'Passe derrière l’ennemi proche et frappe (×2,6 ; ×3,4 s’il ne vous visait pas).', cost: 20, cooldown: 9, unlock: 4, icon: 'items:i_dagger_red' },
  { id: 's_sweep', family: 'sword', name: 'Balayage', desc: 'Large arc devant vous : touche tous les ennemis proches (×1,4) et les repousse.', cost: 18, cooldown: 6, unlock: 0, icon: 'items:fx_swing_1' },
  { id: 's_parry', family: 'sword', name: 'Parade et riposte', desc: 'Garde de 0,6 s : le prochain coup reçu est annulé et renvoyé (×2,5) avec un étourdissement.', cost: 10, cooldown: 7, unlock: 2, icon: 'items:i_shield' },
  { id: 's_thrust', family: 'sword', name: 'Estoc perçant', desc: 'Longue estocade (×1,9) qui traverse toute la ligne d’ennemis.', cost: 18, cooldown: 8, unlock: 4, icon: 'items:i_longsword' },
  { id: 'm_crush', family: 'mace', name: 'Écrasement', desc: 'Coup vertical armé (0,35 s) : ×2,3 dans une petite zone, étourdit brièvement.', cost: 18, cooldown: 7, unlock: 0, icon: 'items:i_warhammer' },
  { id: 'm_break', family: 'mace', name: 'Brise-garde', desc: 'Interrompt l’attaque annoncée d’un ennemi et le rend vulnérable (+25 % de dégâts subis, 5 s).', cost: 14, cooldown: 10, unlock: 2, icon: 'items:i_shield' },
  { id: 'm_whirl', family: 'mace', name: 'Moulinet', desc: 'Tour complet : ×1,5 à tous les ennemis autour, fort recul.', cost: 22, cooldown: 9, unlock: 4, icon: 'items:fx_swing_2' },
  { id: 'b_pierce', family: 'bow', name: 'Flèche perçante', desc: 'Traverse tous les ennemis alignés (×1,6).', cost: 12, cooldown: 6, unlock: 0, icon: 'items:i_arrow' },
  { id: 'b_slow', family: 'bow', name: 'Flèche entravante', desc: 'La cible est ralentie de moitié pendant 4 s (×1,2).', cost: 10, cooldown: 8, unlock: 2, icon: 'items:fx_ice_1' },
  { id: 'b_volley', family: 'bow', name: 'Salve courte', desc: 'Cinq flèches en éventail (×0,8 chacune).', cost: 18, cooldown: 9, unlock: 4, icon: 'items:i_longbow' },
  { id: 'x_pierce', family: 'crossbow', name: 'Carreau perforant', desc: 'Carreau qui traverse la ligne (×1,7). Ne demande pas d’être chargé.', cost: 14, cooldown: 7, unlock: 0, icon: 'items:i_crossbow' },
  { id: 'x_heavy', family: 'crossbow', name: 'Tir lourd', desc: 'Carreau lesté : ×1,4, recul très fort et interruption.', cost: 16, cooldown: 9, unlock: 2, icon: 'items:i_hammer_big' },
  { id: 'x_rapid', family: 'crossbow', name: 'Rechargement éclair', desc: 'Pendant 6 s, rechargement quatre fois plus rapide.', cost: 12, cooldown: 16, unlock: 4, icon: 'items:i_gem_blue' },
  { id: 'e_fire', family: 'elemental', name: 'Boule de feu', desc: 'Explose à l’impact (×2 dans un rayon de 1,5 case) et enflamme (3 dégâts/s, 4 s).', cost: 24, cooldown: 6, unlock: 0, icon: 'items:fx_fire_1' },
  { id: 'e_ice', family: 'elemental', name: 'Carcan de glace', desc: 'Projectile de givre : immobilise 1,5 s (boss : ralenti 3 s).', cost: 20, cooldown: 9, unlock: 2, icon: 'items:fx_ice_2' },
  { id: 'e_stone', family: 'elemental', name: 'Peau de pierre', desc: 'Bouclier de 45 points pendant 6 s et onde qui repousse les ennemis au contact.', cost: 24, cooldown: 14, unlock: 4, icon: 'items:i_gem_green' },
  { id: 'o_zone', family: 'occult', name: 'Marais d’ombre', desc: 'Flaque d’ombre sur l’ennemi visé : 6 dégâts/s pendant 4 s et ralentissement.', cost: 20, cooldown: 8, unlock: 0, icon: 'items:fx_dark_2' },
  { id: 'o_curse', family: 'occult', name: 'Malédiction', desc: 'La cible subit +30 % de dégâts et en inflige −25 % pendant 8 s.', cost: 16, cooldown: 12, unlock: 2, icon: 'items:fx_curse_1' },
  { id: 'o_summon', family: 'occult', name: 'Serviteur spectral', desc: 'Invoque un spectre allié 12 s (un seul à la fois ; disparaît si vous changez d’arme).', cost: 30, cooldown: 20, unlock: 4, icon: 'items:fx_spirit_1' },
];

export const SKILL: Record<SkillId, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, SkillDef>;

export function familySkills(f: Family): SkillDef[] {
  return SKILLS.filter((s) => s.family === f);
}

// ------------------------------------------------------------ ultimes
export interface UltDef {
  family: Family;
  name: string;
  desc: string;
  /** portée maximale de la visée (px) */
  range: number;
  /** forme de la visée : direction (ligne) ou point au sol (zone) */
  aim: 'line' | 'point';
  radius: number;
  unlock: number;
  icon: string;
}

export const ULTS: Record<Family, UltDef> = {
  dagger: { family: 'dagger', name: 'Danse des ombres', desc: 'Enchaîne six frappes éclair d’ennemi en ennemi dans la direction visée ; invulnérable pendant la danse.', range: 190, aim: 'line', radius: 70, unlock: 1, icon: 'items:i_dagger_red' },
  sword: { family: 'sword', name: 'Tempête d’acier', desc: 'Combo de quatre tailles en avançant dans la direction visée ; la dernière repousse violemment.', range: 150, aim: 'line', radius: 56, unlock: 1, icon: 'items:i_flamesword' },
  mace: { family: 'mace', name: 'Séisme', desc: 'Impact massif au point visé : lourds dégâts de zone et étourdissement (réduit sur les boss).', range: 150, aim: 'point', radius: 92, unlock: 1, icon: 'items:i_warhammer' },
  bow: { family: 'bow', name: 'Pluie de flèches', desc: 'Une volée s’abat sur la zone visée pendant 2,5 s.', range: 300, aim: 'point', radius: 84, unlock: 1, icon: 'items:i_longbow' },
  crossbow: { family: 'crossbow', name: 'Carreau de siège', desc: 'Tir dévastateur en ligne droite dans la direction visée : traverse tout et repousse.', range: 420, aim: 'line', radius: 26, unlock: 1, icon: 'items:i_crossbow' },
  elemental: { family: 'elemental', name: 'Colère des éléments', desc: 'Au point visé : explosion de feu, puis anneau de glace qui immobilise, puis onde de pierre.', range: 280, aim: 'point', radius: 96, unlock: 1, icon: 'items:i_scepter_red' },
  occult: { family: 'occult', name: 'Manifestation', desc: 'Des tentacules d’ombre surgissent au point visé : ils attirent et broient les ennemis 4 s.', range: 260, aim: 'point', radius: 90, unlock: 1, icon: 'items:i_book_red' },
};

/** Jauge d'ultime partagée (0 à 100) : alimentée par les dégâts réels infligés et subis. */
export const ULT_GAUGE = {
  perDamageDealt: 100 / 380, // environ 380 dégâts infligés pour la remplir
  perDamageTaken: 100 / 900, // subir des coups la remplit bien moins vite qu'en frapper
};

export const SUMMON = { duration: 12, max: 1, damage: 7, cooldown: 0.9, speed: 120, reach: 34 };
