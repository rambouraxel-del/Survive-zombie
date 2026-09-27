// Réglages d'équilibrage centralisés (voir aussi data/weapons.ts pour le combat).
// Les durées sont en secondes de jeu (la simulation est en pas fixes et s'arrête en pause).

export const TILE = 32;
export const CHUNK = 16; // taille d'un chunk de rendu (en tuiles)

export const SIM_STEP = 1 / 60; // pas fixe de simulation
export const MAX_FRAME_DELTA = 0.25; // au-delà (onglet en pause…), on ignore le surplus

export const PLAYER = {
  radius: 9,
  speed: 112, // px/s
  sprintMult: 1.5,
  maxHealth: 100,
  maxHunger: 100,
  maxStamina: 100,
  maxMana: 100,
  staminaRegenPerSec: 30,
  staminaRegenDelay: 0.6,
  manaRegenPerSec: 16, // les mages ne restent jamais bloqués
  manaRegenDelay: 0.5,
  sprintCostPerSec: 14,
  dodgeCost: 22,
  dodgeDuration: 0.22,
  dodgeSpeed: 330,
  hurtInvuln: 0.55,
  interactRange: 46,
  buildRange: 6 * TILE,
  /** récupération lente de PV hors combat (PV/s) */
  regenPerSec: 0.6,
  regenCombatDelay: 6,
  /** au camp : récupération rapide */
  campRegenPerSec: 6,
};

/** Faim : ne baisse qu'en expédition, effets progressifs (la récupération d'abord). */
export const HUNGER = {
  drainPerSec: 100 / (24 * 60), // 100 points en 24 minutes d'expédition
  noRegenBelow: 55, // plus de récupération de PV
  slowStaminaBelow: 30, // récupération d'endurance et de mana −40 %
  weakBelow: 12, // dégâts −15 %
  starveDps: 0.25, // à 0 : perte lente de PV, jamais mortelle (plancher)
  starveFloor: 15,
};

export const HARVEST = {
  noiseRadius: 6 * TILE,
};

export const ENEMY = {
  /** au-delà, les ennemis ne sont plus simulés en détail (économie de calcul) */
  activeRadius: 26 * TILE,
  /** perte de vue avant d'abandonner la poursuite */
  loseSightTime: 4,
  maxSummons: 4,
};

export const DEATH = {
  /** expédition principale : retour au dernier point de halte */
  respawnHealth: 0.6,
  weakDuration: 60, // « Épuisé » : dégâts −20 %
  weakDamage: 0.2,
  protect: 3, // invulnérabilité au retour
  /** région de ressources : part perdue des ressources de sortie encore détenues */
  farmLoss: 0.2,
};

/** Arrondi centralisé de la perte de sortie (toujours vers le bas : jamais plus de 20 %). */
export function farmLossAmount(n: number): number {
  return Math.floor(n * DEATH.farmLoss);
}

export const CHECKPOINT = {
  /** lanterne votive (marais) : zone sûre temporaire */
  votiveDuration: 90,
  votiveRadius: 4 * TILE,
  /** soin à l'allumage d'un point de halte */
  healOnLight: 0.3,
};

export const TRAP = {
  checkEvery: 150,
  chance: 0.65,
  maxMeat: 2,
};

export const SAVE = {
  autosaveEvery: 45,
};
