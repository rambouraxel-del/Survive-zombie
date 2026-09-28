import Phaser from 'phaser';
import './style.css';
import { App } from './app';
import { WorldScene } from './render/WorldScene';
import { loadIconAtlases } from './ui/icons';
import { canPlace, chooseStarter, craft, place } from './sim/actions';
import { spawnEnemy } from './sim/enemies';
import { killPlayer, respawn, returnToCamp, startExpedition } from './sim/travel';
import { perf } from './render/perf';
import { deserialize } from './save/serialize';
import { ui } from './ui/panels';

// Densité de rendu limitée pour préserver les performances sur écrans très denses ;
// réduite à 1 en qualité « économie » ou si le jeu n'est pas fluide (qualité automatique).
let appRef: App | null = null;
const dpr = () => (appRef?.renderLow ? 1 : Math.min(window.devicePixelRatio || 1, 2));

async function boot(): Promise<void> {
  // Test des encoches : ?safe=haut,bas,gauche,droite (px CSS) simule les zones de sécurité d'un iPhone
  const safe = new URLSearchParams(location.search).get('safe');
  if (safe) {
    const [t, b, l, r] = safe.split(',').map((v) => `${Number(v) || 0}px`);
    const st = document.documentElement.style;
    st.setProperty('--sat', t);
    st.setProperty('--sab', b ?? '0px');
    st.setProperty('--sal', l ?? '0px');
    st.setProperty('--sar', r ?? '0px');
  }
  // empêche le zoom par pincement / double-tap sur iOS
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  await loadIconAtlases();
  const app = new App();
  appRef = app;
  const parent = document.getElementById('game')!;
  const size = () => ({ w: Math.floor(window.innerWidth * dpr()), h: Math.floor(window.innerHeight * dpr()) });
  const s = size();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: s.w,
    height: s.h,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#16120e',
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr() },
    audio: { disableWebAudio: false },
    input: { activePointers: 4 },
    fps: { target: 60, smoothStep: true },
    scene: [],
  });
  game.scene.add('world', WorldScene, true, { host: app });
  const resize = () => {
    const n = size();
    game.scale.resize(n.w, n.h);
    game.scale.setZoom(1 / dpr());
  };
  window.addEventListener('resize', resize);
  app.onResolutionChange = resize;
  if (app.renderLow) resize();
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  (window as unknown as { __app: App; __phaser: Phaser.Game }).__app = app;
  (window as unknown as { __app: App; __phaser: Phaser.Game }).__phaser = game;
  // accès pour les tests automatisés (scénarios de milieu et de fin de partie)
  (window as unknown as { __perf: unknown }).__perf = perf;
  (window as unknown as { __ui: unknown }).__ui = ui;
  (window as unknown as { __sim: unknown }).__sim = { canPlace, place, craft, chooseStarter, spawnEnemy, startExpedition, returnToCamp, killPlayer, respawn, deserialize };
}

void boot();
