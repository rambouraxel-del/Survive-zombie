// Captures de disposition mobile : objectif actif, combat, construction,
// en portrait 390×844 et paysage 844×390, avec zones de sécurité d'iPhone simulées.
// Usage : node tests/e2e/layout-shots.mjs <url> <dossier> [préfixe]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const OUT = process.argv[3] ?? 'test-results/layout';
const prefix = process.argv[4] ?? '';
fs.mkdirSync(OUT, { recursive: true });

const FORMATS = [
  { name: 'portrait', viewport: { width: 390, height: 844 }, safe: '47,34,0,0' },
  { name: 'paysage', viewport: { width: 844, height: 390 }, safe: '0,21,47,47' },
];

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const report = {};
for (const f of FORMATS) {
  const ctx = await browser.newContext({ viewport: f.viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const sep = url.includes('?') ? '&' : '?';
  await page.goto(`${url}${sep}safe=${f.safe}`);
  await page.waitForSelector('text=Nouvelle partie', { timeout: 30000 });
  await page.getByText('Nouvelle partie').first().click();
  const c = page.getByRole('button', { name: 'Nouvelle partie' });
  if ((await c.count()) > 1) await c.last().click();
  await page.getByText('Commencer').click();
  await page.waitForTimeout(1200);
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${prefix}${f.name}-${n}.png`) });
  await shot('1-objectif');

  // combat : deux zombies au contact du joueur
  await page.evaluate(() => {
    const g = window.__app.game;
    g.player.x = (g.world.start.x + 6.5) * 32;
    g.player.y = (g.world.start.y + 6.5) * 32;
    g.player.hp = 100;
    for (const [dx, dy] of [[40, 0], [-30, 30]]) {
      const e = window.__sim.spawnEnemy(g, dx > 0 ? 'rodeur' : 'affame', g.player.x + dx, g.player.y + dy, 'ambient');
      e.state = 'chase';
    }
  });
  await page.waitForTimeout(900);
  await shot('2-combat');
  // mesure : le personnage est-il recouvert par un élément d'interface ?
  const cover = await page.evaluate(() => {
    const scene = window.__phaser.scene.getScene('world');
    const cam = scene.cameras.main;
    const p = window.__app.game.player;
    const k = cam.zoom / Math.min(devicePixelRatio || 1, 2);
    const sx = (p.x - cam.worldView.x) * k;
    const sy = (p.y - cam.worldView.y) * k;
    // rectangle du personnage (≈ 32×48 px monde) et marge d'une case autour
    const box = { l: sx - 48 * k, r: sx + 48 * k, t: sy - 80 * k, b: sy + 32 * k };
    const hits = [];
    for (const el of document.querySelectorAll('#hud *, #controls *, #toasts *')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden' || getComputedStyle(el).opacity === '0') continue;
      if (el.closest('#joy-zone') && el.id === 'joy-zone') continue;
      if (r.right > box.l && r.left < box.r && r.bottom > box.t && r.top < box.b) hits.push(el.id || el.className || el.tagName);
    }
    return { player: { x: Math.round(sx), y: Math.round(sy) }, hits: [...new Set(hits)].slice(0, 8), view: { w: innerWidth, h: innerHeight } };
  });
  // construction
  await page.evaluate(() => {
    const g = window.__app.game;
    g.enemies = [];
    g.player.inv[10] = { id: 'wood', qty: 40 };
    g.player.inv[11] = { id: 'stone', qty: 20 };
    window.__app.startPlacement('campfire');
  });
  await page.waitForTimeout(500);
  await shot('3-construction');
  await page.evaluate(() => window.__app.stopPlacement());
  report[f.name] = { cover, errors };
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, `${prefix}rapport.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
