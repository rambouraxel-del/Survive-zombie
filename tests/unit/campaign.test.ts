// Chaîne de progression complète avec les seules actions normales du jeu
// (récolter des objets du monde, fabriquer, construire, fondre, prendre les fragments).
// Les déplacements sont abrégés (téléportation), l'accessibilité étant vérifiée par la génération.
import { describe, expect, it } from 'vitest';
import { TILE } from '../../src/config/balance';
import { craft, place, takeAll } from '../../src/sim/actions';
import { Game } from '../../src/sim/game';
import { countItem } from '../../src/sim/inventory';
import { restoreSanctuary, takeFragment } from '../../src/sim/interact';
import type { WObj } from '../../src/world/world';
import { reachability } from '../../src/world/generate';

function standNear(g: Game, o: WObj): void {
  const w = g.world;
  for (let r = 1; r < 4; r++)
    for (let dy = -r; dy <= r + o.fh; dy++)
      for (let dx = -r; dx <= r + o.fw; dx++) {
        const x = o.fx + dx;
        const y = o.fy + dy;
        if (w.passableForPlayer(x, y) && !w.objectAtTile(x, y)) {
          g.player.x = (x + 0.5) * TILE;
          g.player.y = (y + 0.5) * TILE;
          return;
        }
      }
}

function gather(g: Game, type: string, want: string, qty: number): void {
  const seen = reachability(g.world);
  for (const o of g.world.objects) {
    if (countItem(g.player.inv, want) >= qty) return;
    if (o.type !== type || o.removed || o.depleted) continue;
    if (!seen[g.world.idx(o.fx, o.fy + o.fh)] && !seen[g.world.idx(o.fx, o.fy - 1)]) continue;
    standNear(g, o);
    for (let i = 0; i < 12 && !o.depleted; i++) g.harvest(o);
  }
  expect(countItem(g.player.inv, want), `${want}`).toBeGreaterThanOrEqual(qty);
}

function build(g: Game, type: string): void {
  const px = Math.floor(g.player.x / TILE);
  const py = Math.floor(g.player.y / TILE);
  for (let r = 1; r < 6; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (place(g, type, px + dx, py + dy).ok) return;
  throw new Error(`placement impossible : ${type}`);
}

function nextTo(g: Game, type: string): void {
  const b = [...g.world.buildings.values()].find((x) => x.type === type)!;
  const c = g.world.buildingCenter(b);
  g.player.x = c.x;
  g.player.y = c.y + TILE * 1.2;
}

describe('campagne', () => {
  it.each([101, 202])('graine %i : la progression normale mène au sanctuaire', (seed) => {
    const g = Game.newGame(seed);
    // 0. le coffre du camp abandonné (tissu, corde, pain)
    const chest = g.world.objects.find((o) => o.guaranteed === 'start_chest')!;
    standNear(g, chest);
    g.openWorldContainer(chest);
    g.openContainer = { kind: 'obj', id: chest.id };
    takeAll(g);
    expect(countItem(g.player.inv, 'cloth')).toBeGreaterThanOrEqual(1);
    // 1. ressources de base à la main
    gather(g, 'tree', 'wood', 12);
    gather(g, 'rock', 'stone', 10);
    gather(g, 'grass', 'fiber', 8);
    // 2. outils
    expect(craft(g, 'r_stone_axe').ok).toBe(true);
    expect(craft(g, 'r_stone_hammer').ok).toBe(true);
    // 3. camp : feu, établi, coffre
    gather(g, 'tree', 'wood', 40);
    gather(g, 'rock', 'stone', 30);
    const camp = { x: g.world.start.x + 6, y: g.world.start.y + 6 };
    g.player.x = (camp.x + 0.5) * TILE;
    g.player.y = (camp.y + 0.5) * TILE;
    build(g, 'campfire');
    build(g, 'workbench');
    nextTo(g, 'workbench');
    expect(craft(g, 'r_planks').ok).toBe(true);
    expect(craft(g, 'r_planks').ok).toBe(true);
    build(g, 'chest');
    // 4. charbon de bois et forge
    nextTo(g, 'campfire');
    for (let i = 0; i < 4; i++) expect(craft(g, 'r_charcoal').ok).toBe(true);
    gather(g, 'rock', 'stone', 20);
    gather(g, 'tree', 'wood', 20);
    g.player.x = (camp.x - 4 + 0.5) * TILE;
    g.player.y = (camp.y + 0.5) * TILE;
    build(g, 'forge');
    // 5. minerai de fer (avec la masse) et lingots
    gather(g, 'ore_iron', 'iron_ore', 6);
    gather(g, 'tree', 'wood', 12);
    nextTo(g, 'campfire');
    for (let i = 0; i < 3; i++) expect(craft(g, 'r_charcoal').ok).toBe(true);
    nextTo(g, 'forge');
    for (let i = 0; i < 3; i++) expect(craft(g, 'r_ingot').ok).toBe(true);
    nextTo(g, 'workbench');
    expect(craft(g, 'r_planks').ok).toBe(true);
    nextTo(g, 'forge');
    expect(craft(g, 'r_sword').ok).toBe(true);
    expect(g.player.equip.weapon?.id).toBe('sword');
    // 6. fragments et sanctuaire
    for (const o of g.world.objects.filter((x) => x.type === 'altar' && x.frag)) {
      standNear(g, o);
      takeFragment(g, o);
    }
    expect(g.fragmentsFound()).toBe(3);
    restoreSanctuary(g);
    expect(g.final.state).toBe('ready');
  });
});
