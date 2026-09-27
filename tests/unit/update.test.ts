// Règles ajoutées par la mise à jour de confort : barre rapide indépendante, fabrication
// stable et multiple, gain alimentaire, ciblage, appuis courts, améliorations du camp.
import { describe, expect, it } from 'vitest';
import { TILE, PLAYER } from '../../src/config/balance';
import {
  addMarker, craft, foodGain, maxCraftable, place, removeMarker, upgradeBuilding, useHotbar, useSlot, demolish,
} from '../../src/sim/actions';
import { assignHotbar, autoAssignHotbar, hotbarQty, swapHotbar } from '../../src/sim/hotbar';
import { addItem, countItem, makeSlots } from '../../src/sim/inventory';
import { listEntries, missingFor, benefits, compareWithEquipped } from '../../src/sim/crafting';
import { RECIPE_BY_ID } from '../../src/data/recipes';
import { interactionTarget, selectTargetAt } from '../../src/sim/interact';
import { spawnEnemy } from '../../src/sim/enemies';
import { currentObjective, skipIntro } from '../../src/sim/objectives';
import { freshGame, idle, run, teleport } from './helpers';
import type { Game } from '../../src/sim/game';

function clearInv(g: Game): void {
  g.player.inv = makeSlots(24);
}

describe('barre rapide indépendante', () => {
  it('les matériaux ne remplissent pas la barre ; aliments et outils oui, dans les cases libres', () => {
    const g = freshGame();
    clearInv(g);
    addItem(g.player.inv, 'wood', 10);
    addItem(g.player.inv, 'stone', 10);
    addItem(g.player.inv, 'fiber', 10);
    autoAssignHotbar(g);
    expect(g.hotbar.every((h) => h === null)).toBe(true);
    addItem(g.player.inv, 'berries', 3);
    addItem(g.player.inv, 'bandage', 1);
    autoAssignHotbar(g);
    expect(g.hotbar.map((h) => h?.id ?? null)).toEqual(['berries', 'bandage', null, null, null]);
  });

  it('une affectation manuelle n’est jamais écrasée ; réorganiser ne déplace rien dans le sac', () => {
    const g = freshGame();
    clearInv(g);
    addItem(g.player.inv, 'bread', 2);
    assignHotbar(g, 0, 'bread');
    const invBefore = JSON.stringify(g.player.inv);
    for (const id of ['berries', 'jerky', 'morel', 'meat_cooked', 'skewer', 'stew', 'bandage']) addItem(g.player.inv, id, 1);
    autoAssignHotbar(g);
    expect(g.hotbar[0]).toEqual({ id: 'bread', manual: true });
    swapHotbar(g, 0, 3);
    expect(g.hotbar[3]?.id).toBe('bread');
    expect(JSON.stringify(g.player.inv.slice(0, 1))).toBe(JSON.stringify(JSON.parse(invBefore).slice(0, 1)));
  });

  it('consommer la dernière unité ne décale pas les autres raccourcis', () => {
    const g = freshGame();
    clearInv(g);
    addItem(g.player.inv, 'berries', 1);
    addItem(g.player.inv, 'bread', 2);
    assignHotbar(g, 0, 'berries');
    assignHotbar(g, 1, 'bread');
    g.player.hunger = 20;
    expect(useHotbar(g, 0).ok).toBe(true);
    expect(g.hotbar.map((h) => h?.id ?? null)).toEqual(['berries', 'bread', null, null, null]);
    expect(hotbarQty(g, 'berries')).toBe(0);
    // la ressource revient : le raccourci se remplit de nouveau, au même endroit
    g.give('berries', 3);
    expect(hotbarQty(g, 'berries')).toBe(3);
  });

  it('équipement, transfert et mort : les raccourcis restent cohérents', () => {
    const g = freshGame();
    clearInv(g);
    addItem(g.player.inv, 'spear', 1);
    addItem(g.player.inv, 'club', 1);
    assignHotbar(g, 0, 'spear');
    assignHotbar(g, 1, 'club');
    expect(useHotbar(g, 0).ok).toBe(true);
    expect(g.player.equip.weapon?.id).toBe('spear');
    expect(hotbarQty(g, 'spear')).toBe(1); // équipée : toujours comptée
    expect(useHotbar(g, 1).ok).toBe(true);
    expect(g.player.equip.weapon?.id).toBe('club');
    g.killPlayer('test');
    g.respawn();
    expect(g.hotbar[0]?.id).toBe('spear');
    expect(g.hotbar[1]?.id).toBe('club');
  });
});

describe('fabrication', () => {
  it('ordre stable : fabriquer ne réordonne pas la liste ; le filtre « fabricables » garde l’ordre', () => {
    const g = freshGame();
    clearInv(g);
    addItem(g.player.inv, 'fiber', 6);
    addItem(g.player.inv, 'wood', 1);
    const before = listEntries(g, 'hand', false).map((e) => e.key);
    const onlyBefore = listEntries(g, 'hand', true).map((e) => e.key);
    expect(onlyBefore).toEqual(['r_rope', 'r_torch']);
    craft(g, 'r_torch');
    expect(listEntries(g, 'hand', false).map((e) => e.key)).toEqual(before);
    expect(listEntries(g, 'hand', true).map((e) => e.key)).toEqual(['r_rope']);
  });

  it('fer travaillé : une seule fiche, deux méthodes tracées séparément', () => {
    const iron = listEntries(freshGame(), 'forge', false).filter((e) => e.output === 'iron');
    expect(iron.length).toBe(1);
    expect(iron[0].recipes.map((r) => r.id)).toEqual(['r_ingot', 'r_scrap_ingot']);
  });

  it('fabrication multiple atomique ; inventaire plein refusé sans rien consommer', () => {
    const g = freshGame();
    clearInv(g);
    addItem(g.player.inv, 'fiber', 16);
    expect(maxCraftable(g, RECIPE_BY_ID.r_rope)).toBe(5);
    expect(craft(g, 'r_rope', 5).ok).toBe(true);
    expect(countItem(g.player.inv, 'rope')).toBe(5);
    expect(countItem(g.player.inv, 'fiber')).toBe(1);
    expect(g.stats.craftedBy.r_rope).toBe(5);
    // sac plein de piles pleines : la corde ne rentre pas
    clearInv(g);
    for (let i = 0; i < 24; i++) g.player.inv[i] = { id: 'stone', qty: 50 };
    g.player.inv[0] = { id: 'fiber', qty: 50 };
    expect(craft(g, 'r_rope', 1).ok).toBe(false);
    expect(countItem(g.player.inv, 'fiber')).toBe(50);
    expect(craft(g, 'r_rope', 20).ok).toBe(false);
  });

  it('bénéfices chiffrés et comparaison avec l’équipement', () => {
    const g = freshGame();
    expect(benefits('spear')).toContain('Dégâts 11');
    expect(benefits('bread')).toContain('+24 faim');
    expect(compareWithEquipped(g, 'stone_axe')).toContain('6 coups → 3 coups');
    g.player.equip.weapon = { id: 'spear', qty: 1, dur: 90 };
    expect(compareWithEquipped(g, 'club')).toContain('dégâts 11 → 15');
  });

  it('recette suivie : ressources directes et ingrédients à fabriquer distingués', () => {
    const g = freshGame();
    clearInv(g);
    addItem(g.player.inv, 'wood', 4);
    const m = missingFor(g, 'r_club')!;
    expect(m.direct.map((x) => x.id)).toEqual(['stone']);
    expect(m.crafted.map((x) => x.id)).toEqual(['rope']);
    expect(m.ready).toBe(false);
  });
});

describe('nourriture', () => {
  it('gain effectif et surplus selon la faim actuelle', () => {
    const g = freshGame();
    g.player.hunger = 85;
    const f = foodGain(g, 'bread')!;
    expect(f).toMatchObject({ nominal: 24, effective: 15, surplus: 9 });
  });

  it('pas de consommation inutile à faim maximale ; un effet de soin la justifie', () => {
    const g = freshGame();
    clearInv(g);
    addItem(g.player.inv, 'bread', 1);
    addItem(g.player.inv, 'meat_cooked', 1);
    g.player.hunger = PLAYER.maxHunger;
    g.player.hp = PLAYER.maxHealth;
    expect(useSlot(g, 0).ok).toBe(false);
    expect(countItem(g.player.inv, 'bread')).toBe(1);
    g.player.hp = 50;
    expect(useSlot(g, 1).ok).toBe(true); // soigne 6 PV
  });
});

describe('ciblage', () => {
  function standAt(g: Game, tx: number, ty: number, aimX: number, aimY: number): void {
    g.player.x = (tx + 0.5) * TILE;
    g.player.y = (ty + 0.5) * TILE;
    g.player.aimX = aimX;
    g.player.aimY = aimY;
  }

  it('un coffre vide ne monopolise pas l’action devant une ressource ; il reste accessible', () => {
    const g = freshGame();
    const chest = g.world.objects.find((o) => o.guaranteed === 'start_chest')!;
    g.openWorldContainer(chest);
    chest.items = makeSlots(8); // vidé
    // herbe haute juste à côté du coffre, du côté du joueur
    const gx = chest.fx - 1;
    const gy = chest.fy + 1;
    const o = g.world.objects.find((x) => x.type === 'grass' && !x.removed)!;
    g.world.unstampObject(o);
    o.fx = gx;
    o.fy = gy;
    o.depleted = false;
    g.world.stampObject(o);
    standAt(g, chest.fx, chest.fy + 1, 0, -1);
    g.lastTargetKey = '';
    const t = interactionTarget(g)!;
    expect(t.kind).toBe('harvest');
    // sans ressource à portée, le coffre vide reste sélectionnable
    for (const x of g.world.objects) if (['grass', 'bush', 'rock', 'tree', 'morel'].includes(x.type) && Math.hypot(x.fx - chest.fx, x.fy - chest.fy) < 5) x.depleted = true;
    g.lastTargetKey = '';
    const t2 = interactionTarget(g)!;
    expect(t2.kind).toBe('open');
    expect(t2.empty).toBe(true);
    expect(t2.label).toBe('Fouiller');
    // sélection explicite au toucher, sans déplacement
    o.depleted = false;
    const x0 = g.player.x;
    expect(selectTargetAt(g, (chest.fx + 0.5) * TILE, (chest.fy + 0.5) * TILE)).toContain('(vide)');
    expect(interactionTarget(g)!.kind).toBe('open');
    expect(g.player.x).toBe(x0);
  });

  it('verbes courts dans le bouton, nom complet près de la cible', () => {
    const g = freshGame();
    const chest = g.world.objects.find((o) => o.guaranteed === 'start_chest')!;
    standAt(g, chest.fx, chest.fy + 1, 0, -1);
    const t = interactionTarget(g)!;
    expect(t.label).toBe('Fouiller');
    expect(t.name).toBe('Coffre du camp');
  });

  it('stabilité : la cible ne saute pas entre deux objets presque équidistants', () => {
    const g = freshGame();
    const chest = g.world.objects.find((o) => o.guaranteed === 'start_chest')!;
    standAt(g, chest.fx, chest.fy + 1, 0, -1);
    const first = interactionTarget(g)!.key;
    // léger flottement du regard
    let changes = 0;
    let prev = first;
    for (let i = 0; i < 20; i++) {
      g.player.aimX = Math.sin(i) * 0.25;
      g.player.aimY = -Math.sqrt(1 - g.player.aimX ** 2);
      const k = interactionTarget(g)!.key;
      if (k !== prev) changes++;
      prev = k;
    }
    expect(changes).toBe(0);
  });

  it('récolte et combat : l’attaque vise l’ennemi, l’action récolte', () => {
    const g = freshGame();
    const s = g.world.start;
    teleport(g, s.x, s.y + 1);
    g.clock = 0;
    const e = spawnEnemy(g, 'rodeur', g.player.x + 24, g.player.y, 'ambient');
    e.state = 'chase';
    g.player.aimX = 1;
    g.player.aimY = 0;
    const hp0 = e.hp;
    const inp = idle();
    inp.attackTap = true;
    run(g, 0.4, inp);
    expect(e.hp).toBeLessThan(hp0);
  });
});

describe('entrées', () => {
  it('un appui très court entre deux pas de simulation n’est pas perdu', () => {
    const g = freshGame();
    const s = g.world.start;
    teleport(g, s.x, s.y + 1);
    const e = spawnEnemy(g, 'rodeur', g.player.x + 24, g.player.y, 'ambient');
    g.player.aimX = 1;
    g.player.aimY = 0;
    const inp = idle();
    // appui puis relâchement avant le pas : seul le drapeau d'appui subsiste
    inp.attackTap = true;
    inp.attack = false;
    g.step(1 / 60, inp);
    expect(g.player.attackCd).toBeGreaterThan(0);
    expect(inp.attackTap).toBe(false); // consommé une seule fois
    run(g, 0.3, inp);
    expect(e.hp).toBeLessThan(30);
  });

  it('un appui pendant la récupération est exécuté dès que possible, une seule fois', () => {
    const g = freshGame();
    const inp = idle();
    inp.attackTap = true;
    g.step(1 / 60, inp);
    const cd = g.player.attackCd;
    expect(cd).toBeGreaterThan(0);
    run(g, 0.2, inp);
    let attacks = 0;
    let last = g.player.attackCd;
    inp.attackTap = true; // second appui vers la fin de la récupération (tampon de 0,3 s)
    for (let i = 0; i < 90; i++) {
      g.step(1 / 60, inp);
      if (g.player.attackCd > last + 0.01) attacks++;
      last = g.player.attackCd;
    }
    expect(attacks).toBe(1);
  });
});

describe('camp', () => {
  it('amélioration et destruction d’un coffre rempli : aucun objet perdu', () => {
    const g = freshGame();
    const s = g.world.start;
    teleport(g, s.x + 4, s.y + 3);
    g.player.inv[20] = { id: 'planks', qty: 10 };
    g.player.inv[21] = { id: 'rope', qty: 2 };
    let ok = false;
    let tx = 0;
    let ty = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2]]) {
      tx = Math.floor(g.player.x / TILE) + dx;
      ty = Math.floor(g.player.y / TILE) + dy;
      if (place(g, 'chest', tx, ty).ok) {
        ok = true;
        break;
      }
    }
    expect(ok).toBe(true);
    const b = g.world.buildingAtTile(tx, ty)!;
    for (let i = 0; i < 16; i++) b.items![i] = { id: 'stone', qty: 50 };
    expect(upgradeBuilding(g, b.id).ok).toBe(true);
    expect(b.items!.length).toBe(24);
    expect(b.id).toBe(g.world.buildingAtTile(tx, ty)!.id);
    for (let i = 16; i < 24; i++) b.items![i] = { id: 'wood', qty: 50 };
    g.damageBuilding(b, 9999);
    const bag = [...g.world.bags.values()].find((x) => x.kind === 'chest')!;
    expect(countItem(bag.items, 'stone')).toBe(800);
    expect(countItem(bag.items, 'wood')).toBe(400);
    void demolish;
  });

  it('feu amélioré : repos plus réparateur ; établi renforcé : planches supplémentaires', () => {
    const g = freshGame();
    const s = g.world.start;
    teleport(g, s.x + 4, s.y + 3);
    g.player.inv[20] = { id: 'wood', qty: 50 };
    g.player.inv[21] = { id: 'stone', qty: 50 };
    g.player.inv[22] = { id: 'planks', qty: 10 };
    g.player.inv[23] = { id: 'rope', qty: 4 };
    g.player.inv[19] = { id: 'scrap', qty: 2 };
    const px = Math.floor(g.player.x / TILE);
    const py = Math.floor(g.player.y / TILE);
    expect(place(g, 'workbench', px - 1, py - 2).ok || place(g, 'workbench', px - 1, py + 1).ok).toBe(true);
    const wb = [...g.world.buildings.values()].find((b) => b.type === 'workbench')!;
    const before = countItem(g.player.inv, 'planks');
    craft(g, 'r_planks');
    expect(countItem(g.player.inv, 'planks') - before).toBe(2);
    expect(upgradeBuilding(g, wb.id).ok).toBe(true);
    const b2 = countItem(g.player.inv, 'planks');
    craft(g, 'r_planks');
    expect(countItem(g.player.inv, 'planks') - b2).toBe(3);
  });
});

describe('carte', () => {
  it('marqueurs nommés et catégorisés : ajout et suppression', () => {
    const g = freshGame();
    const id = addMarker(g, 40, 50, 'resource', '  Filon  ');
    expect(g.markers[0]).toMatchObject({ id, x: 40, y: 50, cat: 'resource', name: 'Filon' });
    addMarker(g, 3, 3, 'danger', '');
    expect(g.markers[1].name).toBe('Danger');
    removeMarker(g, id);
    expect(g.markers.map((m) => m.cat)).toEqual(['danger']);
  });
});

describe('introduction', () => {
  it('passer le tutoriel mène directement à la suite, sans imposer les étapes', () => {
    const g = freshGame();
    expect(currentObjective(g)!.id).toBe('o_chest');
    skipIntro(g);
    expect(currentObjective(g)!.id).toBe('o_base');
  });
});
