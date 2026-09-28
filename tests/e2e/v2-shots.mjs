// Parcours visuel V2 : écran titre, camp, râtelier, chaque région et donjon, combat, panneaux.
// Usage : node tests/e2e/v2-shots.mjs <url> <dossier> [portrait|paysage]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4173/';
const OUT = process.argv[3] ?? 'test-results/v2';
const mode = process.argv[4] ?? 'paysage';
fs.mkdirSync(OUT, { recursive: true });
const viewport = mode === 'portrait' ? { width: 390, height: 844 } : { width: 844, height: 390 };

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForSelector('text=Nouvelle partie', { timeout: 60000 });
await page.waitForTimeout(800);
const shot = (n) => page.screenshot({ path: path.join(OUT, `${mode}-${n}.png`) });
await shot('00-titre');
await page.getByText('Nouvelle partie').first().click();
const c = page.getByRole('button', { name: 'Nouvelle partie' });
if ((await c.count()) > 1) await c.last().click();
await page.getByText('Je suis prêt').click();
await page.waitForTimeout(1000);
await shot('01-camp');
await page.evaluate(() => window.__app.openPanel('rack'));
await page.waitForTimeout(300);
await shot('02-ratelier');
await page.evaluate(() => { window.__sim.chooseStarter(window.__app.game, 'sword_1'); window.__app.closePanel(); });
await page.evaluate(() => window.__app.openPanel('arms'));
await page.waitForTimeout(300);
await shot('03-armes');
await page.evaluate(() => { const g = window.__app.game; g.flags.add('first_return'); g.flags.add('boss_chief'); g.flags.add('boss_worm'); window.__app.openPanel('travel'); });
await page.waitForTimeout(300);
await shot('04-depart');
for (const [id, tier] of [['bois', 1], ['marais', 1], ['bastion', 1], ['carriere', 1], ['d_bastion', 1]]) {
  await page.evaluate(([id, tier]) => {
    const g = window.__app.game;
    if (g.run) window.__sim.returnToCamp(g);
    const r = window.__sim.startExpedition(g, id, tier);
    if (!r.ok) throw new Error(r.reason);
    window.__app.closePanel();
  }, [id, tier]);
  await page.waitForTimeout(1500);
  await shot(`10-${id}`);
}
await page.evaluate(() => { const g = window.__app.game; window.__sim.returnToCamp(g); });
await page.waitForTimeout(800);
await page.evaluate(() => window.__app.openPanel('inventory'));
await page.waitForTimeout(300);
await shot('20-sac');
await page.evaluate(() => window.__app.openPanel('craft'));
await page.waitForTimeout(300);
await shot('21-fabrication');
await page.evaluate(() => window.__app.openPanel('build'));
await page.waitForTimeout(300);
await shot('22-camp');
await page.evaluate(() => window.__app.openPanel('journal'));
await page.waitForTimeout(300);
await shot('23-journal');
await page.evaluate(() => window.__app.openPanel('map'));
await page.waitForTimeout(500);
await shot('24-carte');
fs.writeFileSync(path.join(OUT, `${mode}-errors.json`), JSON.stringify(errors, null, 1));
console.log('erreurs', errors.length, errors.slice(0, 8));
await browser.close();
