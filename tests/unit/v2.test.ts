// Tests ciblés de la V2 : accessibilité des cartes, pertes de sortie, paliers de donjon,
// recharges, jauge d'ultime, arbalète, fabrication depuis les coffres, enchantement,
// sauvegarde et reprise, migration V1, et boucle complète.
import { describe, expect, it } from 'vitest';
import { freshGame, idle, run, teleport } from './helpers';
import { TILE } from '../../src/config/balance';
import { chooseStarter, craft, enchantItem, equipSlot } from '../../src/sim/actions';
import { damageEnemy, hitDummies, tickPlayerCombat } from '../../src/sim/combat';
import { spawnEnemy } from '../../src/sim/enemies';
import { killPlayer, respawn, returnToCamp, startExpedition, dungeonWait, lightCheckpoint } from '../../src/sim/travel';
import { loadout, setLoadout } from '../../src/sim/profile';
import { countItem } from '../../src/sim/inventory';
import { deserialize, serialize, validateSave } from '../../src/save/serialize';
import { MAPS } from '../../src/maps';
import { buildWorld } from '../../src/world/mapbuild';
import { DUNGEONS } from '../../src/data/destinations';
import type { Game } from '../../src/sim/game';
import debut from '../fixtures/v1-debut.json';
import milieu from '../fixtures/v1-milieu.json';
import fin from '../fixtures/v1-fin.json';

function killBoss(g: Game): void {
  const b = g.enemies.find((e) => e.boss);
  expect(b).toBeTruthy();
  damageEnemy(g, b!, 99999, { family: 'sword', ignoreArmor: true });
}

describe('cartes', () => {
  it('départ, sortie, haltes, coffres et boss sont atteignables (portes et raccourcis ouverts)', () => {
    for (const def of Object.values(MAPS)) {
      for (const variant of ['main', 'dungeon'] as const) {
        const { world: w, bosses } = buildWorld(def, variant, 7);
        const extra = new Set<number>();
        for (const o of w.objects) {
          if (['gate', 'barricade', 'shortcut'].includes(o.type)) for (let y = o.fy; y < o.fy + o.fh; y++) for (let x = o.fx; x < o.fx + o.fw; x++) extra.add(w.idx(x, y));
          for (const c of o.cells ?? []) extra.add(w.idx(c.x, c.y));
        }
        const open = (x: number, y: number) => w.passableForPlayer(x, y) || extra.has(w.idx(x, y));
        const seen = new Uint8Array(w.w * w.h);
        const q = [w.idx(w.start.x, w.start.y)];
        seen[q[0]] = 1;
        while (q.length) {
          const i = q.pop()!;
          const x = i % w.w;
          const y = (i - x) / w.w;
          for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
            if (!w.inBounds(nx, ny)) continue;
            const j = w.idx(nx, ny);
            if (seen[j] || !open(nx, ny)) continue;
            seen[j] = 1;
            q.push(j);
          }
        }
        const near = (x0: number, y0: number, ww = 1, hh = 1) => {
          for (let y = y0 - 1; y <= y0 + hh; y++) for (let x = x0 - 1; x <= x0 + ww; x++) if (w.inBounds(x, y) && seen[w.idx(x, y)]) return true;
          return false;
        };
        for (const o of w.objects) {
          if (!['exit', 'checkpoint', 'container', 'lever', 'door', 'travel', 'rack'].includes(o.type)) continue;
          expect(near(o.fx, o.fy, o.fw, o.fh), `${def.id}/${variant} : ${o.type} ${o.key} inaccessible`).toBe(true);
        }
        for (const b of bosses) expect(near(b.x, b.y), `${def.id}/${variant} : boss inaccessible`).toBe(true);
      }
    }
  });
});

describe('sorties et mort', () => {
  it('région de ressources : chute = 20 % de la récolte de la sortie, réserves du départ protégées', () => {
    const g = freshGame();
    chooseStarter(g, 'sword_1');
    g.give('wood', 7);
    expect(startExpedition(g, 'bois').ok).toBe(true);
    const runId = g.run!.id;
    g.give('wood', 10, { collected: true });
    g.give('stone', 4, { collected: true });
    expect(countItem(g.player.inv, 'wood')).toBe(17);
    const events: unknown[] = [];
    const origEmit = g.emit.bind(g);
    g.emit = (e) => { events.push(e); origEmit(e); };
    killPlayer(g, 'test');
    const death = events.find((e) => (e as { type: string }).type === 'death') as { summary: { lost: { id: string; n: number }[] } };
    expect(death.summary.lost).toEqual([{ id: 'wood', n: 2 }]); // 20 % de 10 ; 4 pierres → 0
    expect(countItem(g.player.inv, 'wood')).toBe(15);
    respawn(g);
    expect(g.mapId).toBe('camp');
    expect(g.run).toBeNull();
    expect(startExpedition(g, 'bois').ok).toBe(true);
    expect(g.run!.id).not.toBe(runId); // nouvelle instance
  });

  it('expédition principale : chute = retour au point de halte, rien de perdu', () => {
    const g = freshGame();
    chooseStarter(g, 'sword_1');
    g.flags.add('first_return');
    g.give('iron', 3);
    expect(startExpedition(g, 'bastion').ok).toBe(true);
    const cp = g.world.objects.find((o) => o.type === 'checkpoint')!;
    lightCheckpoint(g, cp);
    teleport(g, 5, 5);
    killPlayer(g, 'test');
    respawn(g);
    expect(g.mapId).toBe('bastion');
    expect(Math.abs(g.player.x / TILE - cp.fx)).toBeLessThan(6);
    expect(countItem(g.player.inv, 'iron')).toBe(3);
    returnToCamp(g);
    expect(g.levels.bastion.checkpoint).toBe(cp.key);
  });
});

describe('donjons à paliers', () => {
  it('victoire = palier suivant ; défaite = palier inchangé ; délai entre instances récompensées', () => {
    const g = freshGame();
    chooseStarter(g, 'sword_1');
    g.flags.add('boss_chief');
    expect(startExpedition(g, 'd_bastion', 2).ok).toBe(false);
    expect(startExpedition(g, 'd_bastion', 1).ok).toBe(true);
    const id1 = g.run!.id;
    killPlayer(g, 'test');
    respawn(g);
    expect(g.dungeon('d_bastion').unlocked).toBe(1);
    killBoss(g);
    expect(g.dungeon('d_bastion').unlocked).toBe(2);
    expect(g.world.objects.some((o) => o.key === `reward:${id1}`)).toBe(true);
    returnToCamp(g);
    expect(dungeonWait(g, 'd_bastion')).toBeGreaterThan(0);
    expect(startExpedition(g, 'd_bastion', 2).ok).toBe(false);
    run(g, DUNGEONS.d_bastion.cooldown + 1);
    expect(startExpedition(g, 'd_bastion', 2).ok).toBe(true);
    expect(g.run!.id).not.toBe(id1);
    killPlayer(g, 'test');
    respawn(g);
    returnToCamp(g);
    expect(g.dungeon('d_bastion').unlocked).toBe(2);
  });
});

describe('combat', () => {
  it('mannequin : ni maîtrise ni ultime ; vrai ennemi : les deux, plafonnés aux PV', () => {
    const g = freshGame();
    chooseStarter(g, 'sword_1');
    const dummy = [...g.world.buildings.values()].find((b) => b.type === 'dummy')!;
    const c = g.world.buildingCenter(dummy);
    hitDummies(g, c.x, c.y, 40, 50);
    expect(g.stats.dummyHits).toBe(1);
    expect(g.ult).toBe(0);
    expect(g.mastery.sword).toBe(0);
    startExpedition(g, 'bois');
    const e = spawnEnemy(g, 'rat', g.player.x + 30, g.player.y);
    const hp = e.hp;
    damageEnemy(g, e, 9999, { family: 'sword', ignoreArmor: true });
    expect(g.mastery.sword).toBe(hp);
    expect(g.ult).toBeGreaterThan(0);
    expect(g.ult).toBeLessThan(100);
  });

  it('recharges : continuent hors de la main ; choix de compétences mémorisé par famille', () => {
    const g = freshGame();
    chooseStarter(g, 'sword_1');
    g.give('dagger_1', 1);
    g.mastery.sword = 999; // maîtrise 3
    setLoadout(g, 'sword', 0, 's_parry');
    expect(loadout(g, 'sword')[0]).toBe('s_parry');
    g.cooldowns.s_sweep = 5;
    equipSlot(g, g.player.inv.findIndex((s) => s?.id === 'dagger_1'));
    run(g, 3);
    expect(g.cooldowns.s_sweep).toBeLessThan(2.1);
    equipSlot(g, g.player.inv.findIndex((s) => s?.id === 'sword_1'));
    expect(loadout(g, 'sword')[0]).toBe('s_parry');
  });

  it('arbalète : le rechargement n’avance que si elle est en main', () => {
    const g = freshGame();
    chooseStarter(g, 'xbow_1');
    g.give('sword_1', 1);
    g.player.xbowLoaded = false;
    g.player.reloadT = 0;
    const inp = idle();
    equipSlot(g, g.player.inv.findIndex((s) => s?.id === 'sword_1'));
    for (let i = 0; i < 120; i++) tickPlayerCombat(g, 1 / 60, inp, false);
    expect(g.player.xbowLoaded).toBe(false);
    equipSlot(g, g.player.inv.findIndex((s) => s?.id === 'xbow_1'));
    for (let i = 0; i < 300; i++) tickPlayerCombat(g, 1 / 60, inp, false);
    expect(g.player.xbowLoaded).toBe(true);
  });
});

describe('camp', () => {
  it('la fabrication au camp puise dans les coffres, sans duplication', () => {
    const g = freshGame();
    const chest = [...g.world.buildings.values()].find((b) => b.type === 'chest' && b.items);
    expect(chest).toBeTruthy();
    chest!.items!.fill(null);
    chest!.items![0] = { id: 'fiber', qty: 6 };
    const before = countItem(g.player.inv, 'fiber');
    const r = craft(g, 'r_rope', 2);
    expect(r.ok).toBe(true);
    expect(countItem(g.player.inv, 'rope')).toBeGreaterThanOrEqual(2);
    const left = countItem(g.player.inv, 'fiber') + (chest!.items![0]?.qty ?? 0);
    expect(left).toBe(before + 6 - 6);
  });

  it('enchantement : un seul par objet, le nouveau remplace l’ancien', () => {
    const g = freshGame();
    chooseStarter(g, 'sword_1');
    g.world.addBuilding('enchanter', Math.floor(g.player.x / TILE) + 1, Math.floor(g.player.y / TILE) + 1);
    for (const [id, n] of Object.entries({ iron: 4, blackmoss: 4, venom: 4 })) g.give(id, n);
    expect(enchantItem(g, 'weapon', 'keen').ok).toBe(true);
    expect(enchantItem(g, 'weapon', 'venom').ok).toBe(true);
    expect(g.player.equip.weapon!.ench).toBe('venom');
  });
});

describe('sauvegarde', () => {
  it('reprise au milieu d’une expédition : même instance, coffres déjà ouverts restent vidés', () => {
    const g = freshGame();
    chooseStarter(g, 'sword_1');
    startExpedition(g, 'bois');
    const chest = g.world.objects.find((o) => o.type === 'container')!;
    const items = g.openWorldContainer(chest);
    const firstId = items.find((s) => s)?.id;
    g.openContainer = { kind: 'obj', id: chest.id };
    items.fill(null);
    g.recordChest(chest);
    const data = JSON.parse(JSON.stringify(serialize(g)));
    const v = validateSave(data);
    expect(v.ok).toBe(true);
    const g2 = deserialize((v as { data: typeof data }).data);
    expect(g2.mapId).toBe('bois');
    expect(g2.run!.id).toBe(g.run!.id);
    const c2 = g2.world.objects.find((o) => o.key === chest.key)!;
    const again = g2.openWorldContainer(c2);
    expect(again.every((s) => !s)).toBe(true);
    expect(firstId).toBeTruthy();
  });

  it('ancienne sauvegarde V1 : possessions converties, fichier d’origine non modifié', () => {
    for (const [f, src] of Object.entries({ debut, milieu, fin })) {
      const raw = JSON.parse(JSON.stringify(src));
      const copy = JSON.stringify(raw);
      const v = validateSave(raw);
      expect(v.ok, f).toBe(true);
      const g = deserialize((v as { data: Parameters<typeof deserialize>[0] }).data);
      expect(g.mapId).toBe('camp');
      expect(g.flags.has('migrated')).toBe(true);
      expect(JSON.stringify(raw)).toBe(copy);
      const again = serialize(g);
      expect(validateSave(JSON.parse(JSON.stringify(again))).ok).toBe(true);
    }
  });
});

describe('boucle complète', () => {
  it('nouvelle partie → arme → sortie → retour → fabrication → bastion → boss → donjon 1 → palier 2 → sauvegarde', () => {
    const g = freshGame(99);
    expect(chooseStarter(g, 'mace_1').ok).toBe(true);
    expect(startExpedition(g, 'bois').ok).toBe(true);
    // récolte réelle : couper un arbre
    const tree = g.world.objects.find((o) => o.type === 'tree' && !o.depleted)!;
    for (let i = 0; i < 12 && !tree.depleted; i++) g.harvest(tree);
    g.give('wood', 30, { collected: true });
    g.give('stone', 20, { collected: true });
    g.give('fiber', 20, { collected: true });
    expect(returnToCamp(g).ok).toBe(true);
    expect(g.flags.has('first_return')).toBe(true);
    expect(countItem(g.player.inv, 'wood')).toBeGreaterThanOrEqual(30);
    expect(craft(g, 'r_rope', 1).ok).toBe(true);
    expect(startExpedition(g, 'bastion').ok).toBe(true);
    killBoss(g);
    expect(g.flags.has('boss_chief')).toBe(true);
    returnToCamp(g);
    expect(startExpedition(g, 'd_bastion', 1).ok).toBe(true);
    killBoss(g);
    returnToCamp(g);
    expect(g.dungeon('d_bastion').unlocked).toBe(2);
    run(g, DUNGEONS.d_bastion.cooldown + 1);
    expect(startExpedition(g, 'd_bastion', 2).ok).toBe(true);
    killBoss(g);
    expect(g.dungeon('d_bastion').unlocked).toBe(3);
    const g2 = deserialize(JSON.parse(JSON.stringify(serialize(g))));
    expect(g2.dungeon('d_bastion').unlocked).toBe(3);
    expect(g2.mapId).toBe('bastion');
    expect(g2.flags.has('boss_chief')).toBe(true);
  });
});
