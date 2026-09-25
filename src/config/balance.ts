// Tous les réglages d'équilibrage sont centralisés ici.
// Les durées sont en secondes de jeu (la simulation est en pas fixes).

export const TILE = 32;
export const WORLD_W = 160;
export const WORLD_H = 160;
export const CHUNK = 16; // taille d'un chunk de rendu (en tuiles)

export const SIM_STEP = 1 / 60; // pas fixe de simulation
export const MAX_FRAME_DELTA = 0.25; // au-delà (onglet en pause…), on ignore le surplus

export const PLAYER = {
  radius: 9,
  speed: 112, // px/s
  sprintMult: 1.55,
  maxHealth: 100,
  maxHunger: 100,
  maxStamina: 100,
  hungerDrainPerSec: 100 / (15 * 60), // 100 points en 15 minutes
  hungerWarn: 30,
  hungerCritical: 12,
  starvingDamagePerSec: 1 / 3,
  staminaRegenPerSec: 32,
  staminaRegenDelay: 0.6,
  sprintCostPerSec: 16,
  dodgeCost: 24,
  dodgeDuration: 0.22,
  dodgeSpeed: 330,
  hurtInvuln: 0.7,
  respawnInvuln: 8,
  regenFedPerSec: 0.25, // récupération lente si nourri et hors combat
  regenRestMult: 4, // près d'un feu allumé
  regenMinHunger: 45,
  regenCombatDelay: 8,
  interactRange: 46,
  buildRange: 5 * TILE,
};

export const DAY = {
  length: 660, // durée d'un cycle complet (11 min)
  duskStart: 400,
  nightStart: 460,
  dawnStart: 640,
  startTime: 30,
  firstDaySpeed: 0.8, // le premier jour dure un peu plus longtemps
};

export const HARVEST = {
  noiseRadius: 7 * TILE,
  combatNoiseRadius: 9 * TILE,
  regrow: {
    tree: 10 * 60,
    rock: 14 * 60,
    ore: 18 * 60,
    bush: 4 * 60,
    grass: 3 * 60,
    morel: 5 * 60,
  } as Record<string, number>,
  regrowMinPlayerDist: 12 * TILE,
};

export const ENEMY_CAP = 26;

export const SPAWN = {
  minDist: 17 * TILE,
  maxDist: 28 * TILE,
  despawnDist: 44 * TILE,
  safeRadiusTiles: 14, // aucune apparition autour du départ
  ambientCheckEvery: 4,
};

export const ASSAULT = {
  // nombre d'ennemis de la horde pour la nuit n (1, 2, 3…)
  count(night: number): number {
    return Math.min(3 + Math.round(night * 1.6), 15);
  },
  spawnWindow: 80, // secondes pendant lesquelles la horde arrive
  postVictoryCount: 2,
};

export const FINAL = {
  waves: [
    { rodeur: 5, affame: 2, brute: 0 },
    { rodeur: 5, affame: 4, brute: 1 },
    { rodeur: 6, affame: 4, brute: 2 },
  ],
  pauseBetween: 18,
  sanctuaryHp: 600,
};

export const TRAP = {
  checkEvery: 150,
  chance: 0.65,
  maxMeat: 2,
};

export const DEATH = {
  dropFraction: 0.5,
  respawnHealth: 70,
  respawnMinHunger: 40,
};

export const SAVE = {
  autosaveEvery: 60,
};
