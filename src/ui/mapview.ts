// Carte interactive : centrée sur le joueur, zoom adapté à la zone découverte,
// zoom +/−, déplacement au doigt (et pincement), recentrage, nord, légende, marqueurs.
// Le brouillard de découverte est conservé : rien n'est révélé avant d'avoir été vu.
import { TILE } from '../config/balance';
import { BUILDING_BY_ID } from '../data/buildings';
import { addMarker, MARKER_CATS, removeMarker } from '../sim/actions';
import type { Game } from '../sim/game';
import { currentObjective } from '../sim/objectives';
import type { MarkerCat } from '../sim/types';
import { FOG_CELL, ZONE_NAMES } from '../world/world';
import { h } from './dom';
import { icon } from './icons';

const ZOOMS = [2, 3, 4, 6, 8, 12]; // pixels CSS par tuile

export interface MapState {
  cx: number; // centre (tuiles)
  cy: number;
  z: number; // index dans ZOOMS
  init: boolean;
  marking: boolean;
  draft: { x: number; y: number } | null;
  draftCat: MarkerCat;
  selected: number | null;
  w: number;
}

export function newMapState(): MapState {
  return { cx: 0, cy: 0, z: 3, init: false, marking: false, draft: null, draftCat: 'resource', selected: null, w: 0 };
}

let base: { seed: number; gen: number; canvas: HTMLCanvasElement } | null = null;

function baseMap(g: Game): HTMLCanvasElement {
  const w = g.world;
  if (base && base.seed === w.seed && base.gen === w.genVersion) return base.canvas;
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
  base = { seed: w.seed, gen: w.genVersion, canvas: c };
  return c;
}

/** Étendue de la zone découverte (tuiles). */
function discoveredBounds(g: Game): { x0: number; y0: number; x1: number; y1: number } {
  const w = g.world;
  const cw = Math.ceil(w.w / FOG_CELL);
  const ch = Math.ceil(w.h / FOG_CELL);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++)
      if (w.fog[y * cw + x]) {
        x0 = Math.min(x0, x * FOG_CELL);
        y0 = Math.min(y0, y * FOG_CELL);
        x1 = Math.max(x1, (x + 1) * FOG_CELL);
        y1 = Math.max(y1, (y + 1) * FOG_CELL);
      }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: w.w, y1: w.h };
  return { x0, y0, x1, y1 };
}

export interface MapHost {
  game: Game;
  rerender(): void;
}

export function mapView(host: MapHost, st: MapState): HTMLElement {
  const g = host.game;
  const w = g.world;
  const p = g.player;
  const ptx = p.x / TILE;
  const pty = p.y / TILE;
  const portrait = window.innerHeight > window.innerWidth;
  // taille mesurée après le premier affichage (place réellement disponible dans le panneau)
  const vw = Math.round(st.w || Math.max(220, Math.min(window.innerWidth - (portrait ? 48 : 320), 760)));
  const vh = Math.round(Math.max(170, Math.min(window.innerHeight - (portrait ? 300 : 96), portrait ? 620 : 560)));
  if (!st.init) {
    // zoom : la zone découverte tient dans la vue, sans descendre sous une échelle lisible
    const b = discoveredBounds(g);
    const span = Math.max(b.x1 - b.x0, b.y1 - b.y0, 24);
    let z = ZOOMS.length - 1;
    while (z > 1 && ZOOMS[z] * span > Math.min(vw, vh) * 1.15) z--;
    st.z = z;
    st.cx = ptx;
    st.cy = pty;
    st.init = true;
  }
  const Z = ZOOMS[st.z];
  const clampCenter = () => {
    const hw = vw / 2 / Z;
    const hh = vh / 2 / Z;
    st.cx = w.w <= hw * 2 ? w.w / 2 : Math.max(hw, Math.min(w.w - hw, st.cx));
    st.cy = w.h <= hh * 2 ? w.h / 2 : Math.max(hh, Math.min(w.h - hh, st.cy));
  };
  clampCenter();

  const wrap = h('div', { id: 'mapwrap', style: { width: `${vw}px`, height: `${vh}px` } });
  const cv = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(vw * dpr);
  cv.height = Math.round(vh * dpr);
  cv.style.width = `${vw}px`;
  cv.style.height = `${vh}px`;
  wrap.append(cv);
  const layer = h('div', { class: 'maplayer' });
  wrap.append(layer);

  const toScreen = (tx: number, ty: number) => ({ x: (tx - st.cx) * Z + vw / 2, y: (ty - st.cy) * Z + vh / 2 });
  const toTile = (sx: number, sy: number) => ({ x: (sx - vw / 2) / Z + st.cx, y: (sy - vh / 2) / Z + st.cy });

  const draw = () => {
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0d0b09';
    ctx.fillRect(0, 0, vw, vh);
    const o = toScreen(0, 0);
    ctx.drawImage(baseMap(g), o.x, o.y, w.w * Z, w.h * Z);
    // constructions
    ctx.fillStyle = '#e8c77a';
    for (const b of w.buildings.values()) {
      const d = BUILDING_BY_ID[b.type];
      const s = toScreen(b.x, b.y);
      ctx.fillRect(s.x, s.y, d.w * Z, d.h * Z);
    }
    // brouillard
    const cw = Math.ceil(w.w / FOG_CELL);
    ctx.fillStyle = '#0d0b09';
    for (let y = 0; y < Math.ceil(w.h / FOG_CELL); y++)
      for (let x = 0; x < cw; x++)
        if (!w.fog[y * cw + x]) {
          const s = toScreen(x * FOG_CELL, y * FOG_CELL);
          if (s.x > vw || s.y > vh || s.x + FOG_CELL * Z < 0 || s.y + FOG_CELL * Z < 0) continue;
          ctx.fillRect(Math.floor(s.x), Math.floor(s.y), Math.ceil(FOG_CELL * Z) + 1, Math.ceil(FOG_CELL * Z) + 1);
        }
  };

  const marks: { el: HTMLElement; tx: number; ty: number }[] = [];
  const mark = (tx: number, ty: number, key: string | null, label: string, cls: string, onTap?: () => void) => {
    const m = h('div', { class: `mapmark ${cls}` });
    if (key) m.append(icon(key, 20));
    if (label) m.append(h('span', { text: label }));
    if (onTap) {
      m.classList.add('tap');
      m.addEventListener('pointerup', (e) => {
        if (moved) return;
        e.stopPropagation();
        onTap();
      });
    }
    layer.append(m);
    marks.push({ el: m, tx, ty });
  };
  const place = () => {
    for (const m of marks) {
      const s = toScreen(m.tx, m.ty);
      m.el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`;
      m.el.style.display = s.x < -30 || s.y < -30 || s.x > vw + 30 || s.y > vh + 30 ? 'none' : '';
    }
  };

  // repères : camp, lieux découverts, objectif, paillasse, sac de mort, marqueurs, joueur
  const obj = currentObjective(g);
  const objTargets = new Set<string>();
  if (obj?.id === 'o_fragments') for (const lm of w.landmarks) if (['hamlet', 'cemetery', 'stones'].includes(lm.id) && lm.discovered) {
    const frag = { hamlet: 'frag_1', cemetery: 'frag_2', stones: 'frag_3' }[lm.id]!;
    if (!g.fragmentsTaken.includes(frag)) objTargets.add(lm.id);
  }
  if (obj && ['o_restore', 'o_final'].includes(obj.id)) objTargets.add('sanctuary');
  if (obj?.id === 'o_explore') for (const lm of w.landmarks) if (['hamlet', 'cemetery', 'stones'].includes(lm.id) && lm.discovered) objTargets.add(lm.id);
  for (const lm of w.landmarks) {
    if (!lm.discovered) continue;
    const cls = lm.id === 'start' ? 'camp' : objTargets.has(lm.id) ? 'objective' : lm.scene ? 'scene' : 'place';
    mark(lm.x + 0.5, lm.y + 0.5, lm.icon, lm.name, cls);
  }
  for (const b of w.buildings.values()) if (b.type === 'bed') mark(b.x + 1, b.y + 1, 'world:bed_straw', 'Paillasse', 'camp');
  for (const bag of w.bags.values()) if (bag.kind === 'death' || bag.id === g.deathBagId) mark(bag.x / TILE, bag.y / TILE, 'items:i_bag', 'Votre sac', 'death');
  for (const m of g.markers) {
    const cat = MARKER_CATS.find((c) => c.cat === m.cat)!;
    mark(m.x + 0.5, m.y + 0.5, cat.icon, m.name, `user ${m.cat}${st.selected === m.id ? ' sel' : ''}`, () => {
      st.selected = st.selected === m.id ? null : m.id;
      host.rerender();
    });
  }
  if (st.draft) mark(st.draft.x + 0.5, st.draft.y + 0.5, MARKER_CATS.find((c) => c.cat === st.draftCat)!.icon, 'Nouveau', `user ${st.draftCat} draft`);
  mark(ptx, pty, null, '', 'player');

  const north = h('div', { class: 'map-north', 'aria-label': 'Nord en haut' }, h('i'), h('b', { text: 'N' }));
  wrap.append(north);
  if (st.marking) wrap.append(h('div', { class: 'map-banner', text: st.draft ? 'Choisissez un type et un nom, puis « Ajouter ».' : 'Touchez la carte à l’endroit à marquer.' }));

  // déplacement au doigt, pincement, et pose de marqueur au toucher
  const pts = new Map<number, { x: number; y: number }>();
  let moved = false;
  let travel = 0;
  let startDist = 0;
  let startZ = st.z;
  wrap.addEventListener('pointerdown', (e) => {
    wrap.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    travel = 0;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      startDist = Math.hypot(a.x - b.x, a.y - b.y);
      startZ = st.z;
    }
  });
  wrap.addEventListener('pointermove', (e) => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      if (Math.abs(dx) + Math.abs(dy) > 0) {
        st.cx -= dx / Z;
        st.cy -= dy / Z;
        clampCenter();
      }
    } else if (pts.size === 2 && startDist > 0) {
      const [a, b] = [...pts.values()];
      const ratio = Math.hypot(a.x - b.x, a.y - b.y) / startDist;
      const nz = Math.max(0, Math.min(ZOOMS.length - 1, startZ + Math.round(Math.log2(ratio) * 2)));
      if (nz !== st.z) {
        st.z = nz;
        host.rerender();
        return;
      }
    }
    travel += Math.abs(dx) + Math.abs(dy);
    if (travel > 6 || pts.size > 1) moved = true;
    draw();
    place();
  });
  const up = (e: PointerEvent) => {
    const had = pts.delete(e.pointerId);
    if (!had) return;
    if (!moved && pts.size === 0 && st.marking) {
      const r = wrap.getBoundingClientRect();
      const t = toTile(e.clientX - r.left, e.clientY - r.top);
      st.draft = { x: Math.floor(t.x), y: Math.floor(t.y) };
      host.rerender();
    }
  };
  wrap.addEventListener('pointerup', up);
  wrap.addEventListener('pointercancel', (e) => pts.delete(e.pointerId));
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    st.z = Math.max(0, Math.min(ZOOMS.length - 1, st.z + (e.deltaY < 0 ? 1 : -1)));
    host.rerender();
  }, { passive: false });

  requestAnimationFrame(() => {
    // ajuste la carte à la largeur réellement disponible
    const avail = wrap.parentElement?.clientWidth ?? vw;
    if (avail > 100 && Math.abs(avail - vw) > 6) {
      st.w = avail;
      host.rerender();
      return;
    }
    draw();
    place();
  });
  draw();
  place();

  // commandes de carte
  const zoomBy = (d: number) => {
    st.z = Math.max(0, Math.min(ZOOMS.length - 1, st.z + d));
    host.rerender();
  };
  const tools = h('div', { class: 'map-tools' },
    h('button', { class: 'btn icon-btn', 'aria-label': 'Zoom avant', text: '+', onclick: () => zoomBy(1) }),
    h('button', { class: 'btn icon-btn', 'aria-label': 'Zoom arrière', text: '−', onclick: () => zoomBy(-1) }),
    h('button', { class: 'btn', text: 'Recentrer', onclick: () => { st.cx = ptx; st.cy = pty; host.rerender(); } }),
    h('button', { class: 'btn' + (st.marking ? ' on' : ''), text: st.marking ? 'Annuler le marquage' : 'Marquer un lieu', onclick: () => { st.marking = !st.marking; st.draft = null; host.rerender(); } }),
  );

  const side = h('div', { class: 'map-side' });
  if (st.marking && st.draft) {
    const name = h('input', { type: 'text', maxlength: '24', placeholder: 'Nom (facultatif)', 'aria-label': 'Nom du marqueur' }) as HTMLInputElement;
    const cats = h('div', { class: 'chips' }, ...MARKER_CATS.map((c) => h('button', { class: 'chip' + (st.draftCat === c.cat ? ' on' : ''), onclick: () => { st.draftCat = c.cat; host.rerender(); } }, icon(c.icon, 16), c.name)));
    side.append(h('div', { class: 'map-form' }, h('b', { text: 'Nouveau marqueur' }), cats, name,
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', text: 'Ajouter', onclick: () => { addMarker(g, st.draft!.x, st.draft!.y, st.draftCat, name.value); st.draft = null; st.marking = false; host.rerender(); } }),
        h('button', { class: 'btn', text: 'Annuler', onclick: () => { st.draft = null; host.rerender(); } }))));
  }
  const sel = g.markers.find((m) => m.id === st.selected);
  if (sel) {
    side.append(h('div', { class: 'map-form' }, h('b', { text: `${sel.name} (${MARKER_CATS.find((c) => c.cat === sel.cat)!.name})` }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', text: 'Centrer', onclick: () => { st.cx = sel.x + 0.5; st.cy = sel.y + 0.5; host.rerender(); } }),
        h('button', { class: 'btn danger', text: 'Supprimer', onclick: () => { removeMarker(g, sel.id); st.selected = null; host.rerender(); } }))));
  }
  const zone = w.zoneAt(Math.floor(ptx), Math.floor(pty));
  side.append(h('div', { class: 'legend' },
    h('span', { class: 'lg player', text: 'Vous' }),
    h('span', { class: 'lg camp', text: 'Camp' }),
    h('span', { class: 'lg objective', text: 'Objectif' }),
    h('span', { class: 'lg death', text: 'Sac perdu' }),
    h('span', { class: 'lg user', text: 'Vos marqueurs' }),
    h('span', { class: 'lg build', text: 'Constructions' }),
  ));
  side.append(h('div', { class: 'note-muted', text: `${ZONE_NAMES[zone]} · exploré ${Math.round(w.exploredRatio() * 100)} % · fragments ${g.fragmentsFound()}/3` }));
  if (g.markers.length) {
    side.append(h('div', { class: 'marker-list' }, ...g.markers.map((m) => h('div', { class: 'mrow' },
      icon(MARKER_CATS.find((c) => c.cat === m.cat)!.icon, 16),
      h('button', { class: 'linkish', text: m.name, onclick: () => { st.selected = m.id; st.cx = m.x + 0.5; st.cy = m.y + 0.5; host.rerender(); } }),
      h('button', { class: 'btn small danger', 'aria-label': `Supprimer ${m.name}`, text: 'Suppr.', onclick: () => { removeMarker(g, m.id); if (st.selected === m.id) st.selected = null; host.rerender(); } })))));
  }
  if (portrait) return h('div', { class: 'map-layout' }, h('div', { class: 'map-main' }, wrap, tools), side);
  side.prepend(tools);
  return h('div', { class: 'map-layout' }, h('div', { class: 'map-main' }, wrap), side);
}
