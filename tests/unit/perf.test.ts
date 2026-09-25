// Mesure du coût de la simulation (hors rendu) avec le plafond d'ennemis actifs.
import { describe, expect, it } from 'vitest';
import { ENEMY_CAP, TILE } from '../../src/config/balance';
import { spawnEnemy } from '../../src/sim/enemies';
import { freshGame, idle, teleport } from './helpers';

describe('performance de la simulation', () => {
  it(`pas de simulation < 2 ms avec ${ENEMY_CAP} ennemis en poursuite`, () => {
    const g = freshGame(3);
    teleport(g, 60, 110);
    g.player.invuln = 1e9;
    for (let i = 0; i < ENEMY_CAP; i++) {
      const a = (i / ENEMY_CAP) * Math.PI * 2;
      const e = spawnEnemy(g, i % 5 === 0 ? 'brute' : i % 2 ? 'affame' : 'rodeur', g.player.x + Math.cos(a) * 12 * TILE, g.player.y + Math.sin(a) * 12 * TILE, 'assault');
      e.state = 'chase';
    }
    const steps = 60 * 30;
    const t0 = performance.now();
    for (let i = 0; i < steps; i++) {
      g.player.invuln = 1e9;
      g.step(1 / 60, idle());
    }
    const ms = (performance.now() - t0) / steps;
    console.log(`coût moyen d'un pas : ${ms.toFixed(3)} ms`);
    expect(ms).toBeLessThan(2);
  });
});
