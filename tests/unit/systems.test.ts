import { describe, expect, it } from 'vitest';
import { TILE, DAY, PLAYER } from '../../src/config/balance';
import { addItem, countItem, makeSlots, quickTransfer, removeItem, spaceFor, totalItems } from '../../src/sim/inventory';
import { canPlace, craft, demolish, place, useSlot, canSleep, sleep, takeAll, putInContainer } from '../../src/sim/actions';
import { findPath } from '../../src/sim/pathfinding';
import { spawnEnemy } from '../../src/sim/enemies';
import { freshGame, idle, run, teleport } from './helpers';
import { RECIPE_BY_ID } from '../../src/data/recipes';

describe('inventaire', () => {
  it('piles, limites et inventaire plein sans perte', () => {
    const s = makeSlots(3);
    expect(addItem(s, 'wood', 170)).toBe(20); // 3 × 50
    expect(countItem(s, 'wood')).toBe(150);
    expect(spaceFor(s, 'wood')).toBe(0);
    expect(removeItem(s, 'wood', 151)).toBe(false);
    expect(countItem(s, 'wood')).toBe(150);
    expect(removeItem(s, 'wood', 60)).toBe(true);
    expect(countItem(s, 'wood')).toBe(90);
  });

  it('transfert rapide sans duplication', () => {
    const a = makeSlots(4);
    const b = makeSlots(1);
    addItem(a, 'stone', 30);
    addItem(b, 'stone', 40);
    const moved = quickTransfer(a, 0, b);
    expect(moved).toBe(10);
    expect(countItem(a, 'stone') + countItem(b, 'stone')).toBe(70);
  });

  it('surplus récolté déposé au sol, jamais supprimé', () => {
    const g = freshGame();
    for (let i = 0; i < 24; i++) g.player.inv[i] = { id: 'stone', qty: 50 };
    g.give('wood', 7);
    const inBags = [...g.world.bags.values()].reduce((n, b) => n + countItem(b.items, 'wood'), 0);
    expect(inBags).toBe(7);
  });
});

describe('fabrication', () => {
  it('consomme exactement les ingrédients et produit le résultat', () => {
    const g = freshGame();
    addItem(g.player.inv, 'wood', 5);
    addItem(g.player.inv, 'stone', 4);
    addItem(g.player.inv, 'fiber', 2);
    expect(craft(g, 'r_stone_axe').ok).toBe(true);
    expect(countItem(g.player.inv, 'wood')).toBe(2);
    expect(countItem(g.player.inv, 'stone')).toBe(1);
    expect(countItem(g.player.inv, 'fiber')).toBe(0);
    expect(g.player.equip.tool?.id).toBe('stone_axe'); // équipée automatiquement
  });

  it('refuse sans ressources ou sans station, sans rien consommer', () => {
    const g = freshGame();
    addItem(g.player.inv, 'wood', 2);
    expect(craft(g, 'r_stone_axe').ok).toBe(false);
    expect(countItem(g.player.inv, 'wood')).toBe(2);
    addItem(g.player.inv, 'wood', 10);
    const r = craft(g, 'r_planks');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Établi');
    expect(countItem(g.player.inv, 'wood')).toBe(12);
  });

  it('atomique quand l’inventaire est plein', () => {
    const g = freshGame();
    for (let i = 0; i < 24; i++) g.player.inv[i] = { id: 'berries', qty: 20 };
    g.player.inv[0] = { id: 'wood', qty: 3 };
    g.player.inv[1] = { id: 'stone', qty: 3 };
    g.player.inv[2] = { id: 'fiber', qty: 3 };
    // les ingrédients libèrent 2 emplacements : ça passe
    expect(craft(g, 'r_stone_axe').ok).toBe(true);
    // cas où rien ne se libère
    for (let i = 0; i < 24; i++) g.player.inv[i] = { id: 'berries', qty: 20 };
    g.player.inv[0] = { id: 'fiber', qty: 50 };
    const before = totalItems(g.player.inv);
    const r = craft(g, 'r_rope');
    expect(r.ok).toBe(false);
    expect(totalItems(g.player.inv)).toBe(before);
  });

  it('au moins vingt recettes', () => {
    expect(Object.keys(RECIPE_BY_ID).length).toBeGreaterThanOrEqual(20);
  });
});

describe('récolte', () => {
  it('à la main puis épuisement, avec retour de ressources', () => {
    const g = freshGame();
    const tree = g.world.objects.find((o) => o.type === 'tree' && !o.removed && Math.hypot(o.fx - g.world.start.x, o.fy - g.world.start.y) < 14)!;
    for (let i = 0; i < 6; i++) g.harvest(tree);
    expect(tree.depleted).toBe(true);
    expect(countItem(g.player.inv, 'wood')).toBeGreaterThanOrEqual(4);
    expect(g.stats.collected.wood).toBeGreaterThanOrEqual(4);
    // repousse contrôlée : seulement après le délai et loin du joueur
    g.clock = tree.regrowAt! + 1;
    g.player.x = 10 * TILE;
    g.player.y = 150 * TILE;
    run(g, 5.1);
    expect(tree.depleted).toBe(false);
  });

  it('un outil adapté accélère la récolte', () => {
    const g = freshGame();
    const trees = g.world.objects.filter((o) => o.type === 'tree' && !o.removed);
    addItem(g.player.inv, 'stone_axe', 1);
    let hits = 0;
    while (!trees[0].depleted && hits < 20) {
      g.harvest(trees[0]);
      hits++;
    }
    expect(hits).toBe(3);
  });

  it('le minerai de fer exige une masse ou une pioche', () => {
    const g = freshGame();
    const ore = g.world.objects.find((o) => o.type === 'ore_iron')!;
    g.harvest(ore);
    expect(ore.hp).toBe(ore.maxHp);
    addItem(g.player.inv, 'stone_hammer', 1);
    for (let i = 0; i < 3; i++) g.harvest(ore);
    expect(countItem(g.player.inv, 'iron_ore')).toBe(2);
  });
});

describe('survie', () => {
  it('faim, repas et soins', () => {
    const g = freshGame();
    const h0 = g.player.hunger;
    run(g, 60);
    expect(g.player.hunger).toBeLessThan(h0);
    expect(g.player.hunger).toBeCloseTo(h0 - PLAYER.hungerDrainPerSec * 60, 0);
    g.player.hunger = 20;
    g.player.inv[0] = { id: 'stew', qty: 1 };
    g.player.hp = 50;
    expect(useSlot(g, 0).ok).toBe(true);
    expect(g.player.hunger).toBe(75);
    expect(g.player.hp).toBeGreaterThanOrEqual(65);
    expect(g.stats.ate).toBe(1);
  });

  it('la faim à zéro blesse progressivement', () => {
    const g = freshGame();
    g.player.hunger = 0;
    g.player.hp = 50;
    run(g, 30);
    expect(g.player.hp).toBeLessThan(45);
    expect(g.player.dead).toBe(false);
  });

  it('endurance : esquive coûteuse, récupération hors effort', () => {
    const g = freshGame();
    const inp = idle();
    inp.dodge = true;
    g.step(1 / 60, inp);
    expect(g.player.stamina).toBeLessThan(PLAYER.maxStamina);
    run(g, 3);
    expect(g.player.stamina).toBe(PLAYER.maxStamina);
  });
});

describe('construction', () => {
  it('coûts, placement, collisions et démolition avec remboursement', () => {
    const g = freshGame();
    addItem(g.player.inv, 'wood', 20);
    addItem(g.player.inv, 'stone', 10);
    const px = Math.floor(g.player.x / TILE);
    const py = Math.floor(g.player.y / TILE);
    // sur le joueur : refusé
    expect(canPlace(g, 'palisade', px, py).ok).toBe(false);
    // zone protégée du départ : refusé
    expect(canPlace(g, 'palisade', px + 1, py).reason).toBe('Zone protégée');
    teleport(g, px + 6, py + 4);
    const tx = Math.floor(g.player.x / TILE) + 2;
    const ty = Math.floor(g.player.y / TILE);
    let spot: [number, number] | null = null;
    for (let dy = -2; dy <= 2 && !spot; dy++) for (let dx = -2; dx <= 3 && !spot; dx++) if (canPlace(g, 'campfire', tx + dx, ty + dy).ok) spot = [tx + dx, ty + dy];
    expect(spot).not.toBeNull();
    expect(place(g, 'campfire', spot![0], spot![1]).ok).toBe(true);
    expect(countItem(g.player.inv, 'wood')).toBe(15);
    expect(countItem(g.player.inv, 'stone')).toBe(7);
    expect(g.world.passableForPlayer(spot![0], spot![1])).toBe(false);
    const b = [...g.world.buildings.values()][0];
    expect(demolish(g, b.id).ok).toBe(true);
    expect(countItem(g.player.inv, 'wood')).toBe(17); // 50 % de 5
    expect(g.world.passableForPlayer(spot![0], spot![1])).toBe(true);
  });

  it('un coffre détruit libère son contenu dans un sac', () => {
    const g = freshGame();
    const b = g.world.addBuilding('chest', 70, 120);
    addItem(b.items!, 'iron', 5);
    addItem(b.items!, 'cloth', 3);
    g.damageBuilding(b, 1000);
    expect(g.world.buildings.has(b.id)).toBe(false);
    const bags = [...g.world.bags.values()];
    expect(bags.length).toBe(1);
    expect(countItem(bags[0].items, 'iron')).toBe(5);
    expect(countItem(bags[0].items, 'cloth')).toBe(3);
  });

  it('transferts vers un coffre sans duplication', () => {
    const g = freshGame();
    const b = g.world.addBuilding('chest', 70, 120);
    g.player.inv[0] = { id: 'wood', qty: 30 };
    g.openContainer = { kind: 'building', id: b.id };
    putInContainer(g, 0);
    expect(countItem(g.player.inv, 'wood')).toBe(0);
    expect(countItem(b.items!, 'wood')).toBe(30);
    takeAll(g);
    expect(countItem(g.player.inv, 'wood')).toBe(30);
    expect(countItem(b.items!, 'wood')).toBe(0);
  });
});

describe('pathfinding', () => {
  it('contourne un mur puis l’attaque quand le passage est fermé', () => {
    const g = freshGame();
    const w = g.world;
    // zone dégagée de test
    const cx = 20;
    const cy = 150;
    for (let y = cy - 6; y <= cy + 6; y++)
      for (let x = cx - 8; x <= cx + 8; x++) {
        const o = w.objectAtTile(x, y);
        if (o) {
          o.removed = true;
          w.unstampObject(o);
        }
      }
    const free = findPath(w, cx - 5, cy, cx + 5, cy, { breakCost: 14 });
    expect(free.complete).toBe(true);
    expect(free.blockerId).toBe(-1);
    const straight = free.path.length;
    // mur vertical partiel : contournement
    for (let y = cy - 2; y <= cy + 2; y++) w.addBuilding('palisade', cx, y);
    const around = findPath(w, cx - 5, cy, cx + 5, cy, { breakCost: 14 });
    expect(around.complete).toBe(true);
    expect(around.blockerId).toBe(-1);
    expect(around.path.length).toBeGreaterThanOrEqual(straight);
    expect(around.path.some((p) => p.x === cx && Math.abs(p.y - cy) <= 2)).toBe(false);
    // enclos complet autour de la cible : il faut casser
    const ex = cx + 5;
    for (let y = cy - 2; y <= cy + 2; y++)
      for (let x = ex - 2; x <= ex + 2; x++)
        if ((Math.abs(x - ex) === 2 || Math.abs(y - cy) === 2) && !w.buildingAtTile(x, y)) w.addBuilding('palisade', x, y);
    const blocked = findPath(w, cx - 5, cy, ex, cy, { breakCost: 14, budget: 6000 });
    expect(blocked.blockerId).toBeGreaterThan(0);
    expect(findPath(w, cx - 5, cy, ex, cy, { breakCost: Infinity, budget: 6000 }).complete).toBe(false);
    // retrait d'un pan : de nouveau libre
    w.removeBuilding(w.buildingAtTile(ex - 2, cy)!.id);
    const reopened = findPath(w, cx - 5, cy, ex, cy, { breakCost: 14 });
    expect(reopened.blockerId).toBe(-1);
    expect(reopened.complete).toBe(true);
  });

  it('les zombies ne traversent pas une porte fermée, le joueur si', () => {
    const g = freshGame();
    teleport(g, 60, 130);
    const tx = Math.floor(g.player.x / TILE);
    const ty = Math.floor(g.player.y / TILE);
    g.world.addBuilding('door', tx, ty);
    expect(g.world.passableForPlayer(tx, ty)).toBe(true);
    expect(g.world.passableForEnemy(tx, ty)).toBe(false);
  });
});

describe('combat et mort', () => {
  it('attaque annoncée, invulnérabilité courte, pas de dégâts multiples', () => {
    const g = freshGame();
    teleport(g, 60, 128);
    g.player.hp = 100;
    const e = spawnEnemy(g, 'rodeur', g.player.x + 20, g.player.y, 'ambient');
    e.state = 'chase';
    run(g, 0.3);
    expect(e.windup).toBeGreaterThan(0); // annonce
    expect(g.player.hp).toBe(100);
    run(g, 0.4);
    const after = g.player.hp;
    expect(after).toBeLessThan(100);
    expect(100 - after).toBeLessThanOrEqual(10);
  });

  it('mort : sac récupérable, fragments conservés, réapparition protégée', () => {
    const g = freshGame();
    g.player.inv[0] = { id: 'wood', qty: 20 };
    g.player.inv[1] = { id: 'frag_1', qty: 1 };
    g.fragmentsTaken.push('frag_1');
    teleport(g, 60, 128);
    g.killPlayer('test');
    expect(g.player.dead).toBe(true);
    expect(countItem(g.player.inv, 'frag_1')).toBe(1);
    const bag = g.world.bags.get(g.deathBagId)!;
    expect(countItem(bag.items, 'wood') + countItem(g.player.inv, 'wood')).toBe(20);
    g.respawn();
    expect(g.player.dead).toBe(false);
    expect(g.player.invuln).toBeGreaterThan(5);
    expect(g.fragmentsFound()).toBe(1);
    // récupération du sac
    g.player.x = bag.x;
    g.player.y = bag.y;
    g.step(1 / 60, idle());
    expect(g.target?.kind).toBe('pickup');
    g.target!.run(g);
    expect(countItem(g.player.inv, 'wood')).toBe(20);
  });

  it('la réapparition se fait au lit s’il existe', () => {
    const g = freshGame();
    g.world.addBuilding('bed', 70, 125);
    g.killPlayer('test');
    g.respawn();
    expect(Math.hypot(g.player.x / TILE - 71, g.player.y / TILE - 126)).toBeLessThan(4);
  });
});

describe('nuit et repos', () => {
  it('impossible de dormir avant d’avoir repoussé la horde', () => {
    const g = freshGame();
    g.dayTime = DAY.nightStart + 5;
    g.lastPhase = 'night';
    g.assault = { night: g.day, total: 3, spawned: 0, timer: 5, announced: true, done: false };
    expect(canSleep(g).ok).toBe(false);
    g.assault.done = true;
    expect(canSleep(g).ok).toBe(true);
    expect(sleep(g).ok).toBe(true);
    run(g, 0.1);
    expect(g.phase()).toBe('dawn');
    expect(g.stats.nightsSurvived).toBe(1);
  });

  it('une horde apparaît la nuit, hors de vue et hors de la zone de départ', () => {
    const g = freshGame();
    g.clock = 400;
    g.dayTime = DAY.nightStart - 0.5;
    const seen = new Set<number>();
    let spawned = 0;
    for (let t = 0; t < 40; t += 1 / 60) {
      g.step(1 / 60, idle());
      for (const e of g.enemies) {
        if (e.kind !== 'assault' || seen.has(e.id)) continue;
        seen.add(e.id);
        spawned++;
        expect(Math.hypot(e.x - g.player.x, e.y - g.player.y)).toBeGreaterThan(14 * TILE);
        expect(Math.hypot(e.x / TILE - g.world.start.x, e.y / TILE - g.world.start.y)).toBeGreaterThan(13);
      }
    }
    expect(spawned).toBeGreaterThan(0);
  });
});
