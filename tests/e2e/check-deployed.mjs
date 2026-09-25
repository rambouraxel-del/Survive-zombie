// Vérifie un site réellement publié (ou servi localement) :
// HTML compilé, JS/CSS/assets accessibles, écran titre, lancement d'une partie, rendu.
// Usage : node tests/e2e/check-deployed.mjs https://<compte>.github.io/<dépôt>/
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base = (process.argv[2] ?? '').replace(/\/?$/, '/');
if (!base.startsWith('http')) {
  console.error('URL manquante');
  process.exit(2);
}
const OUT = process.env.CHECK_OUT ?? 'test-results/deployed';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok, info });
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${name}${info ? ` — ${info}` : ''}`);
};

// 1. HTML publié : on attend la version compilée (la propagation Pages peut prendre un moment)
let html = '';
for (let i = 0; i < 20; i++) {
  const r = await fetch(`${base}?nocache=${Date.now()}`, { cache: 'no-store' });
  html = await r.text();
  if (r.ok && !html.includes('/src/main.ts')) break;
  console.log(`tentative ${i + 1} : HTTP ${r.status}${html.includes('/src/main.ts') ? ' (HTML source de développement servi)' : ''}`);
  await new Promise((res) => setTimeout(res, 15000));
}
check('le HTML publié n’est pas le HTML de développement', !html.includes('/src/main.ts'), html.match(/<script[^>]*>/)?.[0] ?? '');
const js = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
const css = html.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/)?.[1];
check('le HTML référence un JS compilé', !!js && /assets\/index-.*\.js$/.test(js), js ?? 'absent');
check('le HTML référence un CSS compilé', !!css && /assets\/index-.*\.css$/.test(css), css ?? 'absent');

// 2. fichiers compilés et assets sous le sous-chemin
const urls = [js, css, 'favicon.png', 'assets/atlas/world.json', 'assets/atlas/world.png', 'assets/atlas/items.png', 'assets/tiles/terrain_summer.png', 'assets/chars/player.png', 'assets/audio/music_title.mp3', 'assets/manifest.json'].filter(Boolean);
for (const u of urls) {
  const full = new URL(u, base).href;
  const r = await fetch(full);
  check(`accessible : ${u}`, r.ok, `HTTP ${r.status} ${r.headers.get('content-type') ?? ''}`);
}

// 3. navigateur : écran titre, nouvelle partie, rendu
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
await page.goto(base, { waitUntil: 'load' });
let title = false;
try {
  await page.waitForSelector('text=Nouvelle partie', { timeout: 45000 });
  title = true;
} catch { /* noté ci-dessous */ }
const styled = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check('styles CSS appliqués', styled === 'rgb(22, 18, 14)', styled);
await page.screenshot({ path: path.join(OUT, '1-titre.png') });
check('écran titre affiché', title);
if (title) {
  await page.getByText('Nouvelle partie').first().click();
  const c = page.getByRole('button', { name: 'Nouvelle partie' });
  if ((await c.count()) > 1) await c.last().click();
  await page.getByText('Commencer').click();
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => {
    const app = window.__app;
    const g = app?.game;
    const canvas = document.querySelector('#game canvas');
    return {
      canvas: !!canvas && canvas.width > 0,
      running: !!g && !app.isSimPaused(),
      clock: g?.clock ?? 0,
      objects: window.__phaser?.scene.getScene('world')?.stats?.objects ?? 0,
      hud: !document.getElementById('hud').classList.contains('hidden'),
    };
  });
  check('partie lancée et simulation active', st.running && st.clock > 1, JSON.stringify(st));
  check('scène Phaser rendue (canvas + objets du monde)', st.canvas && st.objects > 20, `objets affichés : ${st.objects}`);
  check('HUD visible', st.hud);
  // petit pixel-check : le canvas n'est pas uniforme
  const varied = await page.evaluate(() => new Promise((resolve) => {
    // capture fournie par Phaser (le tampon WebGL n'est pas conservé entre deux images)
    window.__phaser.renderer.snapshot((img) => {
      const t = document.createElement('canvas');
      t.width = 40;
      t.height = 20;
      const x = t.getContext('2d');
      x.drawImage(img, 0, 0, 40, 20);
      const d = x.getImageData(0, 0, 40, 20).data;
      const set = new Set();
      for (let i = 0; i < d.length; i += 4) set.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
      resolve(set.size);
    });
  }));
  check('image du jeu non vide (couleurs variées)', varied > 8, `${varied} teintes`);
  await page.screenshot({ path: path.join(OUT, '2-jeu.png') });
}
const real = errors.filter((e) => !/AudioContext|GPU stall|WebGL/.test(e));
check('aucune erreur console / ressource manquante', real.length === 0, real.slice(0, 5).join(' | '));
await browser.close();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ base, results }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} vérifications réussies sur ${base}`);
process.exit(failed ? 1 : 0);
