// Anciennes sauvegardes (fixtures v1 produites avant la mise à jour) : migration sans perte
// ni duplication, monde identique, introduction non imposée, persistance des nouveautés.
import { describe, expect, it } from 'vitest';
import { deserialize, migrateSave, serialize, validateSave, SAVE_VERSION, type SaveData } from '../../src/save/serialize';
import { generateWorld } from '../../src/world/generate';
import { hashSeed } from '../../src/sim/rng';
import { currentObjective } from '../../src/sim/objectives';
import { useHotbar, upgradeBuilding } from '../../src/sim/actions';
import { assignHotbar, hotbarQty } from '../../src/sim/hotbar';
import type { Game } from '../../src/sim/game';
import { TILE } from '../../src/config/balance';

import debut from '../fixtures/v1-debut.json';
import milieu from '../fixtures/v1-milieu.json';
import fin from '../fixtures/v1-fin.json';
import mondes from '../fixtures/v1-mondes.json';

const RAW: Record<string, unknown> = { 'v1-debut': debut, 'v1-milieu': milieu, 'v1-fin': fin };
const load = (n: string): SaveData => JSON.parse(JSON.stringify(RAW[n]));
const FIXTURES = ['v1-debut', 'v1-milieu', 'v1-fin'];

/** Total de chaque objet (sac, équipement, constructions, sacs au sol, conteneurs ouverts). */
function totalsFromSave(d: SaveData): Record<string, number> {
  const t: Record<string, number> = {};
  const add = (s: { id: string; qty: number } | null | undefined) => {
    if (s) t[s.id] = (t[s.id] ?? 0) + s.qty;
  };
  d.player.inv.forEach(add);
  Object.values(d.player.equip).forEach(add);
  for (const b of d.buildings) b.items?.forEach(add);
  for (const b of d.bags) b.items.forEach(add);
  for (const o of d.objects) o.items?.forEach(add);
  return t;
}
function totalsFromGame(g: Game): Record<string, number> {
  return totalsFromSave(serialize(g));
}

describe('anciennes sauvegardes (v1)', () => {
  it('les fixtures v1 sont valides et migrées vers la version courante', () => {
    for (const n of FIXTURES) {
      const d = load(n);
      expect(d.v).toBe(1);
      const v = validateSave(d);
      expect(v.ok, n).toBe(true);
      if (v.ok) expect(v.data.v).toBe(SAVE_VERSION);
    }
  });

  it('aucun objet perdu ni dupliqué par la migration et le chargement', () => {
    for (const n of FIXTURES) {
      const d = load(n);
      const before = totalsFromSave(d);
      const g = deserialize(migrateSave(d));
      expect(totalsFromGame(g), n).toEqual(before);
      // la barre rapide ne contient que des références, sans doublon
      const ids = g.hotbar.filter(Boolean).map((h) => h!.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('le monde des anciennes parties est régénéré à l’identique (générateur v1)', () => {
    const ref = mondes as Record<string, { n: number; h: number }>;
    for (const [seed, r] of Object.entries(ref)) {
      const { world } = generateWorld(Number(seed), 1);
      expect(world.objects.length).toBe(r.n);
      expect(hashSeed(world.objects.map((o) => `${o.type}${o.fx},${o.fy}${o.sprite}${o.removed ? 'r' : ''}`).join('|'))).toBe(r.h);
    }
    const g = deserialize(load('v1-milieu'));
    expect(g.genVersion).toBe(1);
    expect(g.world.landmarks.some((l) => l.scene)).toBe(false); // pas de nouvelles scènes injectées
  });

  it('les raccourcis sont créés à partir des objets utiles, sans les matériaux', () => {
    const g = deserialize(load('v1-milieu'));
    const ids = g.hotbar.map((h) => h?.id ?? null);
    for (const m of ['wood', 'stone', 'fiber', 'planks', 'rope', 'coal']) expect(ids).not.toContain(m);
    expect(ids).toContain('berries');
    expect(ids).toContain('bandage');
    expect(ids).toContain('stone_axe');
  });

  it('une ancienne partie ne refait pas l’introduction', () => {
    const g = deserialize(load('v1-milieu'));
    expect(currentObjective(g)!.id).toBe('o_night');
    const fin = deserialize(load('v1-fin'));
    expect(currentObjective(fin)!.id).toBe('o_restore');
    // début de partie : l'introduction continue normalement (coffre déjà fouillé)
    const deb = deserialize(load('v1-debut'));
    expect(deb.completed.has('o_chest')).toBe(false); // évalué au prochain pas
    expect(['o_chest', 'o_note']).toContain(currentObjective(deb)!.id);
  });

  it('reprise d’une ancienne partie : position, inventaire, constructions, sac de mort', () => {
    const d = load('v1-milieu');
    const g = deserialize(d);
    expect(g.player.x).toBe(d.player.x);
    expect(g.player.y).toBe(d.player.y);
    expect(g.world.buildings.size).toBe(d.buildings.length);
    expect([...g.world.bags.values()].some((b) => b.kind === 'death')).toBe(true);
    expect(g.player.equip.armor?.id).toBe('gambison');
  });
});

describe('sauvegarde v2', () => {
  it('raccourcis, marqueurs, recette suivie, tutoriel et niveaux persistent', () => {
    const g = deserialize(load('v1-milieu'));
    assignHotbar(g, 4, 'bread');
    g.markers.push({ id: 1, x: 10, y: 20, cat: 'danger', name: 'Brute' });
    g.pinned = 'iron';
    g.tutorialSkipped = true;
    const chest = [...g.world.buildings.values()].find((b) => b.type === 'chest')!;
    g.player.x = (chest.x + 0.5) * TILE;
    g.player.y = (chest.y + 1.5) * TILE;
    g.player.inv[20] = { id: 'planks', qty: 6 };
    g.player.inv[21] = { id: 'rope', qty: 2 };
    expect(upgradeBuilding(g, chest.id).ok).toBe(true);
    const d2 = JSON.parse(JSON.stringify(serialize(g)));
    expect(validateSave(d2).ok).toBe(true);
    const h = deserialize(d2);
    expect(h.hotbar[4]).toEqual({ id: 'bread', manual: true });
    expect(h.markers).toEqual([{ id: 1, x: 10, y: 20, cat: 'danger', name: 'Brute' }]);
    expect(h.pinned).toBe('iron');
    expect(h.tutorialSkipped).toBe(true);
    const c2 = h.world.buildings.get(chest.id)!;
    expect(c2.level).toBe(2);
    expect(c2.items!.length).toBe(24);
    expect(c2.items![0]).toEqual({ id: 'wood', qty: 50 });
    expect(c2.items![15]?.id).toBe('club');
    expect(h.genVersion).toBe(1);
  });

  it('import invalide ou incompatible refusé (rien n’est chargé)', () => {
    const d = load('v1-milieu');
    expect(validateSave({ ...d, v: SAVE_VERSION + 1 }).ok).toBe(false);
    expect(validateSave({ ...d, tag: 'autre' }).ok).toBe(false);
    expect(validateSave({ ...d, v: 2, hotbar: [{ id: 'inconnu', manual: true }, null, null, null, null] }).ok).toBe(false);
    expect(validateSave({ ...d, v: 2, markers: [{ id: 1, x: 'a', y: 2, cat: 'danger', name: '' }] }).ok).toBe(false);
    expect(validateSave({ ...d, player: { ...d.player, inv: d.player.inv.slice(0, 10) } }).ok).toBe(false);
  });

  it('raccourci épuisé : il reste en place, les autres ne bougent pas', () => {
    const g = deserialize(load('v1-milieu'));
    const before = g.hotbar.map((h) => h?.id ?? null);
    const bi = before.indexOf('bandage');
    g.player.hp = 20;
    // deux bandages dans l'ancienne sauvegarde
    expect(useHotbar(g, bi).ok).toBe(true);
    g.player.healT = 0;
    g.player.hp = 20;
    expect(useHotbar(g, bi).ok).toBe(true);
    expect(hotbarQty(g, 'bandage')).toBe(0);
    expect(g.hotbar.map((h) => h?.id ?? null)).toEqual(before);
    expect(useHotbar(g, bi).ok).toBe(false);
  });
});
