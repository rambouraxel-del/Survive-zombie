import { describe, expect, it } from 'vitest';
import { freshGame, run, idle } from './helpers';
import { chooseStarter } from '../../src/sim/actions';
import { startExpedition, returnToCamp } from '../../src/sim/travel';
import { MAPS } from '../../src/maps';
import { buildWorld } from '../../src/world/mapbuild';

describe('fumée V2', () => {
  it('toutes les cartes se construisent', () => {
    for (const d of Object.values(MAPS)) {
      const r = buildWorld(d, 'main', 1);
      expect(r.world.w).toBeGreaterThan(5);
      const r2 = buildWorld(d, 'dungeon', 1);
      expect(r2.world.h).toBe(r.world.h);
    }
  });
  it('nouvelle partie, arme, sortie, combat, retour', () => {
    const g = freshGame();
    expect(g.mapId).toBe('camp');
    expect(chooseStarter(g, 'sword_1').ok).toBe(true);
    expect(startExpedition(g, 'bois').ok).toBe(true);
    expect(g.mapId).toBe('bois');
    expect(g.enemies.length).toBeGreaterThan(3);
    const inp = idle();
    inp.attack = true;
    run(g, 5, inp);
    expect(returnToCamp(g).ok).toBe(true);
    expect(g.mapId).toBe('camp');
  });
});
