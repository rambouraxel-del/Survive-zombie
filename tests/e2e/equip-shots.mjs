// Vérification visuelle de l'équipement porté : chaque arme / outil / protection dans
// plusieurs directions et moments d'animation, recadré et agrandi autour du personnage.
// Usage : node tests/e2e/equip-shots.mjs <url> <fichier.png>
import fs from 'node:fs';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4183/';
const out = process.argv[3] ?? 'test-results/equip.png';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(url);
await page.waitForSelector('text=Nouvelle partie', { timeout: 60000 });
await page.getByText('Nouvelle partie').first().click();
await page.getByText('Commencer').click();
await page.waitForTimeout(800);
await page.evaluate(() => {
  const g = window.__app.game;
  g.enemies = [];
  g.player.x = (g.world.start.x + 0.5) * 32;
  g.player.y = (g.world.start.y + 0.5) * 32;
  document.getElementById('ui').style.display = 'none';
});
const cases = [
  ['stone_axe', 'tool', 'idle'], ['stone_axe', 'tool', 'chop'], ['stone_hammer', 'tool', 'chop'], ['iron_pick', 'tool', 'walk'],
  ['spear', 'weapon', 'idle'], ['spear', 'weapon', 'thrust'], ['club', 'weapon', 'slash'], ['sword', 'weapon', 'walk'],
  ['sword', 'weapon', 'slash'], ['bow', 'weapon', 'walk'], ['bow', 'weapon', 'shoot'], ['gambison', 'armor', 'walk'], ['brigandine', 'armor', 'slash'],
];
const tiles = [];
for (const [id, slot, act] of cases) {
  for (const facing of ['down', 'right', 'up', 'left']) {
    await page.evaluate(({ id, slot, act, facing }) => {
      const p = window.__app.game.player;
      p.equip = { weapon: null, tool: null, armor: null };
      p.equip[slot] = { id, qty: 1, dur: 50 };
      if (slot === 'armor') p.equip.weapon = { id: 'spear', qty: 1, dur: 50 };
      p.facing = facing;
      p.moving = false;
      p.action = 'none';
      p.actionT = 0;
      window.__demo = { act };
    }, { id, slot, act, facing });
    // action : on fige l'animation au milieu
    await page.evaluate(({ act }) => {
      const p = window.__app.game.player;
      if (act === 'walk') p.moving = true;
      else if (act !== 'idle') {
        p.action = act;
        p.actionT = 5;
        p.actionItem = p.equip.weapon?.id ?? p.equip.tool?.id ?? null;
      }
      window.__app.controls.reset();
    }, { act });
    await page.waitForTimeout(act === 'idle' ? 120 : 230);
    const pos = await page.evaluate(() => {
      const cam = window.__phaser.scene.getScene('world').cameras.main;
      const p = window.__app.game.player;
      return { x: (p.x - cam.worldView.x) * cam.zoom, y: (p.y - cam.worldView.y) * cam.zoom, z: cam.zoom };
    });
    const shot = await page.screenshot({ clip: { x: pos.x - 40 * pos.z, y: pos.y - 70 * pos.z, width: 80 * pos.z, height: 90 * pos.z } });
    tiles.push(shot);
  }
}
fs.mkdirSync('test-results', { recursive: true });
// assemblage par le navigateur (canvas) pour éviter une dépendance
const b64 = tiles.map((t) => t.toString('base64'));
const sheet = await page.evaluate(async (list) => {
  const cols = 8;
  const c = document.createElement('canvas');
  c.width = cols * 160;
  c.height = Math.ceil(list.length / cols) * 180;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  for (let i = 0; i < list.length; i++) {
    const img = new Image();
    img.src = `data:image/png;base64,${list[i]}`;
    await img.decode();
    x.drawImage(img, (i % cols) * 160, Math.floor(i / cols) * 180, 160, 180);
  }
  return c.toDataURL('image/png').split(',')[1];
}, b64);
fs.writeFileSync(out, Buffer.from(sheet, 'base64'));
console.log('planche :', out);
await browser.close();
