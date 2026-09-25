import { describe, expect, it } from 'vitest';
import { createWorld, POI, reachability } from '../../src/world/generate';

const SEEDS = [1, 2, 3, 42, 1337, 9001, 123456, 777777, 20260925, 4242424242];

describe('génération du monde', () => {
  it.each(SEEDS)('graine %i : monde terminable et objectifs atteignables', (seed) => {
    const { world, report } = createWorld(seed);
    expect(report.unreachable).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.ironReachable).toBeGreaterThanOrEqual(8);
    expect(report.coalReachable).toBeGreaterThanOrEqual(4);
    // trois fragments et le sanctuaire existent
    const frags = world.objects.filter((o) => o.type === 'altar' && o.frag).map((o) => o.frag).sort();
    expect(frags).toEqual(['frag_1', 'frag_2', 'frag_3']);
    expect(world.objects[world.sanctuaryId].type).toBe('sanctuary');
    // départ dégagé
    expect(world.passableForPlayer(world.start.x, world.start.y)).toBe(true);
  });

  it('ressources essentielles près du départ', () => {
    const { world } = createWorld(5);
    const near = (type: string, r: number) =>
      world.objects.filter((o) => !o.removed && o.type === type && Math.hypot(o.fx - POI.start.x, o.fy - POI.start.y) <= r).length;
    expect(near('tree', 13)).toBeGreaterThanOrEqual(6);
    expect(near('rock', 12)).toBeGreaterThanOrEqual(4);
    expect(near('grass', 12)).toBeGreaterThanOrEqual(6);
    expect(near('bush', 12)).toBeGreaterThanOrEqual(4);
  });

  it('points d’intérêt espacés et atteignables depuis le départ', () => {
    const { world } = createWorld(99);
    const seen = reachability(world);
    const pts = [POI.hamlet, POI.cemetery, POI.stones, POI.sanctuary];
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThan(30);
    // la place du sanctuaire est accessible
    let ok = false;
    for (let dy = -3; dy <= 4; dy++) for (let dx = -3; dx <= 4; dx++) if (seen[world.idx(POI.sanctuary.x + dx, POI.sanctuary.y + dy)]) ok = true;
    expect(ok).toBe(true);
  });

  it('génération déterministe', () => {
    const a = createWorld(31337).world;
    const b = createWorld(31337).world;
    expect(a.objects.length).toBe(b.objects.length);
    expect(a.objects.map((o) => `${o.type}${o.fx},${o.fy}${o.removed}`).join('|')).toBe(b.objects.map((o) => `${o.type}${o.fx},${o.fy}${o.removed}`).join('|'));
  });
});
