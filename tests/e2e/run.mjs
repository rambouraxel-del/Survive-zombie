// Test de bout en bout dans Chromium (Playwright) : lance le jeu, récolte, fabrique,
// construit, combat, ouvre chaque écran, sauvegarde/recharge, portrait et paysage.
// Usage : npm run build && npm run e2e   (ou E2E_URL=http://localhost:5173/ npm run e2e)
// Limite : l'émulation mobile de Chromium n'est pas un vrai téléphone (iOS/Android).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const OUT = process.env.E2E_OUT ?? 'test-results/e2e';
fs.mkdirSync(OUT, { recursive: true });

let server = null;
let url = process.env.E2E_URL;
if (!url) {
  server = spawn('npx', ['vite', 'preview', '--port', '4180', '--strictPort'], { stdio: 'pipe' });
  url = 'http://localhost:4180/';
  await new Promise((r) => setTimeout(r, 2500));
}

const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok, info });
  console.log(`${ok ? '✔' : '✘'} ${name}${info ? ` — ${info}` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requête échouée : ${r.url()}`));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()} : ${r.url()}`);
  });
  return { ctx, page, errors };
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const G = (page, fn, arg) => page.evaluate(fn, arg);

/** Multitouch réel via le protocole Chromium (plusieurs doigts simultanés). */
async function touch(page, cdp, type, points) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })) });
}

async function center(page, sel) {
  const b = await page.locator(sel).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.documentElement.scrollHeight <= window.innerHeight + 1);
}

// ------------------------------------------------------------------ paysage
{
  const { ctx, page, errors } = await newPage({ width: 844, height: 390 });
  await page.goto(url);
  await page.waitForSelector('text=Nouvelle partie', { timeout: 30000 });
  await page.waitForTimeout(800);
  await shot(page, 'paysage-01-titre');
  await page.getByText('Nouvelle partie').click();
  await page.getByText('Commencer').click();
  await page.waitForTimeout(800);
  await shot(page, 'paysage-02-depart');
  check('pas de défilement de page (paysage)', await noOverflow(page));
  const cdp = await ctx.newCDPSession(page);

  // --- récolte : on se place près d'herbes hautes et on maintient « Action »
  await G(page, () => {
    const g = window.__app.game;
    const o = g.world.objects.find((x) => x.type === 'grass' && !x.depleted && !x.removed && Math.hypot(x.fx - g.world.start.x, x.fy - g.world.start.y) < 12);
    g.player.x = (o.fx + 0.5) * 32;
    g.player.y = (o.fy + 1.3) * 32;
    g.player.aimX = 0;
    g.player.aimY = -1;
  });
  await page.waitForTimeout(200);
  const label = await page.locator('#btn-action .albl').textContent();
  check('le bouton d’action annonce l’action', /Arracher|Cueillir|Couper|Miner/.test(label ?? ''), label ?? '');
  const act = await center(page, '#btn-action');
  await touch(page, cdp, 'touchStart', [act]);
  await page.waitForTimeout(700);
  await touch(page, cdp, 'touchEnd', []);
  const fiber = await G(page, () => window.__app.game.stats.collected.fiber ?? 0);
  check('récolte à la main (fibres)', fiber >= 2, `fibres=${fiber}`);

  // --- multitouch : marcher (joystick) ET attaquer en même temps
  const before = await G(page, () => ({ x: window.__app.game.player.x, cd: window.__app.game.player.attackCd }));
  const joy = { x: 110, y: 300 };
  const atk = await center(page, '#btn-attack');
  await touch(page, cdp, 'touchStart', [{ ...joy, id: 1 }]);
  await touch(page, cdp, 'touchMove', [{ x: joy.x + 60, y: joy.y, id: 1 }]);
  await touch(page, cdp, 'touchStart', [{ x: joy.x + 60, y: joy.y, id: 1 }, { ...atk, id: 2 }]);
  await page.waitForTimeout(600);
  const during = await G(page, () => ({ x: window.__app.game.player.x, act: window.__app.game.player.action, t: window.__app.game.player.actionT, cd: window.__app.game.player.attackCd }));
  await touch(page, cdp, 'touchEnd', [{ x: joy.x + 60, y: joy.y, id: 1 }]);
  await touch(page, cdp, 'touchEnd', []);
  await page.waitForTimeout(300);
  const after = await G(page, () => ({ x: window.__app.game.player.x, mx: window.__app.controls.state.mx, atk: window.__app.controls.state.attack }));
  check('multitouch : déplacement pendant une attaque', during.x > before.x + 10 && (during.cd > 0 || during.t > 0), `dx=${(during.x - before.x).toFixed(0)}`);
  check('relâchement complet après les doigts levés', after.mx === 0 && after.atk === false);

  // --- interruption : perte de focus pendant un appui
  await touch(page, cdp, 'touchStart', [{ ...joy, id: 5 }]);
  await touch(page, cdp, 'touchMove', [{ x: joy.x + 60, y: joy.y - 10, id: 5 }]);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const st = await G(page, () => ({ mx: window.__app.controls.state.mx }));
  await touch(page, cdp, 'touchCancel', []);
  check('perte de focus : commandes relâchées', st.mx === 0 || Math.abs(st.mx) < 0.01);

  // --- fabrication via l'interface
  await G(page, () => {
    const g = window.__app.game;
    const add = (id, n) => { for (let i = 0; i < 24 && n > 0; i++) { const s = g.player.inv[i]; if (!s) { g.player.inv[i] = { id, qty: n }; n = 0; } } };
    add('wood', 40); add('stone', 20); add('fiber', 12); add('planks', 8); add('rope', 4);
    window.__app.hud.forceRefresh();
  });
  await page.locator('#m-craft').click();
  await page.waitForSelector('.recipe');
  await shot(page, 'paysage-03-fabrication');
  const axeRow = page.locator('.recipe', { hasText: 'Hache de pierre' });
  await axeRow.getByRole('button', { name: 'Fabriquer' }).click();
  const axes = await G(page, () => window.__app.game.player.inv.filter((s) => s && s.id === 'stone_axe').length + (window.__app.game.player.equip.tool?.id === 'stone_axe' ? 1 : 0));
  check('fabrication via le panneau', axes === 1);
  await page.getByRole('button', { name: 'Fermer' }).click();

  // --- construction : feu de camp placé au doigt puis validé
  await G(page, () => {
    const g = window.__app.game;
    g.player.x = (g.world.start.x + 7.5) * 32;
    g.player.y = (g.world.start.y + 6.5) * 32;
  });
  await page.locator('#m-build').click();
  await page.locator('.recipe', { hasText: 'Feu de camp' }).getByRole('button', { name: 'Placer' }).click();
  await page.waitForTimeout(200);
  // cherche une case valide en tapant autour du joueur
  let placed = false;
  for (const [dx, dy] of [[70, 40], [-70, 40], [80, -30], [-80, -40], [120, 60], [-120, 70], [0, 100]]) {
    await page.touchscreen.tap(422 + dx, 195 + dy);
    await page.waitForTimeout(120);
    if (await page.locator('#place-ok').isEnabled()) {
      await shot(page, 'paysage-04-apercu-construction');
      await page.locator('#place-ok').click();
      placed = true;
      break;
    }
  }
  const fires = await G(page, () => [...window.__app.game.world.buildings.values()].filter((b) => b.type === 'campfire').length);
  check('construction avec aperçu et validation', placed && fires === 1, `feux=${fires}`);
  if (await page.locator('#placebar').isVisible()) await page.locator('#place-cancel').click();

  // --- camp construit (pour la capture) + établi, coffre, palissades
  await G(page, () => {
    const g = window.__app.game;
    const px = Math.floor(g.player.x / 32);
    const py = Math.floor(g.player.y / 32);
    const tryAdd = (t, x, y) => {
      const { canPlace } = window.__sim;
      for (let d = 0; d < 6; d++) for (const [ox, oy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]]) if (window.__sim.place(g, t, x + ox, y + oy).ok) return true;
      void canPlace;
      return false;
    };
    const add = (id, n) => { for (let i = 0; i < 24 && n > 0; i++) { const s = g.player.inv[i]; if (!s) { g.player.inv[i] = { id, qty: Math.min(n, 50) }; n -= 50; } } };
    add('wood', 100); add('stone', 30); add('planks', 20); add('rope', 10); add('fiber', 20);
    tryAdd('workbench', px - 3, py - 2);
    tryAdd('chest', px + 2, py - 2);
    tryAdd('bed', px - 3, py + 2);
    for (let x = px - 5; x <= px + 4; x++) tryAdd('palisade', x, py + 4);
    tryAdd('spikes', px + 4, py + 3);
  });
  await page.waitForTimeout(500);
  await shot(page, 'paysage-05-camp');

  // --- combat : un rôdeur approche, on attaque jusqu'à sa chute
  await G(page, () => {
    const g = window.__app.game;
    // case libre voisine du joueur (hors constructions)
    let sx = g.player.x + 44;
    let sy = g.player.y;
    for (const [dx, dy] of [[44, 0], [-44, 0], [0, -40], [0, 40], [34, 30], [-34, -30]]) {
      if (g.world.passableForEnemy(Math.floor((g.player.x + dx) / 32), Math.floor((g.player.y + dy) / 32))) { sx = g.player.x + dx; sy = g.player.y + dy; break; }
    }
    const e = window.__sim.spawnEnemy(g, 'rodeur', sx, sy, 'ambient');
    e.state = 'chase';
    g.player.hp = 100;
  });
  const atk2 = await center(page, '#btn-attack');
  let killed = false;
  for (let i = 0; i < 14 && !killed; i++) {
    await touch(page, cdp, 'touchStart', [atk2]);
    await page.waitForTimeout(250);
    if (i === 3) await shot(page, 'paysage-06-combat');
    await touch(page, cdp, 'touchEnd', []);
    await page.waitForTimeout(250);
    killed = await G(page, () => window.__app.game.stats.kills > 0);
  }
  check('combat au corps à corps', killed);

  // --- chaque écran s'ouvre et se ferme, et le mouvement n'est pas bloqué ensuite
  for (const [btn, name] of [['#m-inv', 'sac'], ['#m-craft', 'fabrication'], ['#m-build', 'construction'], ['#m-map', 'carte'], ['#m-pause', 'pause']]) {
    await page.locator(btn).click();
    await page.waitForTimeout(150);
    const open = await page.locator('#panel-layer .panel').isVisible();
    await shot(page, `paysage-panneau-${name}`);
    check(`panneau ${name} : sans débordement`, await noOverflow(page));
    await page.locator('#panel-layer .close').first().click();
    const closed = await page.locator('#panel-layer').isHidden();
    check(`panneau ${name} ouvert puis fermé`, open && closed);
  }
  for (const n of ['options', 'help', 'credits']) {
    await page.locator('#m-pause').click();
    await page.getByRole('button', { name: n === 'options' ? 'Options' : n === 'help' ? 'Commandes et règles' : 'Crédits' }).click();
    await page.waitForTimeout(100);
    await shot(page, `paysage-panneau-${n}`);
    await page.locator('#panel-layer .close').first().click();
  }
  const x0 = await G(page, () => window.__app.game.player.x);
  await touch(page, cdp, 'touchStart', [joy]);
  await touch(page, cdp, 'touchMove', [{ x: joy.x - 50, y: joy.y }]);
  await page.waitForTimeout(500);
  await touch(page, cdp, 'touchEnd', []);
  const x1 = await G(page, () => window.__app.game.player.x);
  check('mouvement possible après fermeture des menus', Math.abs(x1 - x0) > 10);

  // --- nuit
  await G(page, () => { const g = window.__app.game; g.dayTime = 500; g.lastPhase = 'night'; });
  await page.waitForTimeout(600);
  await shot(page, 'paysage-07-nuit');

  // --- sauvegarde puis rechargement fidèle
  const snap = await G(page, async () => {
    const g = window.__app.game;
    await window.__app.saveNow('manual');
    return { wood: g.player.inv.reduce((n, s) => n + (s && s.id === 'wood' ? s.qty : 0), 0), b: g.world.buildings.size, kills: g.stats.kills, x: Math.round(g.player.x) };
  });
  await page.reload();
  await page.waitForSelector('text=Continuer', { timeout: 30000 });
  await page.getByText('Continuer').click();
  await page.waitForSelector('text=Je suis prêt');
  const paused = await G(page, () => window.__app.isSimPaused());
  await page.getByText('Je suis prêt').click();
  const snap2 = await G(page, () => {
    const g = window.__app.game;
    return { wood: g.player.inv.reduce((n, s) => n + (s && s.id === 'wood' ? s.qty : 0), 0), b: g.world.buildings.size, kills: g.stats.kills, x: Math.round(g.player.x) };
  });
  check('rechargement : simulation en pause jusqu’à confirmation', paused);
  check('sauvegarde et rechargement fidèles', JSON.stringify(snap) === JSON.stringify(snap2), `${JSON.stringify(snap)} / ${JSON.stringify(snap2)}`);

  // --- victoire (scénario de test : fragments donnés, vagues abrégées)
  await G(page, () => {
    const g = window.__app.game;
    for (const o of g.world.objects.filter((x) => x.type === 'altar' && x.frag)) window.__sim.takeFragment(g, o);
    g.enemies = [];
    window.__sim.restoreSanctuary(g);
    window.__sim.startFinalAssault(g);
  });
  for (let i = 0; i < 80; i++) {
    const done = await G(page, () => {
      const g = window.__app.game;
      g.player.invuln = 2;
      for (const e of g.enemies) if (e.kind === 'final' && e.dying <= 0) { e.hp = 0; e.dying = 0.05; }
      g.final.pause = Math.min(g.final.pause, 0.1);
      return g.final.state === 'won';
    });
    if (done) break;
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(500);
  const victory = await page.locator('text=La forêt est libérée').first().isVisible();
  await shot(page, 'paysage-08-victoire');
  check('écran de victoire avec statistiques', victory);
  await page.getByText('Continuer à explorer').click();
  check('poursuite après la victoire', !(await G(page, () => window.__app.isSimPaused())));

  const real = errors.filter((e) => !/AudioContext|GPU stall|WebGL/.test(e));
  check('aucune erreur console / asset manquant (paysage)', real.length === 0, real.slice(0, 5).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ portrait
{
  const { ctx, page, errors } = await newPage({ width: 390, height: 844 });
  await page.goto(url);
  await page.waitForSelector('text=Nouvelle partie', { timeout: 30000 });
  await shot(page, 'portrait-01-titre');
  await page.getByText('Nouvelle partie').click();
  const confirm = page.getByRole('button', { name: 'Nouvelle partie' });
  if ((await confirm.count()) > 1) await confirm.last().click();
  await page.getByText('Commencer').click();
  await page.waitForTimeout(800);
  await shot(page, 'portrait-02-jeu');
  check('pas de défilement de page (portrait)', await noOverflow(page));
  // les commandes cruciales restent visibles et d'au moins 48 px CSS
  const sizes = await page.evaluate(() => ['#btn-attack', '#btn-action', '#btn-dodge', '#m-inv', '#m-craft', '#m-build', '#m-map', '#m-pause', '#quickbar .slot'].map((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { s, w: r.width, h: r.height, vis: r.bottom <= innerHeight && r.right <= innerWidth && r.top >= 0 && r.left >= 0 };
  }));
  const bad = sizes.filter((x) => x.w < 48 || x.h < 48 || !x.vis);
  check('cibles tactiles ≥ 48 px et visibles (portrait)', bad.length === 0, bad.map((b) => `${b.s} ${b.w}x${b.h}`).join(', '));
  await page.locator('#m-inv').click();
  await shot(page, 'portrait-03-sac');
  await page.locator('#panel-layer .close').first().click();
  const real = errors.filter((e) => !/AudioContext|GPU stall|WebGL/.test(e));
  check('aucune erreur console (portrait)', real.length === 0, real.slice(0, 5).join(' | '));
  await ctx.close();
}

await browser.close();
server?.kill();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies.`);
process.exit(failed.length ? 1 : 0);
