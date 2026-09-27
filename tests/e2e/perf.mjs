// Mesures de performance dans Chromium (Playwright) : coût de la simulation, de la mise à jour
// de la scène, du rendu Phaser (CPU) et de l'interface, par scénario.
// Usage : node tests/e2e/perf.mjs <url> [fichier_json] [--throttle=4] [--width=844 --height=390] [--dpr=2]
// Limite : rendu WebGL logiciel (SwiftShader) sur machine virtuelle — les valeurs absolues ne
// représentent pas un téléphone ; elles servent à comparer les scénarios et les versions.
import fs from 'node:fs';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const outFile = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;
const arg = (k, d) => Number((process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `=${d}`).split('=')[1]);
const throttle = arg('throttle', 1);
const W = arg('width', 844);
const H = arg('height', 390);
const DPR = arg('dpr', 2);

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const cdp = await ctx.newCDPSession(page);
if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
await page.goto(url);
await page.waitForSelector('text=Nouvelle partie', { timeout: 60000 });
await page.getByText('Nouvelle partie').first().click();
const c = page.getByRole('button', { name: 'Nouvelle partie' });
if ((await c.count()) > 1) await c.last().click();
await page.getByText('Commencer').click();
await page.waitForTimeout(1500);

// compte les modifications du DOM du HUD et des commandes (actualisations excessives)
await page.evaluate(() => {
  window.__mut = 0;
  const mo = new MutationObserver((l) => (window.__mut += l.length));
  for (const id of ['hud', 'controls', 'toasts']) mo.observe(document.getElementById(id), { subtree: true, childList: true, attributes: true, characterData: true });
});

async function measure(name, setup, seconds = 4, during = null) {
  if (setup) await page.evaluate(setup);
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__perf.reset(); window.__mut = 0; });
  const t0 = Date.now();
  if (during) await during();
  const left = seconds * 1000 - (Date.now() - t0);
  if (left > 0) await page.waitForTimeout(left);
  const r = await page.evaluate((sec) => {
    const s = window.__perf.summary();
    const scene = window.__phaser.scene.getScene('world');
    return {
      ...s,
      fps: Math.round(window.__phaser.loop.actualFps),
      domMutPerSec: Math.round(window.__mut / sec),
      objects: scene.stats.objects,
      enemies: window.__app.game.enemies.length,
      displayList: scene.children.list.length,
    };
  }, seconds);
  console.log(`${name.padEnd(22)} fps ${String(r.fps).padStart(3)} | image ${r.frame.avg} ms (p95 ${r.frame.p95}) | sim ${r.sim.avg} (p95 ${r.sim.p95}) | scène ${r.scene.avg} (p95 ${r.scene.p95}) | rendu ${r.render.avg} (p95 ${r.render.p95}) | UI ${r.ui.avg} | DOM ${r.domMutPerSec}/s | objets ${r.objects} | liste ${r.displayList} | ennemis ${r.enemies}`);
  return r;
}

const results = {};
results.clairiere = await measure('clairière initiale', null);
results.exploration = await measure('exploration', null, 5, async () => {
  for (const k of ['ArrowUp', 'ArrowRight', 'ArrowUp', 'ArrowLeft']) {
    await page.keyboard.down(k);
    await page.waitForTimeout(1200);
    await page.keyboard.up(k);
  }
});
results.camp = await measure('camp construit', () => {
  const g = window.__app.game;
  const s = g.world.start;
  const inv = g.player.inv;
  g.player.x = (s.x + 0.5) * 32;
  g.player.y = (s.y + 0.5) * 32;
  const types = ['campfire', 'workbench', 'chest', 'bed', 'forge', 'lamp', 'trap', 'lamp'];
  let k = 0;
  for (let dy = -4; dy <= 4; dy += 2)
    for (let dx = -6; dx <= 6; dx += 3) {
      inv[20] = { id: 'wood', qty: 50 }; inv[21] = { id: 'stone', qty: 50 }; inv[22] = { id: 'planks', qty: 40 }; inv[23] = { id: 'coal', qty: 30 };
      inv[19] = { id: 'fiber', qty: 50 }; inv[18] = { id: 'rope', qty: 20 }; inv[17] = { id: 'scrap', qty: 30 };
      window.__sim.place(g, types[k % types.length], s.x + dx, s.y + dy);
      k++;
    }
  for (let x = -8; x <= 8; x++) {
    inv[20] = { id: 'wood', qty: 50 };
    window.__sim.place(g, 'palisade', s.x + x, s.y - 6);
    window.__sim.place(g, 'palisade', s.x + x, s.y + 6);
  }
  g.dayTime = 480; // nuit : lumières actives
});
results.nuit = await measure('nuit, 14 ennemis', () => {
  const g = window.__app.game;
  g.player.hp = 100;
  g.player.invuln = 999;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const e = window.__sim.spawnEnemy(g, ['rodeur', 'affame', 'brute'][i % 3], g.player.x + Math.cos(a) * 200, g.player.y + Math.sin(a) * 140, 'assault');
    e.state = 'chase';
  }
});
results.menus = await measure('menus ouverts/fermés', () => { const g = window.__app.game; g.enemies = []; g.player.invuln = 0; }, 5, async () => {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__app.openPanel('inventory'));
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__app.openPanel('craft'));
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__app.openPanel('map'));
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__app.closePanel());
    await page.waitForTimeout(250);
  }
});

const env = await page.evaluate(() => ({ ua: navigator.userAgent, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, renderer: window.__phaser.renderer.type === 2 ? 'WebGL' : 'Canvas', canvas: `${window.__phaser.canvas.width}×${window.__phaser.canvas.height}` }));
console.log(JSON.stringify(env));
if (errors.length) console.log('Erreurs :', errors.slice(0, 5));
if (outFile) fs.writeFileSync(outFile, JSON.stringify({ env: { ...env, throttle }, results }, null, 1));
await browser.close();
