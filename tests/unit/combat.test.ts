// Combats et première nuit, testés dans la simulation réelle (sans rendu).
// Les mesures sont affichées (console) pour documenter les réglages.
import { describe, expect, it } from 'vitest';
import { DAY, PLAYER, TILE } from '../../src/config/balance';
import { ENEMIES } from '../../src/data/enemies';
import { Game } from '../../src/sim/game';
import { spawnEnemy } from '../../src/sim/enemies';
import { pickupBag } from '../../src/sim/interact';
import { countItem } from '../../src/sim/inventory';
import { useSlot } from '../../src/sim/actions';
import type { InputState } from '../../src/sim/types';
import { idle, teleport } from './helpers';

const DT = 1 / 60;

/** Arène dégagée autour d'un point (pour des mesures reproductibles). */
function arena(seed = 5, r = 8): Game {
  const g = Game.newGame(seed);
  teleport(g, 60, 128);
  const cx = Math.floor(g.player.x / TILE);
  const cy = Math.floor(g.player.y / TILE);
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      const o = g.world.objectAtTile(x, y);
      if (o) {
        o.removed = true;
        g.world.unstampObject(o);
      }
    }
  g.world.outsideDirty = true;
  g.player.x = (cx + 0.5) * TILE;
  g.player.y = (cy + 0.5) * TILE;
  g.clock = 0; // pas d'apparitions ambiantes pendant les mesures
  g.spawnTimer = 999;
  return g;
}

describe('combat : mesures', () => {
  it('chaque attaque ennemie est annoncée avant les dégâts (durée d’annonce)', () => {
    for (const type of ['rodeur', 'affame', 'brute'] as const) {
      const g = arena();
      const e = spawnEnemy(g, type, g.player.x + 22, g.player.y, 'ambient');
      e.state = 'chase';
      let windupStart = -1;
      let hurtAt = -1;
      for (let t = 0; t < 4 && hurtAt < 0; t += DT) {
        g.step(DT, idle());
        if (windupStart < 0 && e.windup > 0) windupStart = t;
        if (g.player.hp < PLAYER.maxHealth) hurtAt = t;
      }
      const lead = hurtAt - windupStart;
      console.log(`annonce ${type} : ${lead.toFixed(2)} s avant les dégâts`);
      expect(windupStart).toBeGreaterThanOrEqual(0);
      expect(lead).toBeGreaterThanOrEqual(ENEMIES[type].windup - 0.02);
    }
  });

  it('pas de dégâts multiples injustifiés : invulnérabilité après chaque coup', () => {
    const g = arena();
    for (const [dx, dy] of [[20, 0], [-20, 0], [0, 18], [0, -18]]) {
      const e = spawnEnemy(g, 'rodeur', g.player.x + dx, g.player.y + dy, 'ambient');
      e.state = 'chase';
    }
    const hits: number[] = [];
    let last = g.player.hp;
    for (let t = 0; t < 6 && !g.player.dead; t += DT) {
      g.step(DT, idle());
      if (g.player.hp < last - 0.5) hits.push(t);
      last = g.player.hp;
    }
    const gaps = hits.slice(1).map((t, i) => t - hits[i]);
    console.log(`4 rôdeurs au contact : ${hits.length} coups reçus en 6 s, écart minimal ${Math.min(...gaps).toFixed(2)} s`);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(PLAYER.hurtInvuln - 0.02);
  });

  it('l’esquive au bon moment évite le coup annoncé', () => {
    const g = arena();
    const e = spawnEnemy(g, 'rodeur', g.player.x + 22, g.player.y, 'ambient');
    e.state = 'chase';
    let dodged = false;
    for (let t = 0; t < 3; t += DT) {
      const inp = idle();
      if (!dodged && e.windup > 0 && e.windup < 0.2) {
        inp.dodge = true;
        inp.mx = -1;
        dodged = true;
      }
      g.step(DT, inp);
      if (dodged && e.windup <= 0) break;
    }
    expect(dodged).toBe(true);
    expect(g.player.hp).toBe(PLAYER.maxHealth);
  });

  it('réactivité : un appui bref frappe l’ennemi au contact en moins de 0,25 s', () => {
    const g = arena();
    g.player.equip.weapon = { id: 'spear', qty: 1, dur: 90 };
    const e = spawnEnemy(g, 'rodeur', g.player.x + 26, g.player.y + 8, 'ambient');
    g.player.aimX = 0;
    g.player.aimY = 1; // regarde ailleurs : la visée assistée doit corriger
    const hp0 = e.hp;
    const inp: InputState = { ...idle(), attackTap: true };
    let t = 0;
    for (; t < 1 && e.hp === hp0; t += DT) g.step(DT, inp);
    console.log(`délai appui → dégâts : ${t.toFixed(2)} s (visée assistée)`);
    expect(e.hp).toBeLessThan(hp0);
    expect(t).toBeLessThan(0.25);
  });

  it('portée lisible : la lance touche plus loin que les poings', () => {
    const reach = (weapon: string | null) => {
      const g = arena();
      if (weapon) g.player.equip.weapon = { id: weapon, qty: 1, dur: 90 };
      let hitAt = 0;
      for (let d = 70; d >= 16; d -= 2) {
        const e = spawnEnemy(g, 'rodeur', g.player.x + d, g.player.y, 'ambient');
        e.state = 'wander';
        const hp = e.hp;
        g.player.attackCd = 0;
        g.player.actionT = 0;
        g.step(DT, { ...idle(), attackTap: true });
        for (let i = 0; i < 20; i++) g.step(DT, idle());
        g.enemies = [];
        if (e.hp < hp) {
          hitAt = d;
          break;
        }
      }
      return hitAt;
    };
    const fist = reach(null);
    const spear = reach('spear');
    console.log(`portée utile : poings ${fist} px, lance ${spear} px`);
    expect(spear).toBeGreaterThan(fist + 10);
  });

  it('palissades et porte : les zombies attaquent la palissade, ne franchissent pas la porte ; le joueur passe', () => {
    const g = arena(8, 9);
    const cx = Math.floor(g.player.x / TILE);
    const cy = Math.floor(g.player.y / TILE);
    for (let y = cy - 2; y <= cy + 2; y++)
      for (let x = cx - 2; x <= cx + 2; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== 2) continue;
        g.world.addBuilding(x === cx && y === cy + 2 ? 'door' : 'palisade', x, y);
      }
    const e = spawnEnemy(g, 'rodeur', (cx + 0.5) * TILE, (cy + 5.5) * TILE, 'assault');
    e.state = 'chase';
    let wallHp = Infinity;
    for (let t = 0; t < 25; t += DT) {
      g.step(DT, idle());
      const inside = Math.abs(e.x / TILE - (cx + 0.5)) < 1.6 && Math.abs(e.y / TILE - (cy + 0.5)) < 1.6;
      expect(inside).toBe(false);
      const walls = [...g.world.buildings.values()].filter((b) => b.type === 'palisade' || b.type === 'door');
      wallHp = Math.min(wallHp, ...walls.map((b) => b.hp / (b.type === 'door' ? 200 : 160)));
    }
    console.log(`clôture la plus abîmée (palissade ou porte) : ${Math.round(wallHp * 100)} % de ses PV après 25 s`);
    expect(wallHp).toBeLessThan(1);
    // le joueur traverse la porte
    g.enemies = [];
    const y0 = g.player.y;
    for (let t = 0; t < 1.2; t += DT) g.step(DT, { ...idle(), my: 1 });
    expect(g.player.y).toBeGreaterThan(y0 + 2 * TILE);
  });
});

// ------------------------------------------------------------ première nuit
interface NightResult { died: boolean; deaths: number; minHp: number; kills: number; hits: number }

function atDusk(seed: number): Game {
  const g = Game.newGame(seed);
  g.clock = 700;
  g.dayTime = DAY.duskStart - 5;
  g.lastPhase = 'day';
  return g;
}

/**
 * Débutant réaliste : réagit avec retard, frappe seulement quand l'ennemi est tout près,
 * n'esquive pas, mange quand il a faim, n'utilise pas de bandage.
 */
function noviceNight(seed: number, prep: 'ready' | 'partial'): NightResult {
  const g = atDusk(seed);
  const s = g.world.start;
  teleport(g, s.x, s.y + 1);
  const cx = Math.floor(g.player.x / TILE);
  const cy = Math.floor(g.player.y / TILE);
  if (prep === 'ready') {
    g.world.addBuilding('campfire', cx + 2, cy);
    g.player.equip.weapon = { id: 'spear', qty: 1, dur: 90 };
    g.player.inv[0] = { id: 'berries', qty: 6 };
    g.player.inv[1] = { id: 'bread', qty: 2 };
  }
  let minHp = 100;
  let hits = 0;
  let deaths = 0;
  let lastHp = g.player.hp;
  let react = 0;
  for (let t = 0; t < DAY.length - DAY.duskStart + 40; t += DT) {
    const p = g.player;
    if (p.dead) {
      if (p.deathT <= 0) {
        deaths++;
        g.respawn();
      }
      g.step(DT, idle());
      continue;
    }
    const inp = idle();
    const near = g.enemies.filter((e) => e.dying <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < 44).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    // temps de réaction : ~0,4 s avant de frapper un ennemi qui arrive
    react = near.length ? react + DT : 0;
    if (prep === 'ready') {
      if (react > 0.4) inp.attack = true;
    } else if (near.length || g.enemies.some((e) => e.dying <= 0 && e.state === 'chase' && Math.hypot(e.x - p.x, e.y - p.y) < 5 * TILE)) {
      // mal préparé : il fuit en courant, à l'opposé du plus proche poursuivant
      const chasers = g.enemies.filter((e) => e.dying <= 0 && e.state === 'chase').sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      const c = chasers[0] ?? near[0];
      if (c) {
        const d = Math.hypot(p.x - c.x, p.y - c.y) || 1;
        inp.mx = (p.x - c.x) / d;
        inp.my = (p.y - c.y) / d;
        inp.sprint = true;
      }
      if (near.length && react > 0.4) inp.attack = true;
    }
    if (p.hunger < 30) {
      const i = p.inv.findIndex((x) => x && (x.id === 'berries' || x.id === 'bread'));
      if (i >= 0) useSlot(g, i);
    }
    g.step(DT, inp);
    if (g.player.hp < lastHp - 0.5) hits++;
    lastHp = g.player.hp;
    minHp = Math.min(minHp, g.player.hp);
    if (g.phase() === 'day' && t > 60) break;
  }
  return { died: deaths > 0, deaths, minHp: Math.round(minHp), kills: g.stats.kills, hits };
}

describe('première nuit', () => {
  it('débutant préparé (lance, feu, baies, sans palissade) : la nuit est tenable mais pas gratuite', () => {
    const res = [11, 12, 13, 14, 15, 16].map((s) => noviceNight(s, 'ready'));
    console.log('débutant préparé :', JSON.stringify(res));
    const survived = res.filter((r) => !r.died).length;
    expect(survived).toBeGreaterThanOrEqual(4); // tenable
    expect(res.filter((r) => r.hits > 0).length).toBeGreaterThanOrEqual(3); // pas une nuit sans risque
  });

  it('joueur mal préparé : il peut fuir, et une mort ne mène pas à une série de morts', () => {
    const res = [21, 22, 23, 24].map((s) => noviceNight(s, 'partial'));
    console.log('mal préparé (fuite) :', JSON.stringify(res));
    for (const r of res) expect(r.deaths).toBeLessThanOrEqual(1);
  });

  it('après une mort : cause expliquée, sac récupérable, réapparition protégée', () => {
    const g = arena();
    g.player.inv[0] = { id: 'wood', qty: 20 };
    g.player.inv[1] = { id: 'bread', qty: 4 };
    for (const [dx, dy] of [[20, 0], [-20, 0], [0, 18]]) {
      const e = spawnEnemy(g, 'brute', g.player.x + dx, g.player.y + dy, 'assault');
      e.state = 'chase';
    }
    let reason = '';
    for (let t = 0; t < 30 && !g.player.dead; t += DT) {
      g.step(DT, idle());
      for (const ev of g.events) if (ev.type === 'death') reason = ev.reason;
      g.events.length = 0;
    }
    expect(g.player.dead).toBe(true);
    expect(reason).toMatch(/tué par une? brute/i);
    const bag = g.world.bags.get(g.deathBagId)!;
    expect(countItem(bag.items, 'wood') + countItem(g.player.inv, 'wood')).toBe(20);
    g.respawn();
    // les assaillants proches du point de retour sont partis ; protection de quelques secondes
    let hurt = false;
    const hp = g.player.hp;
    for (let t = 0; t < 8; t += DT) {
      g.step(DT, idle());
      if (g.player.hp < hp - 0.5) hurt = true;
    }
    expect(hurt).toBe(false);
    teleport(g, Math.floor(bag.x / TILE), Math.floor(bag.y / TILE));
    pickupBag(g, bag.id);
    expect(countItem(g.player.inv, 'wood')).toBe(20);
  });
});
