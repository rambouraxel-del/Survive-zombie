// Vue d'ensemble de chaque carte (zoom 1, interface masquée) pour relire le level design.
// Usage : node tests/e2e/map-overview.mjs <url> <dossier> [cartes…]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4173/';
const OUT = process.argv[3] ?? 'test-results/maps';
const only = process.argv.slice(4);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 2048, height: 1664 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.waitForSelector('text=Nouvelle partie', { timeout: 60000 });
await page.getByText('Nouvelle partie').first().click();
const c = page.getByRole('button', { name: 'Nouvelle partie' });
if ((await c.count()) > 1) await c.last().click();
await page.getByText('Je suis prêt').click();
await page.addStyleTag({ content: '#ui{display:none!important}' });
const list = [['camp', null], ['house', null], ['bois', 'bois'], ['marais', 'marais'], ['bastion', 'bastion'], ['carriere', 'carriere'], ['d_bastion', 'd_bastion'], ['d_carriere', 'd_carriere']].filter(([n]) => !only.length || only.includes(n));
for (const [name, dest] of list) {
  await page.evaluate(([name, dest]) => {
    const g = window.__app.game;
    ['first_return', 'boss_chief', 'boss_worm'].forEach((f) => g.flags.add(f));
    g.player.invuln = 9999;
    if (g.run) window.__sim.returnToCamp(g);
    if (name === 'house') {
      const d = g.world.objects.find((o) => o.type === 'door');
      g.player.x = (d.fx + 0.5) * 32; g.player.y = (d.fy + 1.5) * 32;
      window.__app.game.interact && 0;
    }
    if (dest) { g.dungeons[dest] && (g.dungeons[dest].lastWin = null); const r = window.__sim.startExpedition(g, dest, 1); if (!r.ok) throw new Error(r.reason); }
  }, [name, dest]);
  if (name === 'house') await page.evaluate(() => { const g = window.__app.game; const d = g.world.objects.find((o) => o.type === 'door'); g.target = null; import('/src/sim/travel.ts').catch(() => {}); });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const sc = window.__phaser.scene.getScene('world');
    const cam = sc.cameras.main;
    cam.stopFollow();
    cam.setZoom(1);
    cam.setScroll(0, 0);
    sc.lighting && sc.lighting.update && 0;
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}
console.log('erreurs', errors);
await browser.close();
