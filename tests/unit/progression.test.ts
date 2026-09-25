import { describe, expect, it } from 'vitest';
import { TILE } from '../../src/config/balance';
import { craft, place, useSlot } from '../../src/sim/actions';
import { addItem, countItem } from '../../src/sim/inventory';
import { restoreSanctuary, startFinalAssault, takeFragment } from '../../src/sim/interact';
import { currentObjective } from '../../src/sim/objectives';
import { deserialize, serialize, validateSave } from '../../src/save/serialize';
import { freshGame, idle, run, teleport } from './helpers';

describe('sauvegarde', () => {
  it('aller-retour fidèle (monde, joueur, coffres, constructions, sacs)', () => {
    const g = freshGame(777);
    addItem(g.player.inv, 'wood', 13);
    g.player.equip.tool = { id: 'stone_axe', qty: 1, dur: 40 };
    g.player.hunger = 42.5;
    g.dayTime = 300;
    g.day = 3;
    const chest = g.world.objects.find((o) => o.guaranteed === 'start_chest')!;
    g.openWorldContainer(chest);
    const tree = g.world.objects.find((o) => o.type === 'tree' && !o.removed)!;
    for (let i = 0; i < 6; i++) g.harvest(tree);
    const b = g.world.addBuilding('chest', 60, 120);
    addItem(b.items!, 'iron', 4);
    g.world.addBag(1000, 1000, [{ id: 'cloth', qty: 2 }, null], 'death');
    g.completed.add('o_gather');
    const data = JSON.parse(JSON.stringify(serialize(g)));
    const v = validateSave(data);
    expect(v.ok).toBe(true);
    const h = deserialize(data);
    expect(countItem(h.player.inv, 'wood')).toBe(countItem(g.player.inv, 'wood'));
    expect(h.player.equip.tool).toEqual(g.player.equip.tool);
    expect(h.player.hunger).toBeCloseTo(42.5);
    expect(h.day).toBe(3);
    expect(h.dayTime).toBe(300);
    expect(h.world.objects[tree.id].depleted).toBe(true);
    expect(h.world.objects[chest.id].items).toEqual(chest.items);
    const hb = [...h.world.buildings.values()][0];
    expect(countItem(hb.items!, 'iron')).toBe(4);
    expect(h.world.passableForEnemy(60, 120)).toBe(false);
    expect([...h.world.bags.values()][0].items[0]).toEqual({ id: 'cloth', qty: 2 });
    expect(h.completed.has('o_gather')).toBe(true);
  });

  it('pas de nouveau tirage de butin après rechargement', () => {
    const g = freshGame(8);
    const c = g.world.objects.find((o) => o.loot === 'cart')!;
    const items = JSON.stringify(g.openWorldContainer(c));
    // on vide le conteneur puis on recharge : il reste vide
    for (let i = 0; i < c.items!.length; i++) c.items![i] = null;
    const h = deserialize(JSON.parse(JSON.stringify(serialize(g))));
    expect(h.world.objects[c.id].items!.every((s) => !s)).toBe(true);
    // et un conteneur jamais ouvert donne le même tirage quelle que soit la partie
    const g2 = freshGame(8);
    expect(JSON.stringify(g2.openWorldContainer(g2.world.objects[c.id]))).toBe(items);
  });

  it('rejette une sauvegarde corrompue ou d’une version future', () => {
    const g = freshGame(3);
    const data = JSON.parse(JSON.stringify(serialize(g)));
    expect(validateSave({ ...data, v: 99 }).ok).toBe(false);
    expect(validateSave({ ...data, tag: 'autre' }).ok).toBe(false);
    const bad = JSON.parse(JSON.stringify(data));
    bad.player.inv[0] = { id: 'objet_inconnu', qty: 1 };
    expect(validateSave(bad).ok).toBe(false);
    expect(validateSave('n’importe quoi').ok).toBe(false);
  });
});

describe('objectifs et fin de partie', () => {
  it('les objectifs déjà accomplis sont reconnus à leur activation', () => {
    const g = freshGame();
    // on mange et on fabrique AVANT d'avoir récolté
    g.player.inv[0] = { id: 'berries', qty: 3 };
    g.player.hunger = 50;
    useSlot(g, 0);
    addItem(g.player.inv, 'wood', 4);
    addItem(g.player.inv, 'fiber', 2);
    craft(g, 'r_spear');
    expect(currentObjective(g)!.id).toBe('o_gather');
    g.stats.collected = { wood: 3, stone: 3, fiber: 2 };
    run(g, 0.6);
    // récolte, outil et nourriture validés d'un coup
    expect(g.completed.has('o_gather')).toBe(true);
    expect(g.completed.has('o_tool')).toBe(true);
    expect(g.completed.has('o_food')).toBe(true);
    expect(currentObjective(g)!.id).toBe('o_fire');
  });

  it('parcours principal : fragments, sanctuaire, assaut final, victoire puis poursuite', () => {
    const g = freshGame(2024);
    // prendre les trois fragments
    for (const o of g.world.objects.filter((x) => x.type === 'altar' && x.frag)) takeFragment(g, o);
    expect(g.fragmentsFound()).toBe(3);
    g.enemies = [];
    restoreSanctuary(g);
    expect(g.final.state).toBe('ready');
    expect(countItem(g.player.inv, 'frag_1')).toBe(0);
    expect(startFinalAssault(g)).toBe(true);
    const s = g.world.objects[g.world.sanctuaryId];
    teleport(g, s.fx + 1, s.fy + 4);
    g.player.hp = 100;
    let victory = false;
    for (let t = 0; t < 400 && !victory; t += 1 / 30) {
      g.player.invuln = 1; // le test vérifie l'enchaînement des vagues
      g.player.hunger = 80;
      g.step(1 / 30, idle());
      for (const e of g.enemies) if (e.kind === 'final' && e.dying <= 0) e.hp = 0, (e.dying = 0.05);
      victory = g.events.some((e) => e.type === 'victory');
    }
    expect(victory).toBe(true);
    expect(g.final.state).toBe('won');
    expect(g.freed).toBe(true);
    // on peut continuer à jouer après la victoire
    run(g, 5);
    expect(g.player.dead).toBe(false);
  });

  it('échec de l’assaut final à la mort : retour à l’état prêt, rien n’est perdu', () => {
    const g = freshGame(11);
    for (const o of g.world.objects.filter((x) => x.type === 'altar' && x.frag)) takeFragment(g, o);
    restoreSanctuary(g);
    startFinalAssault(g);
    run(g, 0.2);
    g.killPlayer('test');
    expect(g.final.state).toBe('ready');
    expect(g.fragmentsFound()).toBe(3);
  });

  it('boucle de jeu jouable : récolter, fabriquer, construire', () => {
    const g = freshGame(66);
    teleport(g, g.world.start.x + 6, g.world.start.y + 5);
    // récolte via la cible contextuelle
    let guard = 0;
    while ((g.stats.collected.fiber ?? 0) < 2 && guard++ < 50) {
      const grass = g.world.objects.find((o) => o.type === 'grass' && !o.depleted && !o.removed)!;
      g.player.x = (grass.fx + 0.5) * TILE;
      g.player.y = (grass.fy + 1.2) * TILE;
      g.player.aimX = 0;
      g.player.aimY = -1;
      g.step(1 / 60, idle());
      expect(g.target).not.toBeNull();
      g.harvestCd = 0;
      g.target!.run(g);
    }
    expect(g.stats.collected.fiber).toBeGreaterThanOrEqual(2);
    addItem(g.player.inv, 'wood', 30);
    addItem(g.player.inv, 'stone', 10);
    expect(craft(g, 'r_stone_axe').ok).toBe(true);
    teleport(g, 60, 120);
    const px = Math.floor(g.player.x / TILE);
    const py = Math.floor(g.player.y / TILE);
    let placed = false;
    for (let dy = -3; dy <= 3 && !placed; dy++) for (let dx = -3; dx <= 3 && !placed; dx++) if (Math.abs(dx) + Math.abs(dy) > 1 && Math.abs(dy) <= 2) placed = place(g, 'workbench', px + dx, py + dy).ok;
    expect(placed).toBe(true);
    const wb = [...g.world.buildings.values()][0];
    g.player.x = (wb.x + 1) * TILE;
    g.player.y = (wb.y + 1.7) * TILE;
    expect(craft(g, 'r_planks').ok).toBe(true);
  });
});
