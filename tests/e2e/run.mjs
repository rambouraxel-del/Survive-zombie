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

// ouvre une entrée du menu compact (Fabriquer, Construire, Carte, Objectif, Pause)
async function viaMenu(page, label) {
  await page.locator('#m-menu').tap();
  await page.locator('.hub-btn', { hasText: label }).tap();
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
  check('identifiant de version sur l’écran titre', /Version \S+/.test((await page.locator('.screen .version').textContent()) ?? ''), (await page.locator('.screen .version').textContent()) ?? '');
  await page.getByText('Nouvelle partie').tap();
  await page.getByText('Commencer').tap();
  await page.waitForTimeout(800);
  await shot(page, 'paysage-02-depart');
  check('commandes tactiles visibles sur écran tactile', await page.locator('#btn-attack').isVisible());
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

  // --- appui très bref : appui et relâchement dans la même image, jamais perdu
  await G(page, () => {
    const g = window.__app.game;
    g.enemies = [];
    const e = window.__sim.spawnEnemy(g, 'rodeur', g.player.x + 26, g.player.y + 4, 'ambient');
    e.state = 'wander';
    g.player.attackCd = 0;
    g.player.actionT = 0;
    window.__tapE = e;
  });
  const atkC = await center(page, '#btn-attack');
  await touch(page, cdp, 'touchStart', [{ ...atkC, id: 7 }]);
  await touch(page, cdp, 'touchEnd', []);
  await page.waitForTimeout(400);
  const tapRes = await G(page, () => ({ hp: window.__tapE.hp, attack: window.__app.controls.state.attack, tap: window.__app.controls.state.attackTap }));
  check('appui bref sur « Attaque » pris en compte', tapRes.hp < 30 && !tapRes.attack && !tapRes.tap, JSON.stringify(tapRes));
  await G(page, () => { window.__app.game.enemies = []; });

  // --- appui annulé par le système (pointercancel) : rien ne reste enfoncé
  await touch(page, cdp, 'touchStart', [{ ...atkC, id: 8 }]);
  await page.waitForTimeout(100);
  await touch(page, cdp, 'touchCancel', []);
  await page.waitForTimeout(100);
  check('appui annulé : attaque relâchée', !(await G(page, () => window.__app.controls.poll().attack)));

  // --- rotation de l'écran pendant un déplacement : le joystick se relâche
  await touch(page, cdp, 'touchStart', [{ ...joy, id: 9 }]);
  await touch(page, cdp, 'touchMove', [{ x: joy.x + 50, y: joy.y, id: 9 }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
  await page.waitForTimeout(300);
  const rot = await G(page, () => window.__app.controls.poll().mx);
  await touch(page, cdp, 'touchCancel', []);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);
  check('rotation de l’écran : aucune commande bloquée', rot === 0, `mx=${rot}`);

  // --- pause pendant un appui maintenu, puis reprise : rien ne reste enfoncé
  await touch(page, cdp, 'touchStart', [{ ...joy, id: 10 }]);
  await touch(page, cdp, 'touchMove', [{ x: joy.x + 50, y: joy.y, id: 10 }]);
  await page.evaluate(() => window.__app.openPanel('pause'));
  await touch(page, cdp, 'touchEnd', []);
  await page.evaluate(() => window.__app.closePanel());
  await page.waitForTimeout(200);
  const afterPause = await G(page, () => ({ mx: window.__app.controls.poll().mx, paused: window.__app.isSimPaused() }));
  check('pause puis reprise : aucune commande bloquée', afterPause.mx === 0 && !afterPause.paused, JSON.stringify(afterPause));

  // --- fabrication via l'interface
  await G(page, () => {
    const g = window.__app.game;
    const add = (id, n) => { for (let i = 0; i < 24 && n > 0; i++) { const s = g.player.inv[i]; if (!s) { g.player.inv[i] = { id, qty: n }; n = 0; } } };
    add('wood', 40); add('stone', 20); add('fiber', 12); add('planks', 8); add('rope', 4);
    window.__app.hud.forceRefresh();
  });
  await viaMenu(page, 'Fabriquer');
  await page.waitForSelector('.recipe');
  await shot(page, 'paysage-03-fabrication');
  const axeRow = page.locator('.recipe', { hasText: 'Hache de pierre' });
  const order0 = await page.locator('#panel-layer .recipe .rname').allTextContents();
  await axeRow.getByRole('button', { name: 'Fabriquer' }).tap();
  const order1 = await page.locator('#panel-layer .recipe .rname').allTextContents();
  check('ordre des recettes inchangé après fabrication', JSON.stringify(order0.map((t) => t.split(' ')[0])) === JSON.stringify(order1.map((t) => t.split(' ')[0])));
  const axes = await G(page, () => window.__app.game.player.inv.filter((s) => s && s.id === 'stone_axe').length + (window.__app.game.player.equip.tool?.id === 'stone_axe' ? 1 : 0));
  check('fabrication via le panneau', axes === 1);
  // fiche de recette : toucher une ligne ouvre la fiche ; épingler la recette
  await page.locator('.recipe', { hasText: 'Massue' }).locator('.rmain').tap();
  await page.waitForTimeout(150);
  const sheetTxt = (await page.locator('#panel-layer .sheet').textContent()) ?? '';
  check('fiche de recette : usage, ingrédients, station, quantité, bénéfices', /Ingrédients/.test(sheetTxt) && /Station/.test(sheetTxt) && /Produit/.test(sheetTxt) && /Dégâts 15/.test(sheetTxt), sheetTxt.slice(0, 80));
  await shot(page, 'paysage-03b-fiche');
  await page.getByRole('button', { name: 'Épingler cette recette' }).tap();
  await page.locator('#panel-layer .close').first().tap();
  const pinTxt = await page.locator('#pin').textContent();
  check('recette suivie affichée en jeu', (await page.locator('#pin').isVisible()) && /Massue/.test(pinTxt ?? ''), pinTxt ?? '');
  await page.locator('#pin').tap();
  check('toucher la recette suivie ouvre sa fiche', await page.locator('#panel-layer .sheet', { hasText: 'Massue' }).isVisible());
  await page.getByRole('button', { name: 'Ne plus suivre' }).tap();
  await page.locator('#panel-layer .close').first().tap();
  check('suivi retiré', await page.locator('#pin').isHidden());

  // --- construction : feu de camp placé au doigt puis validé
  await G(page, () => {
    const g = window.__app.game;
    g.player.x = (g.world.start.x + 7.5) * 32;
    g.player.y = (g.world.start.y + 6.5) * 32;
  });
  await viaMenu(page, 'Construire');
  await page.locator('.recipe', { hasText: 'Feu de camp' }).getByRole('button', { name: 'Placer' }).tap();
  await page.waitForTimeout(200);
  // cherche une case valide en tapant autour du joueur
  let placed = false;
  for (const [dx, dy] of [[70, 40], [-70, 40], [80, -30], [-80, -40], [120, 60], [-120, 70], [0, 100]]) {
    await page.touchscreen.tap(422 + dx, 195 + dy);
    await page.waitForTimeout(120);
    if (await page.locator('#place-ok').isEnabled()) {
      await shot(page, 'paysage-04-apercu-construction');
      await page.locator('#place-ok').tap();
      placed = true;
      break;
    }
  }
  const fires = await G(page, () => [...window.__app.game.world.buildings.values()].filter((b) => b.type === 'campfire').length);
  check('construction avec aperçu et validation', placed && fires === 1, `feux=${fires}`);
  if (await page.locator('#placebar').isVisible()) await page.locator('#place-cancel').tap();

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
  for (let i = 0; i < 28 && !killed; i++) {
    await touch(page, cdp, 'touchStart', [atk2]);
    await page.waitForTimeout(250);
    if (i === 3) await shot(page, 'paysage-06-combat');
    await touch(page, cdp, 'touchEnd', []);
    await page.waitForTimeout(250);
    killed = await G(page, () => window.__app.game.stats.kills > 0);
  }
  check('combat au corps à corps', killed);

  // --- chaque écran s'ouvre et se ferme, et le mouvement n'est pas bloqué ensuite
  for (const [label, name] of [[null, 'sac'], ['Fabriquer', 'fabrication'], ['Construire', 'construction'], ['Carte', 'carte'], ['Objectif', 'objectif'], ['Pause', 'pause']]) {
    if (label) await viaMenu(page, label);
    else await page.locator('#m-inv').tap();
    await page.waitForTimeout(150);
    const open = await page.locator('#panel-layer .panel').isVisible();
    const paused = await G(page, () => window.__app.isSimPaused());
    await shot(page, `paysage-panneau-${name}`);
    check(`panneau ${name} : sans débordement, jeu en pause`, (await noOverflow(page)) && paused);
    await page.locator('#panel-layer .close').first().tap();
    const closed = await page.locator('#panel-layer').isHidden();
    check(`panneau ${name} ouvert puis fermé`, open && closed);
  }
  // l'objectif compact s'ouvre au toucher (pause pendant la lecture)
  await page.locator('#objective').tap();
  check('toucher l’objectif ouvre ses détails et met en pause', (await page.locator('#panel-layer .panel', { hasText: 'Objectif' }).isVisible()) && (await G(page, () => window.__app.isSimPaused())));
  await page.locator('#panel-layer .close').first().tap();
  for (const n of ['options', 'help', 'credits']) {
    await viaMenu(page, 'Pause');
    await page.locator('#panel-layer').getByRole('button', { name: n === 'options' ? 'Options' : n === 'help' ? 'Commandes et règles' : 'Crédits', exact: true }).tap();
    await page.waitForTimeout(100);
    await shot(page, `paysage-panneau-${n}`);
    await page.locator('#panel-layer .close').first().tap();
  }
  // --- onglets : passer du sac à la fabrication, à la construction et à la carte
  await page.locator('#m-inv').tap();
  for (const [tab, marker] of [['Fabriquer', '.recipe'], ['Construire', 'text=Gérer : réparer, améliorer ou démolir'], ['Carte', '#mapwrap'], ['Sac', '.hb-row']]) {
    await page.locator('#panel-layer .main-tabs .tab', { hasText: tab }).tap();
    await page.waitForTimeout(120);
    const loc = marker.startsWith('text=') ? page.locator('#panel-layer').getByText(marker.slice(5)) : page.locator(`#panel-layer ${marker}`);
    check(`onglet ${tab}`, await loc.first().isVisible());
  }
  // fiche d'un aliment : gain réel selon la faim ; affectation à un raccourci précis
  await G(page, () => { const g = window.__app.game; g.player.hunger = 85; g.player.inv[23] = { id: 'bread', qty: 3 }; });
  await page.locator('#panel-layer .main-tabs .tab', { hasText: 'Sac' }).tap();
  await page.locator('#panel-layer .grid .slot').nth(23).tap();
  const foodTxt = (await page.locator('#panel-layer .details').textContent()) ?? '';
  check('fiche d’aliment : gain actuel et surplus', /Gain actuel : \+1[45] faim/.test(foodTxt) && /surplus perdu : (9|10)/.test(foodTxt), foodTxt.slice(0, 120));
  await shot(page, 'paysage-sac-fiche-aliment');
  await page.locator('#panel-layer .assign button', { hasText: '5' }).tap();
  const hb5 = await G(page, () => window.__app.game.hotbar[4]);
  check('affectation à la case 5 depuis la fiche', hb5?.id === 'bread' && hb5.manual === true, JSON.stringify(hb5));
  await page.locator('#panel-layer .close').first().tap();
  check('raccourci 5 affiché avec sa quantité', /3/.test((await page.locator('#quickbar .slot').nth(4).textContent()) ?? ''));

  // --- carte : centrée, zoom lisible, zoom +/−, déplacement, recentrage, marqueur
  await viaMenu(page, 'Carte');
  await page.waitForTimeout(250);
  const m0 = await G(page, () => ({ ...window.__ui.map }));
  const pl = await G(page, () => ({ x: window.__app.game.player.x / 32, y: window.__app.game.player.y / 32 }));
  check('carte centrée sur le joueur, zoom lisible', m0.z >= 2 && Math.abs(m0.cx - pl.x) < 30 && Math.abs(m0.cy - pl.y) < 30, JSON.stringify({ z: m0.z, cx: Math.round(m0.cx), px: Math.round(pl.x) }));
  await shot(page, 'paysage-carte');
  await page.getByRole('button', { name: 'Zoom arrière' }).tap();
  const mOut = await G(page, () => ({ ...window.__ui.map }));
  await page.getByRole('button', { name: 'Zoom avant' }).tap();
  const m1 = await G(page, () => ({ ...window.__ui.map }));
  check('zoom arrière puis avant', mOut.z === m0.z - 1 && m1.z === m0.z, `${m0.z} → ${mOut.z} → ${m1.z}`);
  const wrapBox = await page.locator('#mapwrap').boundingBox();
  await touch(page, cdp, 'touchStart', [{ x: wrapBox.x + wrapBox.width / 2, y: wrapBox.y + wrapBox.height / 2, id: 11 }]);
  for (let k = 1; k <= 5; k++) await touch(page, cdp, 'touchMove', [{ x: wrapBox.x + wrapBox.width / 2 - k * 12, y: wrapBox.y + wrapBox.height / 2, id: 11 }]);
  await touch(page, cdp, 'touchEnd', []);
  const m2 = await G(page, () => ({ ...window.__ui.map }));
  const playerStill = await G(page, () => ({ x: window.__app.game.player.x / 32 }));
  check('déplacement de la carte au doigt (le personnage ne bouge pas)', m2.cx > m1.cx + 1 && Math.abs(playerStill.x - pl.x) < 0.01, JSON.stringify({ z0: m0.z, z1: m1.z, cx1: m1.cx.toFixed(1), cx2: m2.cx.toFixed(1) }));
  await page.getByRole('button', { name: 'Recentrer' }).tap();
  const m3 = await G(page, () => ({ ...window.__ui.map }));
  check('recentrage', Math.abs(m3.cx - pl.x) < 8, `${m3.cx.toFixed(1)} / ${pl.x.toFixed(1)}`);
  await page.getByRole('button', { name: 'Marquer un lieu' }).tap();
  const wb2 = await page.locator('#mapwrap').boundingBox();
  await page.touchscreen.tap(wb2.x + wb2.width / 2 + 30, wb2.y + wb2.height / 2 - 20);
  await page.waitForTimeout(150);
  await page.locator('#panel-layer .map-form .chip', { hasText: 'Danger' }).tap();
  await page.locator('#panel-layer .map-form input').fill('Brute au gué');
  await page.getByRole('button', { name: 'Ajouter' }).tap();
  const markers = await G(page, () => window.__app.game.markers.map((m) => `${m.cat}:${m.name}`));
  check('marqueur nommé et catégorisé ajouté', markers.includes('danger:Brute au gué'), markers.join(','));
  check('marqueur affiché sur la carte', await page.locator('#panel-layer .mapmark.user', { hasText: 'Brute au gué' }).isVisible());
  await shot(page, 'paysage-carte-marqueur');
  await page.locator('#panel-layer .close').first().tap();

  // --- gestion du camp : consigne adaptée (pas celle du placement)
  await page.evaluate(() => window.__app.startManage());
  const help = (await page.locator('#place-reason').textContent()) + ' ' + (await page.locator('#place-help').textContent());
  check('consigne du mode gérer (réparer / améliorer / démolir)', /construction encadrée/.test(help) && !/aperçu/.test(help), help);
  await page.locator('#place-cancel').tap();

  // --- réglages : gaucher et grands boutons, sans chevauchement
  await page.evaluate(() => { const a = window.__app; a.settings.leftHanded = true; a.settings.buttonSize = 1.25; a.settings.joySize = 1.3; a.applySettings(); });
  await page.waitForTimeout(300);
  const lefty = await page.evaluate(() => {
    const R = (s) => document.querySelector(s).getBoundingClientRect();
    const els = { quickbar: R('#quickbar'), actions: R('#action-buttons'), joy: R('#joy-base'), status: R('#status'), menu: R('#menu-buttons'), objective: R('#objective') };
    const inter = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
    const names = Object.keys(els);
    const over = [];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (inter(els[names[i]], els[names[j]])) over.push(`${names[i]}/${names[j]}`);
    return { over, joyRight: els.joy.left > innerWidth / 2, btnLeft: els.actions.right < innerWidth / 2, small: [...document.querySelectorAll('.abtn')].map((b) => b.getBoundingClientRect()).filter((r) => r.width < 48).length };
  });
  await shot(page, 'paysage-gaucher-grands-boutons');
  check('disposition gaucher et grands boutons : pas de chevauchement', lefty.over.length === 0 && lefty.joyRight && lefty.btnLeft && lefty.small === 0, JSON.stringify(lefty));
  await page.evaluate(() => { const a = window.__app; a.settings.leftHanded = false; a.settings.buttonSize = 1; a.settings.joySize = 1; a.applySettings(); });

  // (on essaie à gauche puis à droite : un obstacle peut bloquer un côté)
  let moved = 0;
  for (const dx of [-50, 50]) {
    const x0 = await G(page, () => window.__app.game.player.x);
    await touch(page, cdp, 'touchStart', [joy]);
    await touch(page, cdp, 'touchMove', [{ x: joy.x + dx, y: joy.y }]);
    await page.waitForTimeout(500);
    await touch(page, cdp, 'touchEnd', []);
    moved = Math.max(moved, Math.abs((await G(page, () => window.__app.game.player.x)) - x0));
  }
  check('mouvement possible après fermeture des menus', moved > 10, `dx=${moved.toFixed(0)}`);

  // --- nuit
  await G(page, () => { const g = window.__app.game; g.dayTime = 500; g.lastPhase = 'night'; });
  await page.waitForTimeout(600);
  await shot(page, 'paysage-07-nuit');

  // --- sauvegarde puis rechargement fidèle
  const snap = await G(page, async () => {
    const g = window.__app.game;
    await window.__app.saveNow('manual');
    return { wood: g.player.inv.reduce((n, s) => n + (s && s.id === 'wood' ? s.qty : 0), 0), b: g.world.buildings.size, kills: g.stats.kills, x: Math.round(g.player.x), hb: g.hotbar.map((h) => h?.id ?? '-').join(','), mk: g.markers.length };
  });
  await page.reload();
  await page.waitForSelector('text=Continuer', { timeout: 30000 });
  await page.getByText('Continuer', { exact: true }).tap();
  await page.waitForSelector('text=Je suis prêt');
  const paused = await G(page, () => window.__app.isSimPaused());
  await page.getByText('Je suis prêt').tap();
  const snap2 = await G(page, () => {
    const g = window.__app.game;
    return { wood: g.player.inv.reduce((n, s) => n + (s && s.id === 'wood' ? s.qty : 0), 0), b: g.world.buildings.size, kills: g.stats.kills, x: Math.round(g.player.x), hb: g.hotbar.map((h) => h?.id ?? '-').join(','), mk: g.markers.length };
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
  await page.getByText('Continuer à explorer').tap();
  check('poursuite après la victoire', !(await G(page, () => window.__app.isSimPaused())));

  const real = errors.filter((e) => !/AudioContext|GPU stall|WebGL/.test(e));
  check('aucune erreur console / asset manquant (paysage)', real.length === 0, real.slice(0, 5).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ portrait
{
  const { ctx, page, errors } = await newPage({ width: 390, height: 844 });
  // zones de sécurité d'un iPhone simulées : encoche 47 px en haut, barre d'accueil 34 px en bas
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}safe=47,34,0,0`);
  await page.evaluate(() => localStorage.removeItem('bdc-joy-hint'));
  await page.waitForSelector('text=Nouvelle partie', { timeout: 30000 });
  await shot(page, 'portrait-01-titre');
  await page.getByText('Nouvelle partie').tap();
  const confirm = page.getByRole('button', { name: 'Nouvelle partie' });
  if ((await confirm.count()) > 1) await confirm.last().tap();
  await page.getByText('Commencer').tap();
  await page.waitForTimeout(800);
  await shot(page, 'portrait-02-jeu');
  check('pas de défilement de page (portrait)', await noOverflow(page));
  // les commandes cruciales restent visibles et d'au moins 48 px CSS
  const sizes = await page.evaluate(() => ['#btn-attack', '#btn-action', '#btn-dodge', '#m-inv', '#m-menu', '#objective', '#quickbar .slot'].map((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { s, w: r.width, h: r.height, vis: r.bottom <= innerHeight && r.right <= innerWidth && r.top >= 0 && r.left >= 0 };
  }));
  const bad = sizes.filter((x) => x.w < 48 || x.h < 48 || !x.vis);
  check('cibles tactiles ≥ 48 px et visibles (portrait)', bad.length === 0, bad.map((b) => `${b.s} ${b.w}x${b.h}`).join(', '));
  // disposition : rien ne se chevauche, tout reste hors des zones de sécurité
  const lay = await page.evaluate(() => {
    const R = (s) => document.querySelector(s).getBoundingClientRect();
    const els = { quickbar: R('#quickbar'), actions: R('#action-buttons'), joy: R('#joy-base'), status: R('#status'), objective: R('#objective'), menu: R('#menu-buttons') };
    const inter = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
    const names = Object.keys(els);
    const over = [];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (inter(els[names[i]], els[names[j]])) over.push(`${names[i]}/${names[j]}`);
    const unsafe = names.filter((n) => els[n].top < 47 || els[n].bottom > innerHeight - 34);
    return { over, unsafe };
  });
  check('aucun chevauchement entre barre rapide, boutons, joystick et HUD (portrait)', lay.over.length === 0, lay.over.join(', '));
  check('HUD et commandes hors encoche et barre d’accueil (portrait)', lay.unsafe.length === 0, lay.unsafe.join(', '));
  // personnage dégagé : aucun élément d'interface sur lui
  const hits = await page.evaluate(() => {
    const cam = window.__phaser.scene.getScene('world').cameras.main;
    const p = window.__app.game.player;
    const k = cam.zoom / Math.min(devicePixelRatio || 1, 2);
    const sx = (p.x - cam.worldView.x) * k;
    const sy = (p.y - cam.worldView.y) * k;
    const box = { l: sx - 32 * k, r: sx + 32 * k, t: sy - 56 * k, b: sy + 16 * k };
    const out = [];
    for (const el of document.querySelectorAll('#hud > *, #quickbar, #action-buttons, #joy-base, #placebar')) {
      const r = el.getBoundingClientRect();
      if (!r.width || el.classList.contains('hidden')) continue;
      if (r.right > box.l && r.left < box.r && r.bottom > box.t && r.top < box.b) out.push(el.id);
    }
    return out;
  });
  check('personnage non recouvert par l’interface (portrait)', hits.length === 0, hits.join(', '));

  // multitouch en portrait : joystick + attaque simultanés, puis l'aide du joystick disparaît
  const cdp = await ctx.newCDPSession(page);
  const jb = await center(page, '#joy-base');
  const atk = await center(page, '#btn-attack');
  const x0 = await G(page, () => window.__app.game.player.x);
  await touch(page, cdp, 'touchStart', [{ ...jb, id: 1 }]);
  await touch(page, cdp, 'touchMove', [{ x: jb.x + 50, y: jb.y, id: 1 }]);
  await touch(page, cdp, 'touchStart', [{ x: jb.x + 50, y: jb.y, id: 1 }, { ...atk, id: 2 }]);
  await page.waitForTimeout(500);
  const dur = await G(page, () => ({ x: window.__app.game.player.x, cd: window.__app.game.player.attackCd, t: window.__app.game.player.actionT }));
  await touch(page, cdp, 'touchEnd', [{ x: jb.x + 50, y: jb.y, id: 1 }]);
  check('multitouch portrait : marcher et attaquer en même temps', dur.x > x0 + 8 && (dur.cd > 0 || dur.t > 0), `dx=${(dur.x - x0).toFixed(0)}`);
  await touch(page, cdp, 'touchStart', [{ ...jb, id: 3 }]);
  await touch(page, cdp, 'touchMove', [{ x: jb.x - 50, y: jb.y, id: 3 }]);
  await page.waitForTimeout(2800);
  await touch(page, cdp, 'touchEnd', []);
  await page.waitForTimeout(300);
  const hint = await page.evaluate(() => ({ hidden: getComputedStyle(document.getElementById('joy-hint')).display === 'none' || document.getElementById('joy-hint').classList.contains('hidden'), saved: JSON.parse(localStorage.getItem('bdc-settings') ?? '{}').learned?.includes('joystick') ?? false }));
  check('aide « Glissez pour marcher » masquée après les premiers déplacements (mémorisé)', hint.hidden && hint.saved === true, JSON.stringify(hint));

  await page.locator('#m-inv').tap();
  await shot(page, 'portrait-03-sac');
  await page.locator('#panel-layer .close').first().tap();
  const real = errors.filter((e) => !/AudioContext|GPU stall|WebGL/.test(e));
  check('aucune erreur console (portrait)', real.length === 0, real.slice(0, 5).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ téléphone étroit
{
  const { ctx, page, errors } = await newPage({ width: 360, height: 640 });
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}safe=24,0,0,0`);
  await page.waitForSelector('text=Nouvelle partie', { timeout: 30000 });
  await page.getByText('Nouvelle partie').tap();
  await page.getByText('Commencer').tap();
  await page.waitForTimeout(800);
  await shot(page, 'etroit-01-jeu');
  const lay = await page.evaluate(() => {
    const R = (s) => document.querySelector(s).getBoundingClientRect();
    const els = { quickbar: R('#quickbar'), actions: R('#action-buttons'), joy: R('#joy-base'), status: R('#status'), objective: R('#objective'), menu: R('#menu-buttons') };
    const inter = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
    const names = Object.keys(els);
    const over = [];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (inter(els[names[i]], els[names[j]])) over.push(`${names[i]}/${names[j]}`);
    const small = ['#btn-attack', '#btn-action', '#btn-dodge', '#m-inv', '#m-menu', '#objective', '#quickbar .slot'].filter((q) => { const r = R(q); return r.width < 48 || r.height < 48; });
    return { over, small };
  });
  check('téléphone étroit 360×640 : pas de chevauchement, cibles ≥ 48 px', lay.over.length === 0 && lay.small.length === 0 && (await noOverflow(page)), JSON.stringify(lay));
  await page.locator('#m-inv').tap();
  check('téléphone étroit : panneau sans débordement', await noOverflow(page));
  await shot(page, 'etroit-02-sac');
  const real = errors.filter((e) => !/AudioContext|GPU stall|WebGL/.test(e));
  check('aucune erreur console (étroit)', real.length === 0, real.slice(0, 5).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ ordinateur (clavier) et appareil hybride
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector('text=Nouvelle partie', { timeout: 30000 });
  await page.getByText('Nouvelle partie').click();
  await page.getByText('Commencer').click();
  await page.waitForTimeout(800);
  await shot(page, 'ordinateur-01-jeu');
  const kbdUi = await page.evaluate(() => ({ joy: getComputedStyle(document.getElementById('joy-zone')).display, btn: getComputedStyle(document.getElementById('action-buttons')).display, hints: getComputedStyle(document.getElementById('kbd-hints')).display }));
  check('ordinateur : commandes tactiles masquées, raccourcis clavier affichés', kbdUi.joy === 'none' && kbdUi.btn === 'none' && kbdUi.hints !== 'none', JSON.stringify(kbdUi));
  const x0 = await G(page, () => window.__app.game.player.x);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyD');
  const x1 = await G(page, () => window.__app.game.player.x);
  check('ordinateur : déplacement au clavier', x1 > x0 + 10, `dx=${(x1 - x0).toFixed(0)}`);
  await page.keyboard.press('KeyC');
  check('ordinateur : touche C ouvre la fabrication', await page.locator('#panel-layer .recipe').first().isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  // appareil hybride : un toucher de l'écran fait réapparaître les commandes tactiles
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 640, y: 300, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  const touchUi = await page.evaluate(() => getComputedStyle(document.getElementById('action-buttons')).display);
  check('appareil hybride : le toucher réaffiche les commandes tactiles', touchUi !== 'none', touchUi);
  await page.keyboard.press('KeyW');
  await page.waitForTimeout(100);
  check('appareil hybride : le clavier les masque de nouveau', (await page.evaluate(() => getComputedStyle(document.getElementById('action-buttons')).display)) === 'none');
  const real = errors.filter((e) => !/AudioContext|GPU stall|WebGL/.test(e));
  check('aucune erreur console (ordinateur)', real.length === 0, real.slice(0, 5).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ ancienne sauvegarde (v1)
{
  const { ctx, page, errors } = await newPage({ width: 844, height: 390 });
  const v1 = fs.readFileSync('tests/fixtures/v1-milieu.json', 'utf8');
  await page.addInitScript((data) => {
    if (!sessionStorage.getItem('v1-set')) {
      localStorage.setItem('bdc-save-current', data);
      sessionStorage.setItem('v1-set', '1');
    }
  }, v1);
  await page.goto(url);
  await page.waitForSelector('text=Continuer', { timeout: 30000 });
  await page.getByText('Continuer', { exact: true }).tap();
  await page.waitForSelector('text=Je suis prêt');
  const msg = (await page.locator('.screen .card p').first().textContent()) ?? '';
  check('ancienne sauvegarde : reprise annoncée, monde conservé', /Jour 2/.test(msg) && /monde est conservé/.test(msg), msg.slice(0, 120));
  await page.getByText('Je suis prêt').tap();
  await page.waitForTimeout(600);
  const st = await G(page, () => {
    const g = window.__app.game;
    return { day: g.day, hb: g.hotbar.map((h) => h?.id ?? '-'), obj: document.getElementById('obj-title').textContent, gen: g.genVersion, b: g.world.buildings.size };
  });
  check('ancienne sauvegarde : raccourcis utiles créés, pas d’introduction imposée', st.hb.includes('berries') && !st.hb.includes('wood') && /abri/.test(st.obj) && st.gen === 1 && st.b === 6, JSON.stringify(st));
  await shot(page, 'ancienne-sauvegarde');
  const real = errors.filter((e) => !/AudioContext|GPU stall|WebGL/.test(e));
  check('aucune erreur console (ancienne sauvegarde)', real.length === 0, real.slice(0, 5).join(' | '));
  await ctx.close();
}

await browser.close();
server?.kill();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies.`);
process.exit(failed.length ? 1 : 0);
