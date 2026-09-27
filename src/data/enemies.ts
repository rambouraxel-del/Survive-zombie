export type EnemyType = 'rodeur' | 'affame' | 'brute';

export interface EnemyDef {
  type: EnemyType;
  name: string;
  hp: number;
  speed: number; // px/s en poursuite
  wanderSpeed: number;
  damage: number;
  buildingDamage: number;
  attackRange: number;
  windup: number; // durée de l'annonce avant le coup
  recover: number;
  sight: number; // px (de jour)
  hearing: number;
  radius: number;
  animSpeed: number;
  knockbackResist: number; // 0..1
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  rodeur: { type: 'rodeur', name: 'Rôdeur', hp: 30, speed: 44, wanderSpeed: 22, damage: 10, buildingDamage: 8, attackRange: 30, windup: 0.55, recover: 0.8, sight: 6 * 32, hearing: 1, radius: 10, animSpeed: 7, knockbackResist: 0.35 },
  affame: { type: 'affame', name: 'Affamé', hp: 18, speed: 96, wanderSpeed: 36, damage: 7, buildingDamage: 5, attackRange: 28, windup: 0.38, recover: 0.6, sight: 8 * 32, hearing: 1.3, radius: 9, animSpeed: 13, knockbackResist: 0 },
  brute: { type: 'brute', name: 'Brute', hp: 115, speed: 34, wanderSpeed: 18, damage: 20, buildingDamage: 30, attackRange: 34, windup: 0.9, recover: 1.1, sight: 6 * 32, hearing: 0.8, radius: 13, animSpeed: 6, knockbackResist: 0.75 },
};
