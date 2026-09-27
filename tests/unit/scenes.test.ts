// Scènes d'exploration (nouvelles parties uniquement) : présentes, accessibles, lisibles.
import { describe, expect, it } from 'vitest';
import { createWorld, generateWorld, reachability } from '../../src/world/generate';
import { LOOT } from '../../src/data/loot';
import { NOTE_BY_ID } from '../../src/data/notes';
import { Game } from '../../src/sim/game';
import { TILE } from '../../src/config/balance';
import { idle } from './helpers';

describe('scènes d’exploration', () => {
  it('les quatre scènes sont placées, validées et accessibles dans les nouvelles parties', () => {
    for (const seed of [1, 42, 777, 2024, 99999]) {
      const { world, report } = createWorld(seed, 2);
      expect(report.ok, `graine ${seed}`).toBe(true);
      const scenes = world.landmarks.filter((l) => l.scene).map((l) => l.id).sort();
      expect(scenes, `graine ${seed}`).toEqual(['sc_barricade', 'sc_bivouac', 'sc_hunters', 'sc_tomb']);
      const seen = reachability(world);
      for (const o of world.objects.filter((x) => x.type === 'container' && ['bivouac', 'barricade', 'tomb', 'hunters', 'pouch'].includes(x.loot ?? ''))) {
        let ok = false;
        for (let y = o.fy - 1; y <= o.fy + o.fh && !ok; y++) for (let x = o.fx - 1; x <= o.fx + o.fw && !ok; x++) if (world.inBounds(x, y) && seen[world.idx(x, y)]) ok = true;
        expect(ok, `${o.label} (graine ${seed})`).toBe(true);
      }
    }
  });

  it('chaque scène a un indice narratif et un butin contextualisé ; rien d’indispensable n’y dépend du hasard', () => {
    const { world } = createWorld(42, 2);
    for (const id of ['n_bivouac', 'n_barricade', 'n_tomb', 'n_hunters']) {
      expect(NOTE_BY_ID[id]).toBeDefined();
      expect(world.objects.some((o) => o.noteId === id)).toBe(true);
    }
    const essentials = ['frag_1', 'frag_2', 'frag_3', 'iron_ore', 'coal'];
    for (const t of ['bivouac', 'barricade', 'tomb', 'hunters', 'pouch']) for (const e of LOOT[t].entries) expect(essentials).not.toContain(e.id);
  });

  it('danger lisible : la barricade et la tombe sont gardées, le bivouac non', () => {
    const { world } = createWorld(42, 2);
    const by = Object.fromEntries(world.landmarks.filter((l) => l.scene).map((l) => [l.id, l.guards?.length ?? 0]));
    expect(by.sc_bivouac).toBe(0);
    expect(by.sc_barricade).toBeGreaterThan(0);
    expect(by.sc_tomb).toBeGreaterThan(0);
    // les gardiens apparaissent à l'approche, une seule fois
    const g = Game.newGame(42);
    const lm = g.world.landmarks.find((l) => l.id === 'sc_barricade')!;
    g.clock = 0;
    g.player.x = (lm.x + 0.5) * TILE;
    g.player.y = (lm.y + 18.5) * TILE;
    g.step(1 / 60, idle());
    expect(g.enemies.filter((e) => e.kind === 'guardian').length).toBe(lm.guards!.length);
    g.step(1 / 60, idle());
    expect(g.enemies.filter((e) => e.kind === 'guardian').length).toBe(lm.guards!.length);
  });

  it('les anciens mondes (générateur v1) ne reçoivent aucune scène', () => {
    const { world } = generateWorld(42, 1);
    expect(world.landmarks.some((l) => l.scene)).toBe(false);
  });
});
