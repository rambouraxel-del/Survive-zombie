// Commandes tactiles V2 en situation : compétence, ultime visé (maintenir-glisser-relâcher),
// annulation, changement d'arme en combat, mort en sortie (résumé des pertes). Les boss sont couverts par les tests unitaires.
// Usage : node tests/e2e/v2-touch.mjs <url> <dossier>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4173/';
const OUT = process.argv[3] ?? 'test-results/v2';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const results = [];
const check = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${n}${d ? ' — ' + d : ''}`); };
await page.goto(url);
await page.waitForSelector('text=Nouvelle partie', { timeout: 60000 });
await page.getByText('Nouvelle partie').first().tap();
await page.getByText('Je suis prêt').tap();
await page.evaluate(() => {
  const g = window.__app.game;
  window.__sim.chooseStarter(g, 'sword_1');
  g.flags.add('first_return');
  g.give('dagger_1', 1);
  window.__sim.startExpedition(g, 'bois');
  g.player.invuln = 3;
});
await page.waitForTimeout(800);
const touchOnly = await page.evaluate(() => !document.body.classList.contains('kbd-mode'));
check('commandes tactiles affichées', touchOnly);
// compétence
await page.evaluate(() => { const g = window.__app.game; const e = window.__sim.spawnEnemy(g, 'wolf', g.player.x + 40, g.player.y); e.state = 'chase'; });
await page.locator('#btn-skill-0').tap();
await page.waitForTimeout(500);
const sk = await page.evaluate(() => window.__app.game.stats.skillsUsed);
check('compétence lancée au toucher', sk >= 1, `utilisations ${sk}`);
// ultime : jauge pleine, maintenir, glisser, relâcher
await page.evaluate(() => { const g = window.__app.game; g.ult = 100; g.mastery.sword = 200; });
await page.waitForTimeout(200);
const box = await page.locator('#btn-ult').boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
const cdp = await ctx.newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 7 }] });
await touch('touchStart', cx, cy);
await page.waitForTimeout(150);
await touch('touchMove', cx - 60, cy - 40);
await page.waitForTimeout(300);
const aiming = await page.evaluate(() => window.__app.controls.state.ultAiming && !document.getElementById('ult-cancel').classList.contains('hidden'));
await page.screenshot({ path: path.join(OUT, 'touch-1-visee-ultime.png') });
await touch('touchEnd', cx - 60, cy - 40);
await page.waitForTimeout(600);
const ult = await page.evaluate(() => ({ used: window.__app.game.stats.ultsUsed, gauge: window.__app.game.ult }));
check('ultime : visée affichée pendant l’appui', aiming);
check('ultime lancé au relâchement', ult.used === 1 && ult.gauge < 100, JSON.stringify(ult));
// annulation
await page.evaluate(() => { window.__app.game.ult = 100; });
await touch('touchStart', cx, cy);
await page.waitForTimeout(100);
const cb = await page.locator('#ult-cancel').boundingBox();
await touch('touchMove', cb.x + cb.width / 2, cb.y + cb.height / 2);
await page.waitForTimeout(100);
await touch('touchEnd', cb.x + cb.width / 2, cb.y + cb.height / 2);
await page.waitForTimeout(400);
const ult2 = await page.evaluate(() => ({ used: window.__app.game.stats.ultsUsed, gauge: window.__app.game.ult }));
check('ultime annulé en relâchant sur « annuler »', ult2.used === 1 && ult2.gauge === 100, JSON.stringify(ult2));
// changement d'arme en combat
await page.locator('#btn-weapon').tap();
await page.waitForTimeout(300);
const w = await page.evaluate(() => window.__app.game.player.equip.weapon?.id);
check('changement d’arme en combat (appui bref)', w === 'dagger_1', w);
// mort en sortie de ressources : résumé des pertes
await page.evaluate(() => { const g = window.__app.game; g.give('wood', 10, { collected: true }); window.__sim.killPlayer(g, 'Tombé sous les crocs d’un loup.'); });
await page.waitForSelector('text=Vous êtes tombé', { timeout: 8000 });
const lossTxt = await page.locator('ul.loss').textContent().catch(() => '');
await page.screenshot({ path: path.join(OUT, 'touch-2-mort.png') });
check('mort en sortie : pertes détaillées', /−2 Bois/.test(lossTxt ?? ''), lossTxt);
await page.getByText('Se relever').tap();
await page.waitForTimeout(800);
check('retour au camp après la chute', await page.evaluate(() => window.__app.game.mapId === 'camp'));
check('aucune erreur', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const bad = results.filter((r) => !r.ok).length;
console.log(`${results.length - bad}/${results.length} vérifications réussies`);
process.exit(bad ? 1 : 0);
