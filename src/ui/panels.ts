// Panneaux modaux (le jeu est en pause tant qu'un panneau est ouvert).
import { TILE } from '../config/balance';
import { BUILDINGS, BUILDING_BY_ID } from '../data/buildings';
import { item, type EquipSlot, type Station } from '../data/items';
import { NOTE_BY_ID } from '../data/notes';
import { RECIPES, STATION_NAMES } from '../data/recipes';
import {
  canCraft, canSleep, containerName, containerSlots, craft, dropSlot, equipSlot, moveSlot, repairItem, sleep, takeAll,
  takeFromContainer, putInContainer, unequip, useSlot, demolishRefund, demolish,
} from '../sim/actions';
import type { Game } from '../sim/game';
import { countItem } from '../sim/inventory';
import { repairBuildingAction, repairCost, startFinalAssault } from '../sim/interact';
import { currentObjective, OBJECTIVES } from '../sim/objectives';
import type { Settings } from '../settings';
import { ZONE_NAMES, FOG_CELL } from '../world/world';
import { $, clear, h } from './dom';
import { slotEl } from './hud';
import { icon } from './icons';
import { CREDITS } from '../data/credits';

export interface PanelHost {
  game: Game;
  settings: Settings;
  closePanel(): void;
  openPanel(name: string, ref?: string): void;
  sfx(key: string): void;
  startPlacement(type: string): void;
  startManage(): void;
  saveNow(reason: string): Promise<void>;
  exportSave(): void;
  importSave(): void;
  applySettings(): void;
  quitToTitle(): void;
  confirm(text: string, ok: string, onOk: () => void): void;
}

function panel(title: string, host: PanelHost, body: HTMLElement, opts: { narrow?: boolean; tabs?: HTMLElement } = {}): HTMLElement {
  const p = h('div', { class: 'panel' + (opts.narrow ? ' narrow' : ''), role: 'dialog', 'aria-label': title },
    h('div', { class: 'phead' }, h('h2', { text: title }), h('button', { class: 'close', text: 'Fermer', onclick: () => host.closePanel() })),
    opts.tabs ?? null,
    body,
  );
  body.classList.add('pbody');
  return p;
}

function costLine(g: Game, cost: Record<string, number>): HTMLElement {
  const box = h('div', { class: 'ings' });
  for (const [id, n] of Object.entries(cost)) {
    const have = countItem(g.player.inv, id);
    box.append(h('span', { class: 'ing ' + (have >= n ? 'have' : 'miss') }, icon(item(id).icon, 18), `${item(id).name} ${have}/${n}`));
  }
  return box;
}

// ------------------------------------------------------------ inventaire
export function inventoryPanel(host: PanelHost, state: { sel: number | EquipSlot | null; moving: number | null } = { sel: null, moving: null }): HTMLElement {
  const g = host.game;
  const p = g.player;
  const body = h('div', {});
  const rerender = () => {
    const np = inventoryPanel(host, state);
    const layer = $('#panel-layer');
    clear(layer);
    layer.append(np);
  };
  const equipRow = h('div', { class: 'equip-row' });
  for (const [slot, label] of [['weapon', 'Arme'], ['tool', 'Outil'], ['armor', 'Protection']] as const) {
    const s = slotEl(p.equip[slot], { sel: state.sel === slot });
    s.addEventListener('click', () => {
      state.sel = slot;
      state.moving = null;
      rerender();
    });
    equipRow.append(h('div', { class: 'eqslot' }, s, label));
  }
  const grid = h('div', { class: 'grid' });
  p.inv.forEach((st, i) => {
    const s = slotEl(st, { key: i < 5 ? String(i + 1) : undefined, sel: state.sel === i });
    if (state.moving !== null) s.classList.add('drop-target');
    s.addEventListener('click', () => {
      if (state.moving !== null) {
        moveSlot(g, state.moving, i);
        host.sfx('click');
        state.moving = null;
        state.sel = i;
      } else state.sel = i;
      rerender();
    });
    grid.append(s);
  });

  const det = h('div', { class: 'details' });
  const sel = state.sel;
  const st = sel === null ? null : typeof sel === 'number' ? p.inv[sel] : p.equip[sel];
  if (state.moving !== null) {
    det.append(h('p', { text: 'Touchez l’emplacement de destination (échange si occupé).' }), h('div', { class: 'actions' }, h('button', { class: 'btn', text: 'Annuler', onclick: () => { state.moving = null; rerender(); } })));
  } else if (!st) {
    det.append(h('p', { class: 'note-muted', text: 'Touchez un objet pour voir ses effets et actions. Les 5 premiers emplacements forment la barre rapide.' }));
  } else {
    const d = item(st.id);
    det.append(h('h3', {}, icon(d.icon, 28), d.name));
    det.append(h('p', { text: d.desc }));
    const stats: string[] = [];
    if (d.food) stats.push(`Nourrit : +${d.food.hunger}` + (d.food.health ? ` · Soigne : +${d.food.health}` : '') + (d.food.regen ? ' · Récupération accrue 60 s' : ''));
    if (d.weapon) stats.push(`Dégâts : ${d.weapon.damage} · Portée : ${Math.round(d.weapon.reach / TILE * 10) / 10} case(s)`);
    if (d.tool && d.tool.type !== 'light') stats.push(`Outil : ${d.tool.type === 'axe' ? 'bûcheronnage' : 'minage'} ×${d.tool.power}`);
    if (d.armor) stats.push(`Réduction des dégâts : ${Math.round(d.armor.reduction * 100)} %`);
    if (d.durability !== undefined && st.dur !== undefined) stats.push(`Durabilité : ${Math.ceil(st.dur)}/${d.durability}${st.dur <= 0 ? ' (cassé)' : ''}`);
    stats.push(`Pile max : ${d.stack}`);
    det.append(h('div', { class: 'stats' }, ...stats.map((s) => h('div', { text: s }))));
    const acts = h('div', { class: 'actions' });
    if (typeof sel === 'number') {
      if (d.food || d.heal) acts.append(h('button', { class: 'btn primary', text: d.food ? 'Manger' : 'Utiliser', onclick: () => { useSlot(g, sel); rerender(); } }));
      if (d.slot) acts.append(h('button', { class: 'btn primary', text: 'Équiper', onclick: () => { equipSlot(g, sel); state.sel = d.slot!; rerender(); } }));
      acts.append(h('button', { class: 'btn', text: 'Déplacer', onclick: () => { state.moving = sel; rerender(); } }));
      if (d.kind !== 'quest')
        acts.append(h('button', { class: 'btn danger', text: 'Jeter', onclick: () => host.confirm(`Jeter ${st.qty} × ${d.name} ? L’objet restera au sol dans un sac.`, 'Jeter', () => { dropSlot(g, sel); state.sel = null; host.openPanel('inventory'); }) }));
    } else if (sel) {
      acts.append(h('button', { class: 'btn', text: 'Retirer', onclick: () => { unequip(g, sel); state.sel = null; rerender(); } }));
    }
    if (d.repair && d.durability !== undefined && (st.dur ?? d.durability) < d.durability) {
      const cost = Object.entries(d.repair.cost).map(([id, n]) => `${n} ${item(id).name}`).join(', ');
      acts.append(h('button', { class: 'btn', text: `Réparer (${cost})`, onclick: () => { const r = repairItem(g, sel!); if (!r.ok && r.reason) g.toast(r.reason, 'warn'); rerender(); } }));
      det.append(h('div', { class: 'reason', text: `Réparation : ${STATION_NAMES[d.repair.station]} à proximité.` }));
    }
    det.append(acts);
  }
  body.append(h('div', { class: 'inv-layout' }, h('div', {}, equipRow, grid), det));
  const free = p.inv.filter((s) => !s).length;
  body.append(h('p', { class: 'note-muted', text: `${24 - free}/24 emplacements utilisés.` }));
  return panel('Sac', host, body);
}

// ------------------------------------------------------------ fabrication
export function craftPanel(host: PanelHost, filter: Station | 'all' = 'all'): HTMLElement {
  const g = host.game;
  const tabs = h('div', { class: 'tabs' });
  const opts: [Station | 'all', string][] = [['all', 'Tout'], ['hand', 'À la main'], ['workbench', 'Établi'], ['campfire', 'Feu de camp'], ['forge', 'Forge']];
  for (const [k, lbl] of opts) {
    const near = k === 'all' || g.nearStation(k as Station);
    tabs.append(h('button', { class: 'tab' + (k === filter ? ' on' : ''), text: lbl + (k !== 'all' && k !== 'hand' && near ? ' ✓' : ''), onclick: () => host.openPanel('craft', k) }));
  }
  const body = h('div', {});
  const list = RECIPES.filter((r) => filter === 'all' || r.station === filter);
  // disponibles d'abord
  const sorted = [...list].sort((a, b) => Number(canCraft(g, b).ok) - Number(canCraft(g, a).ok));
  for (const r of sorted) {
    const d = item(r.output);
    const c = canCraft(g, r);
    const row = h('div', { class: 'recipe' + (c.ok ? '' : ' disabled') },
      h('div', { class: 'rico' }, icon(d.icon, 40)),
      h('div', {},
        h('div', { class: 'rname' }, `${d.name}${r.qty > 1 ? ` ×${r.qty}` : ''} `, h('small', { text: `· ${STATION_NAMES[r.station]}` })),
        costLine(g, r.inputs),
        c.ok ? null : h('div', { class: 'reason', text: c.reason ?? '' }),
      ),
      h('button', { class: 'btn primary', text: 'Fabriquer', disabled: !c.ok, onclick: () => {
        const res = craft(g, r.id);
        if (!res.ok && res.reason) g.toast(res.reason, 'warn');
        const scroll = (document.querySelector('#panel-layer .pbody') as HTMLElement | null)?.scrollTop ?? 0;
        host.openPanel('craft', filter);
        const nb = document.querySelector('#panel-layer .pbody') as HTMLElement | null;
        if (nb) nb.scrollTop = scroll;
      } }),
    );
    row.title = d.desc;
    body.append(row);
  }
  return panel('Fabrication', host, body, { tabs });
}

// ------------------------------------------------------------ construction
export function buildPanel(host: PanelHost): HTMLElement {
  const g = host.game;
  const body = h('div', {});
  body.append(h('div', { class: 'actions', style: { marginTop: '0', marginBottom: '10px' } },
    h('button', { class: 'btn', text: 'Gérer : réparer ou démolir', onclick: () => host.startManage() })));
  for (const b of BUILDINGS) {
    const ok = Object.entries(b.cost).every(([id, n]) => countItem(g.player.inv, id) >= n);
    body.append(h('div', { class: 'recipe' + (ok ? '' : ' disabled') },
      h('div', { class: 'rico' }, icon(b.icon, 44)),
      h('div', {},
        h('div', { class: 'rname' }, b.name, h('small', { text: ` · PV ${b.hp}${b.w > 1 || b.h > 1 ? ` · ${b.w}×${b.h}` : ''}` })),
        h('div', { class: 'note-muted', text: b.desc }),
        costLine(g, b.cost),
      ),
      h('button', { class: 'btn primary', text: 'Placer', disabled: !ok, onclick: () => host.startPlacement(b.id) }),
    ));
  }
  return panel('Construction', host, body);
}

export function managePanel(host: PanelHost, buildingId: number): HTMLElement {
  const g = host.game;
  const b = g.world.buildings.get(buildingId);
  const body = h('div', {});
  if (!b) {
    body.append(h('p', { text: 'Construction introuvable.' }));
    return panel('Gérer', host, body, { narrow: true });
  }
  const d = BUILDING_BY_ID[b.type];
  body.append(h('h3', { style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '0 0 6px' } }, icon(d.icon, 36), d.name));
  body.append(h('p', { text: `Points de vie : ${Math.ceil(b.hp)}/${d.hp}` }));
  const acts = h('div', { class: 'actions' });
  const rc = repairCost(g, b.id)!;
  if (b.hp < d.hp) {
    body.append(h('div', { class: 'note-muted', text: 'Réparation :' }), costLine(g, rc));
    acts.append(h('button', { class: 'btn primary', text: 'Réparer', onclick: () => { repairBuildingAction(g, b.id); host.openPanel('manage', String(b.id)); } }));
  }
  const refund = demolishRefund(b.type);
  const rtxt = Object.entries(refund).map(([id, n]) => `${n} ${item(id).name}`).join(', ') || 'rien';
  body.append(h('p', { class: 'note-muted', text: `Démolir rembourse : ${rtxt}.${b.items && b.items.some((s) => s) ? ' Le contenu du coffre tombera dans un sac.' : ''}` }));
  acts.append(h('button', { class: 'btn danger', text: 'Démolir', onclick: () => host.confirm(`Démolir ${d.name} ? Remboursement : ${rtxt}.`, 'Démolir', () => { const r = demolish(g, b.id); if (!r.ok && r.reason) g.toast(r.reason, 'warn'); host.closePanel(); host.startManage(); }) }));
  acts.append(h('button', { class: 'btn', text: 'Autre construction', onclick: () => { host.closePanel(); host.startManage(); } }));
  body.append(acts);
  return panel('Gérer la construction', host, body, { narrow: true });
}

// ------------------------------------------------------------ conteneurs
export function containerPanel(host: PanelHost): HTMLElement {
  const g = host.game;
  const slots = containerSlots(g);
  const body = h('div', {});
  if (!slots) {
    body.append(h('p', { text: 'Rien à fouiller ici.' }));
    return panel('Conteneur', host, body, { narrow: true });
  }
  const re = () => host.openPanel('container');
  const cgrid = h('div', { class: 'grid' });
  slots.forEach((st, i) => {
    const s = slotEl(st);
    s.addEventListener('click', () => { if (st) { takeFromContainer(g, i); host.sfx('pick_0'); } re(); });
    cgrid.append(s);
  });
  const igrid = h('div', { class: 'grid' });
  g.player.inv.forEach((st, i) => {
    const s = slotEl(st, { key: i < 5 ? String(i + 1) : undefined });
    s.addEventListener('click', () => { if (st) { putInContainer(g, i); host.sfx('pick_0'); } re(); });
    igrid.append(s);
  });
  body.append(h('div', { class: 'cont-layout' },
    h('div', {}, h('h3', { text: `${containerName(g)} — touchez pour prendre` }), cgrid,
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', text: 'Tout prendre', disabled: slots.every((s) => !s), onclick: () => { takeAll(g); re(); } }))),
    h('div', {}, h('h3', { text: 'Votre sac — touchez pour déposer' }), igrid),
  ));
  return panel(containerName(g), host, body);
}

// ------------------------------------------------------------ carte
let mapBase: { seed: number; canvas: HTMLCanvasElement } | null = null;

function baseMap(g: Game): HTMLCanvasElement {
  const w = g.world;
  if (mapBase && mapBase.seed === w.seed) return mapBase.canvas;
  const c = document.createElement('canvas');
  c.width = w.w;
  c.height = w.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w.w, w.h);
  for (let y = 0; y < w.h; y++)
    for (let x = 0; x < w.w; x++) {
      const i = w.idx(x, y);
      const autumn = w.palette[i] === 1;
      let col = autumn ? [120, 96, 52] : [74, 122, 52];
      if (!w.isGrassTile(x, y)) col = [140, 104, 66];
      const o = w.objectAtTile(x, y);
      if (o && o.solid && !o.removed) {
        if (o.type === 'tree') col = autumn ? [82, 58, 36] : [34, 70, 34];
        else if (o.type === 'house') col = [120, 60, 50];
        else if (o.type === 'rock' || o.type === 'ore_iron' || o.type === 'ore_coal') col = [110, 110, 110];
        else col = [150, 130, 90];
      }
      const k = i * 4;
      img.data[k] = col[0];
      img.data[k + 1] = col[1];
      img.data[k + 2] = col[2];
      img.data[k + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  mapBase = { seed: w.seed, canvas: c };
  return c;
}

export function mapPanel(host: PanelHost): HTMLElement {
  const g = host.game;
  const w = g.world;
  const body = h('div', {});
  const vw = Math.min(window.innerWidth - 40, 720);
  const vh = window.innerHeight - 170;
  const size = Math.max(200, Math.min(vw, vh));
  const wrap = h('div', { id: 'mapwrap', style: { width: `${size}px`, height: `${size}px` } });
  const cv = document.createElement('canvas');
  cv.width = w.w * 2;
  cv.height = w.h * 2;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(baseMap(g), 0, 0, w.w * 2, w.h * 2);
  // constructions
  ctx.fillStyle = '#e8c77a';
  for (const b of w.buildings.values()) {
    const d = BUILDING_BY_ID[b.type];
    ctx.fillRect(b.x * 2, b.y * 2, d.w * 2, d.h * 2);
  }
  // brouillard de découverte
  const cw = Math.ceil(w.w / FOG_CELL);
  ctx.fillStyle = '#0d0b09';
  for (let y = 0; y < Math.ceil(w.h / FOG_CELL); y++)
    for (let x = 0; x < cw; x++) if (!w.fog[y * cw + x]) ctx.fillRect(x * FOG_CELL * 2, y * FOG_CELL * 2, FOG_CELL * 2, FOG_CELL * 2);
  wrap.append(cv);
  const k = size / w.w;
  const mark = (tx: number, ty: number, key: string | null, label: string, cls = '') => {
    const m = h('div', { class: 'mapmark ' + cls, style: { left: `${tx * k}px`, top: `${ty * k}px` } });
    if (key) m.append(icon(key, 22));
    if (label) m.append(h('span', { text: label }));
    wrap.append(m);
  };
  for (const lm of w.landmarks) if (lm.discovered) mark(lm.x + 0.5, lm.y + 0.5, lm.icon, lm.name);
  for (const b of w.buildings.values()) if (b.type === 'bed') mark(b.x + 1, b.y + 1, 'world:bed_straw', 'Paillasse');
  for (const bag of w.bags.values()) if (bag.kind === 'death' || bag.id === g.deathBagId) mark(bag.x / TILE, bag.y / TILE, 'items:i_bag', 'Votre sac');
  mark(g.player.x / TILE, g.player.y / TILE, null, '', 'player');
  body.append(wrap);
  const zone = w.zoneAt(Math.floor(g.player.x / TILE), Math.floor(g.player.y / TILE));
  body.append(h('div', { class: 'legend' },
    h('span', { text: `Vous êtes : ${ZONE_NAMES[zone]}` }),
    h('span', { text: `Exploré : ${Math.round(w.exploredRatio() * 100)} %` }),
    h('span', { text: `Fragments : ${g.fragmentsFound()}/3` }),
  ));
  return panel('Carte', host, body);
}

// ------------------------------------------------------------ menus
/** Menu compact regroupant les accès de gestion (le sac reste accessible directement). */
export function hubPanel(host: PanelHost): HTMLElement {
  const entry = (key: string, label: string, sub: string, panelName: string) =>
    h('button', { class: 'hub-btn', onclick: () => host.openPanel(panelName) }, icon(key, 30), h('span', { class: 'hub-lbl' }, h('b', { text: label }), h('small', { text: sub })));
  const body = h('div', { class: 'hub-grid' },
    entry('world:i_hammer', 'Fabriquer', 'Outils, armes, repas', 'craft'),
    entry('world:i_planks', 'Construire', 'Camp et défenses', 'build'),
    entry('items:i_map', 'Carte', 'Lieux découverts', 'map'),
    entry('items:i_note', 'Objectif', 'Détails et conseils', 'objective'),
    entry('items:i_chest', 'Pause', 'Options, sauvegarde…', 'pause'),
  );
  const p = panel('Menu', host, body, { narrow: true });
  p.classList.add('hub');
  return p;
}

/** Détail de l'objectif en cours (le jeu est en pause pendant la lecture). */
export function objectivePanel(host: PanelHost): HTMLElement {
  const g = host.game;
  const o = currentObjective(g);
  const body = h('div', {});
  if (o) {
    body.append(h('h3', { class: 'obj-h', text: o.title }));
    const prog = o.progress?.(g);
    if (prog) body.append(h('p', { class: 'obj-prog', text: prog }));
    body.append(h('p', { text: o.hint }));
  } else {
    body.append(h('h3', { class: 'obj-h', text: g.final.state === 'won' ? 'La forêt est libérée' : 'Survivre' }), h('p', { text: 'Tous les objectifs sont accomplis. Continuez à explorer, construire et survivre.' }));
  }
  const done = OBJECTIVES.filter((x) => g.completed.has(x.id));
  if (done.length) {
    body.append(h('p', { class: 'note-muted', text: 'Déjà accomplis :' }));
    body.append(h('ul', { class: 'obj-done' }, ...done.map((x) => h('li', { text: x.title }))));
  }
  body.append(h('div', { class: 'actions' }, h('button', { class: 'btn primary', text: 'Reprendre', onclick: () => host.closePanel() })));
  return panel('Objectif', host, body, { narrow: true });
}

export function pausePanel(host: PanelHost): HTMLElement {
  const body = h('div', { class: 'menu-list' },
    h('button', { class: 'btn primary', text: 'Reprendre', onclick: () => host.closePanel() }),
    h('button', { class: 'btn', text: 'Sauvegarder maintenant', onclick: () => void host.saveNow('manual') }),
    h('button', { class: 'btn', text: 'Options', onclick: () => host.openPanel('options') }),
    h('button', { class: 'btn', text: 'Commandes et règles', onclick: () => host.openPanel('help') }),
    h('button', { class: 'btn', text: 'Crédits', onclick: () => host.openPanel('credits') }),
    h('button', { class: 'btn', text: 'Exporter la sauvegarde (JSON)', onclick: () => host.exportSave() }),
    h('button', { class: 'btn', text: 'Importer une sauvegarde', onclick: () => host.importSave() }),
    h('button', { class: 'btn danger', text: 'Quitter vers l’écran titre', onclick: () => host.quitToTitle() }),
  );
  return panel('Pause', host, body, { narrow: true });
}

export function optionsPanel(host: PanelHost): HTMLElement {
  const s = host.settings;
  const body = h('div', {});
  const range = (label: string, key: 'master' | 'music' | 'sfx') => {
    const inp = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s[key]), 'aria-label': label }) as HTMLInputElement;
    inp.addEventListener('input', () => { s[key] = Number(inp.value); host.applySettings(); });
    return h('label', { class: 'opt' }, h('span', { text: label }), inp);
  };
  const check = (label: string, key: 'muted' | 'reduceShake' | 'debug' | 'showHints') => {
    const inp = h('input', { type: 'checkbox', 'aria-label': label }) as HTMLInputElement;
    inp.checked = s[key];
    inp.addEventListener('change', () => { s[key] = inp.checked; host.applySettings(); });
    return h('label', { class: 'opt' }, h('span', { text: label }), inp);
  };
  body.append(
    range('Volume général', 'master'), range('Musique', 'music'), range('Effets sonores', 'sfx'),
    check('Muet', 'muted'), check('Réduire les secousses de l’écran', 'reduceShake'),
    check('Afficher les aides d’objectif', 'showHints'), check('Mode debug (FPS, collisions…)', 'debug'),
    h('p', { class: 'note-muted', text: 'Le plein écran et le verrouillage de l’orientation dépendent de votre navigateur ; le jeu fonctionne sans.' }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', text: 'Plein écran', onclick: () => { const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void }; (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())?.catch?.(() => {}); } }),
      h('button', { class: 'btn', text: 'Retour', onclick: () => host.openPanel('pause') })),
  );
  return panel('Options', host, body, { narrow: true });
}

export function helpPanel(host: PanelHost): HTMLElement {
  const body = h('div', { class: 'credits' });
  body.innerHTML = `
  <h3>But du jeu</h3>
  <p>Survivez dans les Bois de Cendre, retrouvez les trois fragments du sceau dans les lieux maudits (hameau à l’est, cimetière à l’ouest, pierres noires au nord), restaurez le sanctuaire du Loup tout au nord et repoussez l’assaut final.</p>
  <h3>Téléphone</h3>
  <ul><li>Joystick à gauche : glissez n’importe où dans la zone gauche. Poussé à fond : course (consomme l’endurance).</li>
  <li>Attaque : frappe l’ennemi le plus proche devant vous (visée assistée). Sans ennemi, elle récolte aussi.</li>
  <li>Action : son libellé indique l’action (couper, miner, cueillir, ouvrir, lire, ramasser, réparer…). Maintenez pour répéter.</li>
  <li>Esquive : courte roulade invulnérable (endurance).</li>
  <li>Barre rapide : touchez un objet pour le manger, l’utiliser ou l’équiper.</li></ul>
  <h3>Clavier</h3>
  <ul><li>Déplacement : ZQSD / WASD / flèches · Course : Maj</li>
  <li>Attaque : Espace ou J · Action : E, F ou Entrée · Esquive : K ou X</li>
  <li>Barre rapide : 1 à 5 · Sac : I ou Tab · Fabrication : C · Construction : B · Carte : M · Pause : Échap</li></ul>
  <h3>Survie</h3>
  <ul><li>Trois jauges : santé, faim, endurance. La faim baisse lentement ; à zéro, vous perdez des PV.</li>
  <li>La santé remonte lentement si vous êtes nourri et hors combat, plus vite près d’un feu.</li>
  <li>Les zombies entendent la récolte et les combats. La nuit, une horde attaque : préparez palissades, portes et pieux.</li>
  <li>La paillasse définit votre point de réapparition. On y dort une fois la horde de la nuit repoussée.</li>
  <li>En cas de mort, la moitié de votre sac tombe dans un sac récupérable, indiqué sur la carte. Les fragments ne sont jamais perdus.</li></ul>`;
  return panel('Commandes et règles', host, body);
}

export function creditsPanel(host: PanelHost): HTMLElement {
  const body = h('div', { class: 'credits' });
  body.append(h('p', { text: 'Tous les graphismes et sons proviennent de ressources gratuites sous licences libres, téléchargées puis découpées ou converties sans être redessinées. Détail complet : ASSET_CREDITS.md et assets/manifest.json.' }));
  for (const c of CREDITS) {
    body.append(h('h3', { text: c.pack }));
    body.append(h('p', {}, `Auteurs : ${c.authors}`, h('br'), `Licence : ${c.license}`, h('br'), 'Source : ', h('a', { href: c.url, target: '_blank', rel: 'noopener', text: c.url }), c.via ? h('span', { text: ` (copie utilisée : ${c.via})` }) : null));
    if (c.note) body.append(h('p', { class: 'note-muted', text: c.note }));
  }
  body.append(h('h3', { text: 'Jeu' }), h('p', { text: 'Code : Phaser 3 (licence MIT), TypeScript, Vite. Conception et programmation : projet « Les Bois de Cendre ».' }));
  return panel('Crédits', host, body);
}

export function notePanel(host: PanelHost, id: string): HTMLElement {
  const n = NOTE_BY_ID[id];
  const body = h('div', {}, h('div', { class: 'notetext', text: n ? n.text : '…' }));
  return panel(n ? n.title : 'Note', host, body, { narrow: true });
}

export function bedPanel(host: PanelHost): HTMLElement {
  const g = host.game;
  const c = canSleep(g);
  const body = h('div', {},
    h('p', { text: 'Cette paillasse est votre point de réapparition.' }),
    h('p', { class: 'note-muted', text: 'Dormir fait passer le temps jusqu’à l’aube (-18 faim, +35 PV). Impossible avant d’avoir repoussé la horde de la nuit, ni avec des ennemis à proximité.' }),
    c.ok ? null : h('p', { class: 'reason', text: c.reason ?? '' }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary', text: 'Dormir jusqu’à l’aube', disabled: !c.ok, onclick: () => { const r = sleep(g); if (r.ok) { host.closePanel(); void host.saveNow('sleep'); } } }),
      h('button', { class: 'btn', text: 'Fermer', onclick: () => host.closePanel() })),
  );
  return panel('Paillasse', host, body, { narrow: true });
}

export function sanctuaryPanel(host: PanelHost): HTMLElement {
  const g = host.game;
  const body = h('div', {},
    h('p', { text: 'Le sceau est entier. Quand vous le déciderez, toutes les créatures des bois convergeront ici en trois vagues.' }),
    h('p', { class: 'note-muted', text: 'Conseil : entourez la pierre de palissades et de pieux, gardez des bandages, un ragoût et une arme de fer. En cas de mort, l’assaut s’arrête et pourra être relancé.' }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn danger', text: 'Lancer l’assaut final', onclick: () => { startFinalAssault(g); host.closePanel(); } }),
      h('button', { class: 'btn', text: 'Plus tard', onclick: () => host.closePanel() })),
  );
  return panel('Sanctuaire du Loup', host, body, { narrow: true });
}

export function confirmPanel(host: PanelHost, text: string, ok: string, onOk: () => void, onCancel?: () => void): HTMLElement {
  const body = h('div', {},
    h('p', { text }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn danger', text: ok, onclick: () => onOk() }),
      h('button', { class: 'btn', text: 'Annuler', onclick: () => (onCancel ? onCancel() : host.closePanel()) })),
  );
  return panel('Confirmation', host, body, { narrow: true });
}
