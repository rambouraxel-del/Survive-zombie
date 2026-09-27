// Captures comparables avant/après : même sauvegarde (fixture v1), mêmes écrans, mêmes formats.
// Usage : node tests/e2e/compare-shots.mjs <url> <dossier> <préfixe>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4183/';
const OUT = process.argv[3] ?? 'test-results/compare';
const prefix = process.argv[4] ?? '';
fs.mkdirSync(OUT, { recursive: true });
const save = JSON.parse(fs.readFileSync('tests/fixtures/v1-milieu.json', 'utf8'));

const FORMATS = [
  { name: 'portrait', viewport: { width: 390, height: 844 }, safe: '47,34,0,0', touch: true },
  { name: 'paysage', viewport: { width: 844, height: 390 }, safe: '0,21,47,47', touch: true },
  { name: 'etroit', viewport: { width: 360, height: 640 }, safe: '24,0,0,0', touch: true },
  { name: 'ordinateur', viewport: { width: 1280, height: 800 }, safe: '0,0,0,0', touch: false },
];

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
for (const f of FORMATS) {
  const ctx = await browser.newContext({ viewport: f.viewport, deviceScaleFactor: f.touch ? 2 : 1, hasTouch: f.touch, isMobile: f.touch });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', f.name, e.message));
  await page.goto(`${url}?safe=${f.safe}`);
  await page.waitForSelector('text=Nouvelle partie', { timeout: 60000 });
  await page.evaluate((data) => {
    const g = window.__sim.deserialize(JSON.parse(JSON.stringify(data)));
    window.__app.startGame(g);
    window.__app.screen(null, null);
  }, save);
  await page.waitForTimeout(1500);
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${prefix}${f.name}-${n}.png`) });
  await shot('1-jeu');
  // bouton d'action devant le coffre du camp (libellé long)
  await page.evaluate(() => {
    const g = window.__app.game;
    const ch = g.world.objects.find((o) => o.guaranteed === 'start_chest');
    g.player.x = (ch.fx + 0.5) * 32;
    g.player.y = (ch.fy + 1.6) * 32;
    g.player.aimX = 0; g.player.aimY = -1; g.player.facing = 'up';
  });
  await page.waitForTimeout(700);
  await shot('2-action');
  if (f.name === 'ordinateur' || f.name === 'etroit') {
    await ctx.close();
    continue;
  }
  await page.evaluate(() => window.__app.openPanel('inventory'));
  await page.waitForTimeout(300);
  await shot('3-sac');
  await page.evaluate(() => window.__app.openPanel('craft'));
  await page.waitForTimeout(300);
  await shot('4-fabrication');
  // fiche de recette (toucher une ligne) — sans effet sur l'ancienne version
  const row = page.locator('#panel-layer .recipe').nth(2);
  if (await row.count()) {
    await (f.touch ? row.tap({ position: { x: 30, y: 20 } }) : row.click({ position: { x: 30, y: 20 } }));
    await page.waitForTimeout(300);
    await shot('4b-fiche');
  }
  await page.evaluate(() => window.__app.openPanel('map'));
  await page.waitForTimeout(300);
  await shot('5-carte');
  await page.evaluate(() => { window.__app.closePanel(); window.__app.startManage(); });
  await page.waitForTimeout(400);
  await shot('6-gestion');
  await page.evaluate(() => window.__app.stopPlacement());
  // combat de nuit
  await page.evaluate(() => {
    const g = window.__app.game;
    g.dayTime = 480;
    g.player.hp = 100;
    for (const [dx, dy, t] of [[50, 0, 'rodeur'], [-40, 30, 'affame'], [10, -60, 'brute']]) {
      const e = window.__sim.spawnEnemy(g, t, g.player.x + dx, g.player.y + dy, 'assault');
      e.state = 'chase';
    }
  });
  await page.waitForTimeout(900);
  await shot('7-nuit-combat');
  await ctx.close();
}
await browser.close();
console.log('captures dans', OUT);
