// Captures des nouveautés : scènes d'exploration, repères de première récolte,
// camp amélioré de nuit, repère de danger, fiche de recette, première nuit.
// Usage : node tests/e2e/feature-shots.mjs <url> <dossier>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4183/';
const OUT = process.argv[3] ?? 'test-results/features';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${url}?safe=0,21,47,47`);
await page.waitForSelector('text=Nouvelle partie', { timeout: 60000 });
await page.getByText('Nouvelle partie').tap();
await page.getByText('Commencer').tap();
await page.waitForTimeout(1200);
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });

// 1. première récolte : ressources proches signalées
await page.evaluate(() => {
  const g = window.__app.game;
  const ch = g.world.objects.find((o) => o.guaranteed === 'start_chest');
  g.openWorldContainer(ch);
  g.stats.notesRead.push('n_camp');
});
await page.waitForTimeout(1500);
await shot('01-premiere-recolte');

// 2. scènes d'exploration
for (const id of ['sc_bivouac', 'sc_barricade', 'sc_tomb', 'sc_hunters']) {
  await page.evaluate((id) => {
    const g = window.__app.game;
    const lm = g.world.landmarks.find((l) => l.id === id);
    g.enemies = [];
    g.stats.guardiansSpawned.push(id); // capture calme
    g.player.x = (lm.x + 0.5) * 32;
    g.player.y = (lm.y + 3.5) * 32;
  }, id);
  await page.waitForTimeout(900);
  await shot(`02-scene-${id}`);
}

// 3. camp amélioré, de nuit
await page.evaluate(() => {
  const g = window.__app.game;
  const s = g.world.start;
  g.player.x = (s.x + 0.5) * 32;
  g.player.y = (s.y + 4.5) * 32;
  const inv = g.player.inv;
  const refill = () => { inv[20] = { id: 'wood', qty: 50 }; inv[21] = { id: 'stone', qty: 50 }; inv[22] = { id: 'planks', qty: 40 }; inv[23] = { id: 'rope', qty: 20 }; inv[19] = { id: 'scrap', qty: 20 }; };
  const put = (t, x, y) => { refill(); for (let d = 0; d < 5; d++) for (const [ox, oy] of [[0, 0], [d, 0], [-d, 0], [0, d]]) { const r = window.__sim.place(g, t, x + ox, y + oy); if (r.ok) return g.world.buildingAtTile(x + ox, y + oy); } return null; };
  const f = put('campfire', s.x + 2, s.y + 5);
  const c = put('chest', s.x - 2, s.y + 5);
  const w = put('workbench', s.x - 1, s.y + 7);
  for (const b of [f, c, w]) if (b) { refill(); b.level = 2; if (b.items) while (b.items.length < 24) b.items.push(null); }
  g.emit({ type: 'buildChanged' });
  g.dayTime = 480;
  g.lastPhase = 'night';
});
await page.waitForTimeout(1200);
await shot('03-camp-ameliore-nuit');

// 4. repère de danger : un grognement hors de vue
await page.evaluate(() => {
  const g = window.__app.game;
  g.dayTime = 200;
  g.lastPhase = 'day';
  const e = window.__sim.spawnEnemy(g, 'rodeur', g.player.x + 16 * 32, g.player.y - 2 * 32, 'ambient');
  e.state = 'wander';
  g.emit({ type: 'threat', x: e.x, y: e.y, kind: 'sound' });
});
await page.waitForTimeout(400);
await shot('04-repere-danger');

// 5. zombie qui vous repère (« ! ») et combat avec l'arme en main
await page.evaluate(() => {
  const g = window.__app.game;
  g.enemies = [];
  g.player.equip.weapon = { id: 'spear', qty: 1, dur: 90 };
  const e = window.__sim.spawnEnemy(g, 'affame', g.player.x + 90, g.player.y, 'ambient');
  e.state = 'wander';
});
await page.waitForTimeout(1200);
await shot('05-repere-et-lance');
await browser.close();
console.log('captures dans', OUT);
