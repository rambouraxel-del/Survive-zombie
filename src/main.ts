import Phaser from 'phaser';
import './style.css';
import { App } from './app';
import { WorldScene } from './render/WorldScene';
import { loadIconAtlases } from './ui/icons';
import { canPlace, place } from './sim/actions';
import { spawnEnemy } from './sim/enemies';
import { restoreSanctuary, startFinalAssault, takeFragment } from './sim/interact';

// Densité de rendu limitée pour préserver les performances sur écrans très denses.
const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

async function boot(): Promise<void> {
  // empêche le zoom par pincement / double-tap sur iOS
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  await loadIconAtlases();
  const app = new App();
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
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  (window as unknown as { __app: App; __phaser: Phaser.Game }).__app = app;
  (window as unknown as { __app: App; __phaser: Phaser.Game }).__phaser = game;
  // accès pour les tests automatisés (scénarios de milieu et de fin de partie)
  (window as unknown as { __sim: unknown }).__sim = { canPlace, place, spawnEnemy, takeFragment, restoreSanctuary, startFinalAssault };
}

void boot();
