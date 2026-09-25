// Scénarios d'équilibrage simulés : les premières nuits doivent rester survivables
// avec des défenses modestes, et une nuit ne doit pas durer indéfiniment.
import { describe, expect, it } from 'vitest';
import { DAY, TILE } from '../../src/config/balance';
import { Game } from '../../src/sim/game';
import { idle, teleport } from './helpers';
import { useSlot } from '../../src/sim/actions';

/** Petit « bot » : frappe l'ennemi le plus proche, mange quand il a faim. */
function botNight(g: Game, withEnclosure: boolean, weapon: string): { died: boolean; kills: number; minHp: number; lastAssaultLeft: number } {
  const w = g.world;
  teleport(g, 60, 128);
  const cx = Math.floor(g.player.x / TILE);
  const cy = Math.floor(g.player.y / TILE);
  // dégage la zone du test
  for (let y = cy - 5; y <= cy + 5; y++)
    for (let x = cx - 5; x <= cx + 5; x++) {
      const o = w.objectAtTile(x, y);
      if (o) {
        o.removed = true;
        w.unstampObject(o);
      }
    }
  w.addBuilding('campfire', cx + 1, cy - 1);
  if (withEnclosure) {
    for (let y = cy - 3; y <= cy + 3; y++)
      for (let x = cx - 3; x <= cx + 3; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== 3) continue;
        w.addBuilding(x === cx && y === cy + 3 ? 'door' : 'palisade', x, y);
      }
  }
  g.player.equip.weapon = { id: weapon, qty: 1, dur: 200 };
  g.player.inv[0] = { id: 'meat_cooked', qty: 6 };
  g.player.inv[1] = { id: 'bandage', qty: 3 };
  let died = false;
  let minHp = 100;
  const dt = 1 / 30;
  for (let t = 0; t < DAY.length; t += dt) {
    const inp = idle();
    const p = g.player;
    const near = g.enemies.filter((e) => e.dying <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < 58);
    if (near.length) inp.attack = true;
    if (p.hunger < 40) useSlot(g, 0);
    if (p.hp < 45 && p.healT <= 0) useSlot(g, 1);
    g.step(dt, inp);
    minHp = Math.min(minHp, g.player.hp);
    if (g.player.dead) {
      died = true;
      break;
    }
    if (g.phase() === 'day' && t > 100) break;
  }
  const left = g.enemies.filter((e) => e.kind === 'assault' && e.dying <= 0).length;
  return { died, kills: g.stats.kills, minHp: Math.round(minHp), lastAssaultLeft: left };
}

function atDusk(seed: number, night: number): Game {
  const g = Game.newGame(seed);
  g.day = night;
  g.clock = 600 * night;
  g.dayTime = DAY.duskStart - 5;
  g.lastPhase = 'day';
  return g;
}

describe('équilibrage des nuits', () => {
  it('nuit 1 : survivable à la lance, dans un petit enclos', () => {
    for (const seed of [1, 2, 3]) {
      const r = botNight(atDusk(seed, 1), true, 'spear');
      expect(r.died, JSON.stringify(r)).toBe(false);
    }
  });

  it('nuit 1 : survivable même sans enclos avec une lance', () => {
    const r = botNight(atDusk(7, 1), false, 'spear');
    expect(r.died, JSON.stringify(r)).toBe(false);
  });

  it('nuit 3 : survivable avec enclos, massue et nourriture', () => {
    for (const seed of [4, 5]) {
      const r = botNight(atDusk(seed, 3), true, 'club');
      expect(r.died, JSON.stringify(r)).toBe(false);
    }
  });

  it('la horde se retire à l’aube (pas de siège interminable)', () => {
    const g = atDusk(9, 2);
    botNight(g, true, 'club');
    // l'aube est arrivée : il ne reste plus d'assaillants actifs après leur retraite
    for (let t = 0; t < 60; t += 1 / 30) g.step(1 / 30, idle());
    expect(g.enemies.filter((e) => e.kind === 'assault' && e.dying <= 0 && e.state !== 'retreat').length).toBe(0);
  });
});
