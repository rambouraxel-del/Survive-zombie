// Contrôleur de l'application : écrans, cycle de partie, panneaux, sauvegarde.
import { TILE } from './config/balance';
import { AudioManager } from './audio/audio';
import { BUILDING_BY_ID } from './data/buildings';
import { Controls, type InputKind } from './input/controls';
import type { WorldScene, SceneHost } from './render/WorldScene';
import { deserialize, serialize, validateSave } from './save/serialize';
import { clearSaves, hasSave, loadSave, writeSave } from './save/storage';
import { loadSettings, saveSettings, type Settings } from './settings';
import { canPlace, place, useHotbar } from './sim/actions';
import { Game } from './sim/game';
import { selectTargetAt } from './sim/interact';
import { skipIntro } from './sim/objectives';
import { item } from './data/items';
import type { GameEvent, InputState } from './sim/types';
import { $, clear, h } from './ui/dom';
import { Hud } from './ui/hud';
import { icon } from './ui/icons';
import * as P from './ui/panels';
import { perf } from './render/perf';
import type { Station } from './data/items';

type Overlay = null | 'title' | 'gate' | 'death' | 'victory' | 'loading';

/** Identifiant de version injecté au build (commit + date), pour diagnostiquer les caches. */
declare const __APP_VERSION__: string;
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export class App implements P.PanelHost, SceneHost {
  settings: Settings = loadSettings();
  audio = new AudioManager(this.settings);
  controls: Controls;
  hud: Hud | null = null;
  scene: WorldScene | null = null;
  private g: Game | null = null;
  private modal: string | null = null;
  private overlay: Overlay = 'loading';
  private hidden = false;
  private saving = false;
  private titleGame: Game | null = null;
  private fpsAvg = 60;
  private debugT = 0;
  private fireT = 0;
  private layoutT = 0;
  private movedFor = 0;
  private joyHintDone = false;
  readonly version = APP_VERSION;
  /** résolution réduite automatiquement (qualité « automatique ») */
  lowRes = false;
  private slowFor = 0;
  onResolutionChange: (() => void) | null = null;
  private collect: { el: HTMLElement; items: Map<string, number>; t: number } | null = null;

  constructor() {
    this.controls = new Controls(document.body, {
      onQuickSlot: (i) => this.quickSlot(i),
      onShortcut: (n) => this.shortcut(n),
      isBlocked: () => this.isSimPaused(),
      onInputKind: (k) => this.onInputKind(k),
    });
    this.applySettings(false);
    this.onInputKind(matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse');
    this.bindStaticUi();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.onHidden();
      else this.onVisible();
    });
    window.addEventListener('pagehide', () => this.onHidden());
    window.addEventListener('keydown', (e) => this.onPlacementKey(e));
    this.showLoading();
  }

  get game(): Game {
    return this.g ?? this.titleGame!;
  }

  // ------------------------------------------------------------ SceneHost
  isSimPaused(): boolean {
    return !this.g || !!this.modal || this.overlay !== null || this.hidden || !!this.scene?.placing || !!this.scene?.managing;
  }

  pollInput(): InputState {
    return this.controls.poll();
  }

  reduceShake(): boolean {
    return this.settings.reduceShake;
  }

  debug(): boolean {
    return this.settings.debug;
  }

  onLoadProgress(p: number): void {
    const bar = document.querySelector<HTMLElement>('#loadbar > div');
    if (bar) bar.style.width = `${Math.round(p * 100)}%`;
  }

  onSceneReady(scene: WorldScene): void {
    this.scene = scene;
    this.audio.attach(scene.sound);
    this.hud = new Hud();
    this.hud.onQuickSlot = (i) => this.quickSlot(i);
    void this.showTitle();
  }

  onGameEvent(e: GameEvent): void {
    const g = this.g;
    if (!g) return;
    switch (e.type) {
      case 'sound': {
        const d = e.x !== undefined && e.y !== undefined ? Math.hypot(e.x - g.player.x, e.y - g.player.y) : 0;
        this.audio.play(e.key, d);
        break;
      }
      case 'toast':
        this.toast(e.text, e.kind);
        break;
      case 'objective':
        this.hud?.forceRefresh();
        break;
      case 'collect':
        this.collectToast(e.id, e.n);
        break;
      case 'hint':
        this.hint(e.id, e.text);
        break;
      case 'save':
        void this.saveNow(e.reason);
        break;
      case 'ui':
        this.openPanel(e.panel, e.ref);
        break;
      case 'death':
        this.showDeath(e.reason, e.lost, e.hasBag, e.atBed);
        break;
      case 'victory':
        this.showVictory();
        break;
      default:
        break;
    }
  }

  onFrame(dt: number, fps: number): void {
    const g = this.g;
    if (!g) {
      // écran titre : lent travelling sur une forêt générée
      if (this.scene && this.titleGame) {
        const cam = this.scene.cameras.main;
        cam.scrollX += dt * 12;
        if (cam.scrollX > this.titleGame.world.w * TILE - cam.width) cam.scrollX = 0;
      }
      return;
    }
    this.fpsAvg = this.fpsAvg * 0.95 + fps * 0.05;
    this.hud?.update(g, dt);
    this.updateJoyHint(dt);
    this.watchPerformance(dt, fps);
    this.layoutT -= dt;
    if (this.layoutT <= 0) {
      this.layoutT = 1;
      this.measureInsets();
    }
    // musique selon le moment
    const night = g.isDark() || g.final.state === 'active';
    this.audio.setMusic(night ? 'music_night' : 'music_day');
    this.fireT -= dt;
    if (this.fireT <= 0) {
      this.fireT = 0.25;
      let best = 99999;
      for (const b of g.world.buildings.values()) {
        if (b.type !== 'campfire') continue;
        const c = g.world.buildingCenter(b);
        best = Math.min(best, Math.hypot(c.x - g.player.x, c.y - g.player.y));
      }
      this.audio.setFireLevel(Math.max(0, 1 - best / (6 * TILE)));
    }
    if (this.scene?.placing) this.updatePlaceBar();
    const dbg = $('#debug');
    dbg.classList.toggle('hidden', !this.settings.debug);
    this.debugT -= dt;
    if (this.settings.debug && this.debugT <= 0) {
      this.debugT = 0.25;
      const st = this.scene?.stats;
      const tx = Math.floor(g.player.x / TILE);
      const ty = Math.floor(g.player.y / TILE);
      const pf = perf.summary();
      dbg.textContent = [
        `FPS ${this.fpsAvg.toFixed(0)}${this.lowRes ? ' (résolution réduite)' : ''}`,
        `ms/image : simulation ${pf.sim.avg} · scène ${pf.scene.avg} · rendu ${pf.render.avg} · interface ${pf.ui.avg}`,
        `Ennemis actifs ${g.enemies.length} (dessinés ${st?.enemiesDrawn ?? 0})`,
        `Objets affichés ${st?.objects ?? 0}`,
        `Graine ${g.world.seed}`,
        `Tuile ${tx},${ty} · ${g.world.zoneAt(tx, ty)}`,
        `Jour ${g.day} t=${g.dayTime.toFixed(0)} · ${g.phase()}`,
        `Horde ${g.assault ? `${g.assault.spawned}/${g.assault.total}${g.assault.done ? ' ✓' : ''}` : '-'}`,
        `Final ${g.final.state} v${g.final.wave}`,
      ].join('\n');
    }
  }

  onPlacementPointer(tx: number, ty: number): void {
    if (!this.scene?.placing) return;
    this.scene.placing.tx = tx;
    this.scene.placing.ty = ty;
  }

  onManagePointer(tx: number, ty: number): void {
    const b = this.g?.world.buildingAtTile(tx, ty);
    if (b) this.openPanel('manage', String(b.id));
  }

  /** Toucher un objet proche le choisit comme cible, sans déplacer le personnage. */
  onWorldTap(wx: number, wy: number): void {
    const g = this.g;
    if (!g || this.isSimPaused()) return;
    if (selectTargetAt(g, wx, wy)) this.sfx('click');
  }

  // ------------------------------------------------------------ interface statique
  private bindStaticUi(): void {
    $('#m-inv').addEventListener('click', () => this.shortcut('inventory'));
    $('#m-menu').addEventListener('click', () => this.shortcut('hub'));
    $('#objective').addEventListener('click', () => this.shortcut('objective'));
    $('#pin').addEventListener('click', () => {
      if (!this.g || this.overlay || this.scene?.placing || this.scene?.managing) return;
      if (this.g.pinned) {
        P.ui.craft.sheet = this.g.pinned;
        this.openPanel('craft', 'keep');
      }
    });
    if (this.settings.learned.includes('joystick')) {
      $('#joy-hint').classList.add('hidden');
      this.joyHintDone = true;
    }
    $('#place-cancel').addEventListener('click', () => this.stopPlacement());
    $('#place-ok').addEventListener('click', () => this.confirmPlacement());
    ($('#place-rot') as HTMLButtonElement).disabled = true;
  }

  private shortcut(n: 'inventory' | 'craft' | 'build' | 'map' | 'pause' | 'hub' | 'objective'): void {
    if (!this.g || this.overlay) return;
    if (this.scene?.placing || this.scene?.managing) {
      if (n === 'pause') this.stopPlacement();
      return;
    }
    if (this.modal) {
      this.closePanel();
      if (n === 'pause') return;
    }
    this.sfx('open');
    this.openPanel(n === 'inventory' ? 'inventory' : n);
  }

  private quickSlot(i: number): void {
    const g = this.g;
    if (!g || this.isSimPaused()) return;
    const r = useHotbar(g, i);
    if (r.empty) {
      // raccourci vide : on propose directement d'y placer un objet du sac
      P.ui.inv.pickFor = i;
      P.ui.inv.sel = null;
      P.ui.inv.hbSel = null;
      this.openPanel('inventory');
      return;
    }
    this.hud?.forceRefresh();
  }

  // ------------------------------------------------------------ panneaux
  openPanel(name: string, ref?: string): void {
    const layer = $('#panel-layer');
    if (name === 'none' || (!this.g && !['options', 'help', 'credits'].includes(name))) {
      this.closePanel();
      return;
    }
    let el: HTMLElement;
    switch (name) {
      case 'inventory':
      case 'build':
      case 'map':
        if (name !== this.modal) this.resetTabState(name);
        el = P.managePanelTabs(this, name);
        break;
      case 'craft':
        // depuis une station : filtre sur cette station ; « keep » : fiche déjà choisie
        if (ref && ref !== 'keep') {
          P.ui.craft.filter = ref as Station | 'all';
          P.ui.craft.sheet = null;
        } else if (!ref && name !== this.modal) P.ui.craft.sheet = null;
        el = P.managePanelTabs(this, 'craft');
        break;
      case 'manage':
        el = P.managePanel(this, Number(ref));
        break;
      case 'container':
        el = P.containerPanel(this);
        break;
      case 'pause':
        el = P.pausePanel(this);
        break;
      case 'options':
        el = P.optionsPanel(this);
        break;
      case 'help':
        el = P.helpPanel(this);
        break;
      case 'credits':
        el = P.creditsPanel(this);
        break;
      case 'note':
        el = P.notePanel(this, ref ?? '');
        break;
      case 'bed':
        el = P.bedPanel(this);
        break;
      case 'sanctuary':
        el = P.sanctuaryPanel(this);
        break;
      case 'hub':
        el = P.hubPanel(this);
        break;
      case 'objective':
        el = P.objectivePanel(this);
        break;
      default:
        return;
    }
    this.controls.reset();
    // défilement conservé quand on réaffiche le même panneau
    const prevScroll = name === this.modal ? (layer.querySelector('.pbody') as HTMLElement | null)?.scrollTop ?? 0 : 0;
    this.modal = name;
    clear(layer);
    layer.append(el);
    const nb = layer.querySelector('.pbody') as HTMLElement | null;
    if (nb && prevScroll) nb.scrollTop = prevScroll;
    layer.classList.remove('hidden');
    layer.classList.toggle('anchored', name === 'hub');
    layer.onclick = (e) => {
      if (e.target === layer) this.closePanel();
    };
  }

  private resetTabState(name: string): void {
    if (name === 'inventory') {
      const keepPick = P.ui.inv.pickFor;
      P.ui.inv = { sel: null, moving: null, hbSel: null, pickFor: keepPick, hbMove: null };
    }
    if (name === 'map') {
      P.ui.map.init = false;
      P.ui.map.w = 0;
      P.ui.map.marking = false;
      P.ui.map.draft = null;
      P.ui.map.selected = null;
    }
  }

  closePanel(): void {
    P.ui.inv.pickFor = null;
    const layer = $('#panel-layer');
    clear(layer);
    layer.classList.add('hidden');
    if (this.modal === 'container' && this.g) this.g.openContainer = null;
    this.modal = null;
    this.controls.reset();
    this.hud?.forceRefresh();
  }

  confirm(text: string, ok: string, onOk: () => void): void {
    const prev = this.modal;
    const layer = $('#panel-layer');
    clear(layer);
    layer.append(P.confirmPanel(this, text, ok, () => { onOk(); }, () => (prev && this.g ? this.openPanel(prev) : this.closePanel())));
    layer.classList.remove('hidden');
    this.modal = 'confirm';
  }

  sfx(key: string): void {
    this.audio.play(key);
  }

  applySettings(save = true): void {
    const s = this.settings;
    if (save) saveSettings(s);
    this.audio.refreshVolumes();
    const st = document.documentElement.style;
    st.setProperty('--joy-scale', String(s.joySize));
    st.setProperty('--joy-opacity', String(s.joyOpacity));
    st.setProperty('--btn-scale', String(s.buttonSize));
    document.body.classList.toggle('lefty', s.leftHanded);
    this.controls.joyRadius = 56 * s.joySize;
    this.updateControlMode();
    const wantLow = s.quality === 'eco' || (s.quality === 'auto' && this.lowRes);
    if (wantLow !== this.renderLow) {
      this.renderLow = wantLow;
      this.onResolutionChange?.();
    }
    this.layoutT = 0.05;
  }

  /** Résolution de rendu réduite (qualité économie, ou baisse automatique). */
  renderLow = false;

  /** Qualité automatique : si le jeu reste saccadé plusieurs secondes, la résolution baisse. */
  private watchPerformance(dt: number, fps: number): void {
    if (this.settings.quality !== 'auto' || this.lowRes || this.isSimPaused()) return;
    if ((window.devicePixelRatio || 1) <= 1.01) return;
    if (fps > 0 && fps < 24) this.slowFor += dt;
    else this.slowFor = Math.max(0, this.slowFor - dt * 0.5);
    if (this.slowFor > 6) {
      this.lowRes = true;
      this.applySettings(false);
      this.toast('Affichage allégé pour gagner en fluidité (Options → Affichage).', 'info');
    }
  }

  private inputKind: InputKind = 'touch';

  private onInputKind(k: InputKind): void {
    this.inputKind = k;
    this.updateControlMode();
  }

  /** Commandes tactiles visibles seulement quand elles servent (appareils hybrides compris). */
  private updateControlMode(): void {
    const m = this.settings.controlMode;
    const kbd = m === 'keyboard' || (m === 'auto' && this.inputKind !== 'touch');
    if (document.body.classList.contains('kbd-mode') !== kbd) {
      document.body.classList.toggle('kbd-mode', kbd);
      this.layoutT = 0.05;
    }
  }

  resetTips(): void {
    this.settings.learned = [];
    this.joyHintDone = false;
    this.movedFor = 0;
    $('#joy-hint').classList.remove('hidden');
    this.applySettings();
  }

  skipIntro(): void {
    if (!this.g) return;
    skipIntro(this.g);
    this.hud?.forceRefresh();
    this.toast('Introduction passée. Objectif suivant affiché en haut.', 'info');
    void this.saveNow('skip');
  }

  /** Aide élémentaire : affichée une seule fois (réactivable dans les options). */
  private hint(id: string, text: string): void {
    if (!this.settings.showHints || this.settings.learned.includes(id)) return;
    this.settings.learned.push(id);
    saveSettings(this.settings);
    this.toast(text, 'tip');
  }

  /** Ressources obtenues : un seul message regroupé, mis à jour, sans accumulation. */
  private collectToast(id: string, n: number): void {
    const now = performance.now();
    const box = $('#toasts');
    if (!this.collect || now - this.collect.t > 2500 || !this.collect.el.isConnected) {
      const el = h('div', { class: 'toast good collect' });
      box.append(el);
      while (box.children.length > 4) box.firstChild?.remove();
      this.collect = { el, items: new Map(), t: now };
    }
    const c = this.collect;
    c.t = now;
    c.items.set(id, (c.items.get(id) ?? 0) + n);
    const g = this.g;
    c.el.textContent = [...c.items].map(([k, v]) => `+${v} ${item(k).name}${g ? ` (${g.player.inv.reduce((s, x) => s + (x && x.id === k ? x.qty : 0), 0)})` : ''}`).join(' · ');
    c.el.classList.remove('out');
    clearTimeout(Number(c.el.dataset.t1));
    clearTimeout(Number(c.el.dataset.t2));
    c.el.dataset.t1 = String(window.setTimeout(() => c.el.classList.add('out'), 2600));
    c.el.dataset.t2 = String(window.setTimeout(() => c.el.remove(), 3100));
  }

  // ------------------------------------------------------------ construction
  startPlacement(type: string): void {
    this.layoutT = 0.05;
    const g = this.g;
    if (!g || !this.scene) return;
    this.closePanel();
    const d = BUILDING_BY_ID[type];
    const tx = Math.floor((g.player.x + g.player.aimX * 2 * TILE) / TILE - (d.w - 1) / 2);
    const ty = Math.floor((g.player.y + g.player.aimY * 2 * TILE) / TILE - (d.h - 1) / 2);
    this.scene.placing = { type, tx, ty };
    this.scene.managing = false;
    this.controls.reset();
    $('#controls').classList.add('hidden');
    $('#placebar').classList.remove('hidden');
    $('#place-ok').classList.remove('hidden');
    $('#place-name').textContent = `Placer : ${d.name}`;
    $('#place-help').textContent = document.body.classList.contains('kbd-mode')
      ? 'Flèches ou ZQSD : déplacer l’aperçu · Entrée : valider · Échap : annuler. La souris déplace aussi l’aperçu.'
      : 'Touchez ou glissez sur la carte pour déplacer l’aperçu (il s’affiche au-dessus du doigt).';
    this.updatePlaceBar();
  }

  startManage(): void {
    this.layoutT = 0.05;
    if (!this.scene) return;
    this.closePanel();
    this.scene.placing = null;
    this.scene.managing = true;
    this.controls.reset();
    $('#controls').classList.add('hidden');
    $('#placebar').classList.remove('hidden');
    $('#place-ok').classList.add('hidden');
    $('#place-name').textContent = 'Gérer le camp';
    $('#place-reason').textContent = 'Touchez une construction encadrée';
    $('#place-reason').className = 'ok';
    $('#placebar').classList.add('managing');
    $('#place-help').textContent = 'Touchez une construction encadrée pour la réparer, l’améliorer ou la démolir. « Terminer » pour revenir au jeu.';
    ($('#place-cancel') as HTMLButtonElement).textContent = 'Terminer';
  }

  private updatePlaceBar(): void {
    const g = this.g;
    const pl = this.scene?.placing;
    if (!g || !pl) return;
    const c = canPlace(g, pl.type, pl.tx, pl.ty);
    const r = $('#place-reason');
    r.textContent = c.ok ? 'Emplacement valide' : c.reason ?? 'Invalide';
    r.className = c.ok ? 'ok' : 'bad';
    ($('#place-ok') as HTMLButtonElement).disabled = !c.ok;
  }

  private confirmPlacement(): void {
    const g = this.g;
    const pl = this.scene?.placing;
    if (!g || !pl) return;
    const r = place(g, pl.type, pl.tx, pl.ty);
    if (!r.ok) {
      g.toast(r.reason ?? 'Placement impossible', 'warn');
      return;
    }
    // on enchaîne tant que les ressources suffisent (pratique pour les murs)
    const d = BUILDING_BY_ID[pl.type];
    const again = Object.entries(d.cost).every(([id, n]) => g.player.inv.reduce((s, x) => s + (x && x.id === id ? x.qty : 0), 0) >= n);
    if (!again || !['palisade', 'spikes', 'lamp', 'trap'].includes(pl.type)) this.stopPlacement();
  }

  stopPlacement(): void {
    this.layoutT = 0.05;
    if (!this.scene) return;
    this.scene.placing = null;
    this.scene.managing = false;
    ($('#place-cancel') as HTMLButtonElement).textContent = 'Annuler';
    $('#placebar').classList.add('hidden');
    $('#placebar').classList.remove('managing');
    if (this.g && !this.overlay) $('#controls').classList.remove('hidden');
    this.controls.reset();
  }

  private onPlacementKey(e: KeyboardEvent): void {
    const pl = this.scene?.placing;
    if (!pl && !this.scene?.managing) return;
    if (e.code === 'Escape') {
      e.stopImmediatePropagation();
      this.stopPlacement();
      return;
    }
    if (!pl) return;
    const mv: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };
    if (mv[e.code]) {
      pl.tx += mv[e.code][0];
      pl.ty += mv[e.code][1];
      e.preventDefault();
    } else if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      this.confirmPlacement();
    }
  }

  // ------------------------------------------------------------ messages
  toast(text: string, kind: 'info' | 'warn' | 'good' | 'tip' = 'info'): void {
    if (this.overlay === 'death' || this.overlay === 'victory') return;
    const box = $('#toasts');
    // messages identiques successifs : un seul message avec compteur
    const last = box.lastElementChild as HTMLElement | null;
    if (last && last.dataset.text === text && !last.classList.contains('out')) {
      const n = Number(last.dataset.n ?? '1') + 1;
      last.dataset.n = String(n);
      last.textContent = `${text} (×${n})`;
      return;
    }
    const t = h('div', { class: `toast ${kind}`, text });
    t.dataset.text = text;
    box.append(t);
    while (box.children.length > 4) box.firstChild?.remove();
    const life = kind === 'tip' ? 6500 : 3600;
    setTimeout(() => t.classList.add('out'), life);
    setTimeout(() => t.remove(), life + 500);
  }

  // ------------------------------------------------------------ écrans
  private screen(el: HTMLElement | null, overlay: Overlay): void {
    const layer = $('#screen-layer');
    clear(layer);
    if (el) layer.append(el);
    // les écrans (victoire, mort, titre…) ne sont jamais recouverts par les messages
    if (overlay) clear($('#toasts'));
    this.overlay = overlay;
    this.controls.reset();
    const inGame = !!this.g && overlay !== 'title' && overlay !== 'loading';
    $('#hud').classList.toggle('hidden', !inGame);
    $('#controls').classList.toggle('hidden', !inGame || overlay !== null);
  }

  private showLoading(): void {
    this.screen(h('div', { class: 'screen title' },
      h('h1', { text: 'Les Bois de Cendre' }),
      h('div', { class: 'sub', text: 'Chargement des ressources…' }),
      h('div', { id: 'loadbar' }, h('div', {}))), 'loading');
  }

  async showTitle(): Promise<void> {
    this.stopPlacement();
    this.closePanel();
    this.g = null;
    if (this.scene) {
      this.titleGame = Game.newGame(Math.floor(Math.random() * 1e9));
      this.scene.setGame(this.titleGame);
      this.scene.cameras.main.stopFollow();
      this.scene.cameras.main.centerOn(this.titleGame.player.x, this.titleGame.player.y - 200);
    }
    this.audio.setMusic('music_title');
    this.audio.setFireLevel(0);
    const saved = await hasSave();
    const art = h('div', { class: 'titleart' }, icon('world:tree_pine_a', 72), icon('world:campfire_1', 40), icon('world:seal_stone', 56), icon('world:tree_dead', 72));
    const list = h('div', { class: 'menu-list' });
    if (saved) list.append(h('button', { class: 'btn primary', text: 'Continuer', onclick: () => void this.continueGame() }));
    list.append(
      h('button', { class: 'btn' + (saved ? '' : ' primary'), text: 'Nouvelle partie', onclick: () => {
        if (saved) this.confirm('Une sauvegarde existe. La nouvelle partie la remplacera (la précédente reste en secours jusqu’à la prochaine sauvegarde). Continuer ?', 'Nouvelle partie', () => { this.closePanel(); this.newGame(); });
        else this.newGame();
      } }),
      h('button', { class: 'btn', text: 'Importer une sauvegarde', onclick: () => this.importSave() }),
      h('button', { class: 'btn', text: 'Options', onclick: () => this.openPanel('options') }),
      h('button', { class: 'btn', text: 'Commandes et règles', onclick: () => this.openPanel('help') }),
      h('button', { class: 'btn', text: 'Crédits', onclick: () => this.openPanel('credits') }),
    );
    const land = matchMedia('(orientation: portrait)').matches ? h('div', { class: 'hint-land', text: 'Conseil : le mode paysage offre la meilleure vue. Le portrait reste jouable.' }) : null;
    this.screen(h('div', { class: 'screen title' }, art, h('h1', { text: 'Les Bois de Cendre' }),
      h('div', { class: 'sub', text: 'Survie et construction dans une forêt médiévale infestée de morts. Retrouvez les trois fragments du sceau et libérez la forêt.' }),
      list, land, h('div', { class: 'version', text: `Version ${this.version}` })), 'title');
  }

  newGame(): void {
    const seed = (Math.random() * 2 ** 31) >>> 0;
    const g = Game.newGame(seed);
    this.startGame(g);
    this.gate('Un ancien camp abandonné', 'Vous émergez des bois et découvrez un camp déserté. Le soleil est encore haut : récoltez, fabriquez un outil et préparez-vous avant la nuit. L’objectif en haut de l’écran vous guide.', 'Commencer');
    void this.saveNow('start');
  }

  async continueGame(): Promise<void> {
    const res = await loadSave();
    if (!res.data) {
      this.toast(res.error ?? 'Aucune sauvegarde trouvée.', 'warn');
      return;
    }
    let g: Game;
    try {
      g = deserialize(res.data);
    } catch (e) {
      this.toast(`Sauvegarde illisible : ${(e as Error).message}`, 'warn');
      return;
    }
    this.startGame(g);
    let msg = res.usedBackup ? `La dernière sauvegarde était invalide (${res.error}). La sauvegarde de secours précédente a été chargée.` : `Jour ${g.day} · ${Math.round(g.world.exploredRatio() * 100)} % exploré · ${g.fragmentsFound()}/3 fragments.`;
    if (g.genVersion < 2) msg += ' Votre monde est conservé tel quel : les nouvelles scènes d’exploration n’apparaissent que dans les nouvelles parties.';
    this.gate('Partie chargée', msg, 'Je suis prêt');
  }

  private startGame(g: Game): void {
    this.titleGame = null;
    this.g = g;
    this.scene?.setGame(g);
    this.hud?.forceRefresh();
    this.hud?.highlightObjective();
    this.layoutT = 0;
  }

  /** L'aide « Glissez pour marcher » disparaît après les premiers déplacements. */
  private updateJoyHint(dt: number): void {
    if (this.joyHintDone || !this.g) return;
    if (this.g.player.moving) this.movedFor += dt;
    if (this.movedFor > 2.5) {
      this.joyHintDone = true;
      $('#joy-hint').classList.add('hidden');
      if (!this.settings.learned.includes('joystick')) {
        this.settings.learned.push('joystick');
        saveSettings(this.settings);
      }
    }
  }

  /**
   * Mesure la place réellement occupée par l'interface en haut et en bas de l'écran
   * pour centrer le personnage dans la zone de jeu dégagée.
   */
  measureInsets(): void {
    if (!this.scene) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    // seuls comptent les éléments qui recouvrent la bande centrale (où se tient le personnage)
    const vis = (sel: string) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el || el.offsetParent === null) return null;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.right < W * 0.3 || r.left > W * 0.7) return null;
      return r;
    };
    let top = 0;
    for (const s of ['#status', '#objective', '#pin', '#menu-buttons']) {
      const r = vis(s);
      if (r && r.top < H / 2) top = Math.max(top, r.bottom);
    }
    let bottom = 0;
    for (const s of ['#action-buttons', '#quickbar', '#placebar']) {
      const r = vis(s);
      if (r && r.bottom > H / 2) bottom = Math.max(bottom, H - r.top);
    }
    this.scene.setViewInsets(top, bottom);
  }

  /** La simulation ne reprend qu'après confirmation du joueur. */
  private gate(title: string, text: string, btn: string): void {
    this.screen(h('div', { class: 'screen dim' }, h('div', { class: 'card' },
      h('h2', { text: title }), h('p', { text }),
      h('div', { class: 'actions', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', text: btn, onclick: () => this.screen(null, null) })))), 'gate');
    $('#hud').classList.remove('hidden');
  }

  private showDeath(reason: string, lost: number, hasBag: boolean, atBed: boolean): void {
    const g = this.g!;
    setTimeout(() => {
      if (this.g !== g) return;
      this.screen(h('div', { class: 'screen dim' }, h('div', { class: 'card' },
        h('h2', { text: 'Vous êtes tombé' }),
        h('p', { text: reason }),
        h('p', { class: 'note-muted', text: hasBag ? `${lost} objet(s) sont restés dans un sac à l’endroit de votre chute (indiqué sur la carte). Vos objectifs et fragments sont conservés.` : 'Vous n’avez rien perdu. Vos objectifs et fragments sont conservés.' }),
        h('p', { class: 'note-muted', text: atBed ? 'Vous réapparaîtrez près de votre paillasse, protégé quelques secondes.' : 'Vous réapparaîtrez au camp de départ, protégé quelques secondes. Construisez une paillasse pour changer ce point.' }),
        h('div', { class: 'actions', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', text: 'Réapparaître', onclick: () => { g.respawn(); this.screen(null, null); } })))), 'death');
    }, 1400);
  }

  private showVictory(): void {
    const g = this.g!;
    g.victorySeen = true;
    const s = g.stats;
    const built = Object.values(s.built).reduce((a, b) => a + b, 0);
    const min = Math.round(s.playTime / 60);
    this.screen(h('div', { class: 'screen dim' }, h('div', { class: 'card' },
      h('h2', { text: 'La forêt est libérée' }),
      h('p', { text: 'Le sceau du Loup brille à nouveau. Les morts retournent à la terre et le silence revient sous les arbres.' }),
      h('div', { class: 'statsgrid' },
        h('span', { text: 'Jours survécus' }), h('b', { text: String(g.day) }),
        h('span', { text: 'Morts' }), h('b', { text: String(s.deaths) }),
        h('span', { text: 'Ennemis vaincus' }), h('b', { text: String(s.kills) }),
        h('span', { text: 'Exploration' }), h('b', { text: `${Math.round(g.world.exploredRatio() * 100)} %` }),
        h('span', { text: 'Constructions' }), h('b', { text: String(built) }),
        h('span', { text: 'Notes lues' }), h('b', { text: `${s.notesRead.length}/${g.world.objects.filter((o) => o.type === 'note').length}` }),
        h('span', { text: 'Temps de jeu' }), h('b', { text: `${min} min` }),
      ),
      h('div', { class: 'actions', style: { justifyContent: 'center' } },
        h('button', { class: 'btn primary', text: 'Continuer à explorer', onclick: () => { this.screen(null, null); void this.saveNow('victory'); } }),
        h('button', { class: 'btn', text: 'Nouvelle partie', onclick: () => this.confirm('Commencer une nouvelle partie ? La partie actuelle sera remplacée.', 'Nouvelle partie', () => { this.closePanel(); this.newGame(); }) }),
      ))), 'victory');
  }

  quitToTitle(): void {
    void this.saveNow('quit').then(() => this.showTitle());
  }

  // ------------------------------------------------------------ sauvegarde
  async saveNow(reason: string): Promise<void> {
    const g = this.g;
    if (!g || this.saving) return;
    if (g.player.dead && reason !== 'quit') return;
    this.saving = true;
    try {
      const res = await writeSave(serialize(g));
      if (!res.ok) this.toast(`Échec de la sauvegarde : ${res.error}`, 'warn');
      else if (reason === 'manual') this.toast('Partie sauvegardée.', 'good');
    } catch (e) {
      this.toast(`Échec de la sauvegarde : ${(e as Error).message}`, 'warn');
    } finally {
      this.saving = false;
    }
  }

  exportSave(): void {
    if (!this.g) return;
    const data = JSON.stringify(serialize(this.g));
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `bois-de-cendre-jour${this.g.day}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    this.toast('Sauvegarde exportée (fichier JSON).', 'good');
  }

  importSave(): void {
    const inp = h('input', { type: 'file', accept: 'application/json,.json' }) as HTMLInputElement;
    inp.addEventListener('change', async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const v = validateSave(data);
        if (!v.ok) {
          this.toast(v.error, 'warn');
          return;
        }
        this.confirm('Importer ce fichier remplacera la partie en cours (la sauvegarde actuelle devient la sauvegarde de secours). Continuer ?', 'Importer', async () => {
          this.closePanel();
          const g = deserialize(v.data);
          const res = await writeSave(v.data);
          if (!res.ok) this.toast(`Import chargé mais non enregistré : ${res.error}`, 'warn');
          this.startGame(g);
          this.gate('Sauvegarde importée', `Jour ${g.day} · ${g.fragmentsFound()}/3 fragments.`, 'Je suis prêt');
        });
      } catch {
        this.toast('Fichier illisible : ce n’est pas un JSON valide.', 'warn');
      }
    });
    inp.click();
  }

  async resetAll(): Promise<void> {
    await clearSaves();
  }

  // ------------------------------------------------------------ arrière-plan
  private onHidden(): void {
    if (this.hidden) return;
    this.hidden = true;
    this.controls.reset();
    if (this.g) void this.saveNow('background');
  }

  private onVisible(): void {
    if (!this.hidden) return;
    this.hidden = false;
    this.controls.reset();
    // pas de simulation pendant l'absence : on redemande confirmation
    if (this.g && this.overlay === null && !this.modal) this.gate('Pause', 'Le jeu était en arrière-plan. Rien ne s’est passé pendant votre absence.', 'Reprendre');
  }
}
