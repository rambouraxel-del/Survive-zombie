// Panneaux modaux (le jeu est en pause tant qu'un panneau est ouvert).
// La gestion (sac, fabrication, construction, carte) est regroupée dans un panneau à onglets ;
// les options et la sauvegarde restent dans une partie distincte (Pause).
import { BUILDINGS, BUILDING_BY_ID, buildingStats } from '../data/buildings';
import { item, type EquipSlot, type Station } from '../data/items';
import { NOTE_BY_ID } from '../data/notes';
import { STATION_NAMES, producingEntry, type Recipe } from '../data/recipes';
import {
  canCraft, canSleep, canUpgrade, containerName, containerSlots, craft, dropSlot, equipSlot, foodGain, itemRepairCost, moveSlot, recipeQty,
  repairItem, sleep, takeAll, takeFromContainer, putInContainer, unequip, useSlot, demolishRefund, demolish, upgradeBuilding,
} from '../sim/actions';
import { benefits, compareWithEquipped, entryByKey, listEntries, quantityOptions, stationText, type CraftFilter } from '../sim/crafting';
import type { Game } from '../sim/game';
import { assignHotbar, hotbarQty, isHotbarAssignable, swapHotbar, HOTBAR_SIZE } from '../sim/hotbar';
import { countItem } from '../sim/inventory';
import { repairBuildingAction, repairCost, startFinalAssault } from '../sim/interact';
import { currentObjective, inIntro, OBJECTIVES } from '../sim/objectives';
import type { Settings } from '../settings';
import { h } from './dom';
import { hotbarSlotEl, slotEl } from './hud';
import { icon } from './icons';
import { mapView, newMapState } from './mapview';
import { CREDITS } from '../data/credits';

export interface PanelHost {
  game: Game;
  settings: Settings;
  version: string;
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
  resetTips(): void;
  skipIntro(): void;
}

// état d'interface conservé pendant la session (onglet, filtre, sélection…)
export const ui = {
  tab: 'inventory' as ManageTab,
  inv: { sel: null as number | EquipSlot | null, moving: null as number | null, hbSel: null as number | null, pickFor: null as number | null, hbMove: null as number | null },
  craft: { filter: 'all' as CraftFilter, only: false, sheet: null as string | null },
  map: newMapState(),
};

export type ManageTab = 'inventory' | 'craft' | 'build' | 'map';

function panel(title: string, host: PanelHost, body: HTMLElement, opts: { narrow?: boolean; tabs?: HTMLElement; wide?: boolean; headTabs?: boolean } = {}): HTMLElement {
  // onglets dans l'en-tête : la hauteur utile est préservée (paysage)
  // (en portrait étroit, les onglets passent sur une seconde ligne sous le titre)
  const p = h('div', { class: 'panel' + (opts.narrow ? ' narrow' : '') + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-label': title },
    h('div', { class: 'phead' }, h('h2', { text: title }), opts.headTabs ? opts.tabs ?? null : null, h('button', { class: 'close', text: 'Fermer', onclick: () => host.closePanel() })),
    opts.headTabs ? null : opts.tabs ?? null,
    body,
  );
  body.classList.add('pbody');
  return p;
}

function costLine(g: Game, cost: Record<string, number>, times = 1): HTMLElement {
  const box = h('div', { class: 'ings' });
  for (const [id, n] of Object.entries(cost)) {
    const have = countItem(g.player.inv, id);
    box.append(h('span', { class: 'ing ' + (have >= n * times ? 'have' : 'miss') }, icon(item(id).icon, 18), `${item(id).name} ${have}/${n * times}`));
  }
  return box;
}

// ------------------------------------------------------------ panneau de gestion à onglets
export function managePanelTabs(host: PanelHost, tab: ManageTab): HTMLElement {
  ui.tab = tab;
  const tabs = h('div', { class: 'tabs main-tabs', role: 'tablist' });
  const TABS: [ManageTab, string, string][] = [['inventory', 'Sac', 'I'], ['craft', 'Fabriquer', 'C'], ['build', 'Construire', 'B'], ['map', 'Carte', 'M']];
  for (const [k, lbl, key] of TABS)
    tabs.append(h('button', { class: 'tab' + (k === tab ? ' on' : ''), role: 'tab', 'aria-selected': k === tab ? 'true' : 'false', onclick: () => host.openPanel(k) }, lbl, h('kbd', { text: key })));
  let body: HTMLElement;
  let title = 'Sac';
  switch (tab) {
    case 'inventory':
      body = inventoryBody(host);
      break;
    case 'craft':
      body = craftBody(host);
      title = 'Fabrication';
      break;
    case 'build':
      body = buildBody(host);
      title = 'Construction';
      break;
    default:
      body = mapView({ game: host.game, rerender: () => host.openPanel('map') }, ui.map);
      title = 'Carte';
  }
  const p = panel(title, host, body, { tabs, wide: tab === 'map', headTabs: true });
  p.classList.add('manage');
  return p;
}

// ------------------------------------------------------------ sac
function inventoryBody(host: PanelHost): HTMLElement {
  const g = host.game;
  const p = g.player;
  const st = ui.inv;
  const body = h('div', {});
  const rerender = () => host.openPanel('inventory');

  // raccourcis (indépendants du sac)
  const hbRow = h('div', { class: 'hb-row' });
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const s = hotbarSlotEl(g, i, { sel: st.hbSel === i || st.pickFor === i });
    if (st.hbMove !== null) s.classList.add('drop-target');
    s.addEventListener('click', () => {
      if (st.hbMove !== null) {
        swapHotbar(g, st.hbMove, i);
        st.hbMove = null;
        st.hbSel = i;
        host.sfx('click');
      } else if (st.sel !== null && typeof st.sel === 'number' && p.inv[st.sel] && isHotbarAssignable(p.inv[st.sel]!.id) && st.pickFor === null) {
        // un objet est sélectionné : le toucher d'un raccourci l'y affecte
        assignHotbar(g, i, p.inv[st.sel]!.id);
        host.sfx('click');
        st.hbSel = null;
      } else {
        st.hbSel = st.hbSel === i ? null : i;
        st.pickFor = null;
        st.sel = null;
      }
      rerender();
    });
    hbRow.append(s);
  }
  body.append(h('div', { class: 'sect' }, h('h3', { text: 'Raccourcis' }), hbRow));

  const equipRow = h('div', { class: 'equip-row' });
  for (const [slot, label] of [['weapon', 'Arme'], ['tool', 'Outil'], ['armor', 'Protection']] as const) {
    const s = slotEl(p.equip[slot], { sel: st.sel === slot });
    s.addEventListener('click', () => {
      st.sel = slot;
      st.moving = null;
      st.hbSel = null;
      st.pickFor = null;
      rerender();
    });
    equipRow.append(h('div', { class: 'eqslot' }, s, label));
  }
  const grid = h('div', { class: 'grid' });
  p.inv.forEach((stack, i) => {
    const s = slotEl(stack, { sel: st.sel === i });
    if (st.moving !== null) s.classList.add('drop-target');
    if (st.pickFor !== null && stack && isHotbarAssignable(stack.id)) s.classList.add('pickable');
    s.addEventListener('click', () => {
      if (st.moving !== null) {
        moveSlot(g, st.moving, i);
        host.sfx('click');
        st.moving = null;
        st.sel = i;
      } else if (st.pickFor !== null) {
        if (stack && isHotbarAssignable(stack.id)) {
          assignHotbar(g, st.pickFor, stack.id);
          host.sfx('click');
          st.hbSel = st.pickFor;
          st.pickFor = null;
        } else if (stack) g.toast('Seuls les aliments, soins, outils, armes et protections vont en raccourci.', 'info');
      } else {
        st.sel = i;
        st.hbSel = null;
      }
      rerender();
    });
    grid.append(s);
  });

  const det = h('div', { class: 'details' });
  if (st.moving !== null) {
    det.append(h('p', { class: 'mode-banner', text: 'Déplacement : touchez la case du sac où poser l’objet (échange si elle est occupée).' }), h('div', { class: 'actions' }, h('button', { class: 'btn', text: 'Annuler', onclick: () => { st.moving = null; rerender(); } })));
  } else if (st.pickFor !== null) {
    det.append(h('p', { class: 'mode-banner', text: `Raccourci ${st.pickFor + 1} : touchez un objet du sac (aliment, soin, outil, arme ou protection).` }), h('div', { class: 'actions' }, h('button', { class: 'btn', text: 'Annuler', onclick: () => { st.pickFor = null; rerender(); } })));
  } else if (st.hbMove !== null) {
    det.append(h('p', { class: 'mode-banner', text: `Réorganisation : touchez le raccourci où placer « ${item(g.hotbar[st.hbMove]!.id).name} » (les objets du sac ne bougent pas).` }), h('div', { class: 'actions' }, h('button', { class: 'btn', text: 'Annuler', onclick: () => { st.hbMove = null; rerender(); } })));
  } else if (st.hbSel !== null) {
    const e = g.hotbar[st.hbSel];
    const i = st.hbSel;
    if (!e) {
      det.append(h('h3', { text: `Raccourci ${i + 1} vide` }), h('p', { class: 'note-muted', text: 'Choisissez un objet du sac à placer ici. Le raccourci désigne un type d’objet : rien n’est déplacé dans le sac.' }));
      det.append(h('div', { class: 'actions' }, h('button', { class: 'btn primary', text: 'Choisir un objet', onclick: () => { st.pickFor = i; rerender(); } })));
    } else {
      const d = item(e.id);
      const n = hotbarQty(g, e.id);
      det.append(h('h3', {}, icon(d.icon, 28), `Raccourci ${i + 1} : ${d.name}`), h('p', { class: 'note-muted', text: n ? `Disponible : ${n}.` : 'Épuisé : le raccourci reste en place et se remplira dès que vous en retrouverez.' }));
      det.append(h('div', { class: 'actions' },
        h('button', { class: 'btn', text: 'Changer d’objet', onclick: () => { st.pickFor = i; rerender(); } }),
        h('button', { class: 'btn', text: 'Déplacer le raccourci', onclick: () => { st.hbMove = i; rerender(); } }),
        h('button', { class: 'btn danger', text: 'Vider', onclick: () => { assignHotbar(g, i, null); rerender(); } })));
    }
  } else {
    const sel = st.sel;
    const stack = sel === null ? null : typeof sel === 'number' ? p.inv[sel] : p.equip[sel];
    if (!stack) det.append(h('p', { class: 'note-muted', text: 'Touchez un objet pour voir ses effets et ses actions. Touchez une case « Raccourcis » pour la configurer.' }));
    else det.append(...itemSheet(host, stack, sel!, rerender));
  }
  body.append(h('div', { class: 'inv-layout' }, h('div', {}, equipRow, grid), det));
  const free = p.inv.filter((s) => !s).length;
  body.append(h('p', { class: 'note-muted', text: `${24 - free}/24 emplacements utilisés.` }));
  return body;
}

/** Fiche d'un objet : effets chiffrés, gain réel des aliments, actions. */
function itemSheet(host: PanelHost, stack: { id: string; qty: number; dur?: number }, sel: number | EquipSlot, rerender: () => void): HTMLElement[] {
  const g = host.game;
  const st = ui.inv;
  const d = item(stack.id);
  const out: HTMLElement[] = [];
  out.push(h('h3', {}, icon(d.icon, 28), d.name + (stack.qty > 1 ? ` × ${stack.qty}` : '')));
  out.push(h('p', { text: d.desc }));
  const lines: HTMLElement[] = [];
  const fg = foodGain(g, stack.id);
  if (fg) {
    lines.push(h('div', { text: `Apport : +${fg.nominal} faim${d.food!.health ? ` · +${d.food!.health} PV` : ''}${d.food!.regen ? ' · récupération accrue 60 s' : ''}` }));
    lines.push(h('div', { class: fg.surplus > 0 ? 'warnline' : 'okline', text: `Gain actuel : +${fg.effective} faim${fg.surplus > 0 ? ` ; surplus perdu : ${fg.surplus}` : ''}${fg.heal ? ` · +${fg.heal} PV` : ''}` }));
    if (!fg.useful) lines.push(h('div', { class: 'reason', text: 'Vous n’avez pas faim : manger maintenant ne servirait à rien.' }));
  } else for (const b of benefits(stack.id)) lines.push(h('div', { text: b }));
  const cmp = compareWithEquipped(g, stack.id);
  if (cmp && typeof sel === 'number') lines.push(h('div', { class: 'note-muted', text: cmp }));
  if (d.durability !== undefined && stack.dur !== undefined) lines.push(h('div', { text: `État : ${Math.ceil(stack.dur)}/${d.durability}${stack.dur <= 0 ? ' (cassé)' : ''}` }));
  lines.push(h('div', { class: 'note-muted', text: `Pile max : ${d.stack}` }));
  out.push(h('div', { class: 'stats' }, ...lines));
  const acts = h('div', { class: 'actions' });
  if (typeof sel === 'number') {
    if (d.food) acts.append(h('button', { class: 'btn primary', text: 'Manger', disabled: !fg!.useful, onclick: () => { useSlot(g, sel); rerender(); } }));
    if (d.heal) acts.append(h('button', { class: 'btn primary', text: 'Utiliser', onclick: () => { useSlot(g, sel); rerender(); } }));
    if (d.slot) acts.append(h('button', { class: 'btn primary', text: 'Équiper', onclick: () => { equipSlot(g, sel); st.sel = d.slot!; rerender(); } }));
    acts.append(h('button', { class: 'btn', text: 'Ranger ailleurs', onclick: () => { st.moving = sel; rerender(); } }));
    if (d.kind !== 'quest')
      acts.append(h('button', { class: 'btn danger', text: 'Jeter', onclick: () => host.confirm(`Jeter ${stack.qty} × ${d.name} ? L’objet restera au sol dans un sac.`, 'Jeter', () => { dropSlot(g, sel); st.sel = null; host.openPanel('inventory'); }) }));
  } else acts.append(h('button', { class: 'btn', text: 'Retirer', onclick: () => { unequip(g, sel); st.sel = null; rerender(); } }));
  if (d.repair && d.durability !== undefined && (stack.dur ?? d.durability) < d.durability) {
    const cost = Object.entries(itemRepairCost(g, stack.id)!).map(([id, n]) => `${n} ${item(id).name}`).join(', ');
    acts.append(h('button', { class: 'btn', text: `Réparer (${cost})`, onclick: () => { const r = repairItem(g, sel); if (!r.ok && r.reason) g.toast(r.reason, 'warn'); rerender(); } }));
    out.push(h('div', { class: 'reason', text: `Réparation : ${STATION_NAMES[d.repair.station]} à proximité.` }));
  }
  out.push(acts);
  if (isHotbarAssignable(stack.id)) {
    const cur = g.hotbar.findIndex((x) => x && x.id === stack.id);
    const row = h('div', { class: 'assign' }, h('span', { text: cur >= 0 ? `En raccourci : case ${cur + 1}. Déplacer vers :` : 'Mettre en raccourci :' }));
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const occupant = g.hotbar[i];
      row.append(h('button', { class: 'btn small' + (i === cur ? ' on' : ''), 'aria-label': `Raccourci ${i + 1}${occupant ? ` (remplace ${item(occupant.id).name})` : ''}`, text: String(i + 1), onclick: () => { assignHotbar(g, i, stack.id); host.sfx('click'); rerender(); } }));
    }
    out.push(row);
  }
  return out;
}

// ------------------------------------------------------------ fabrication
function craftBody(host: PanelHost): HTMLElement {
  const g = host.game;
  const cs = ui.craft;
  if (cs.sheet) {
    const e = entryByKey(cs.sheet);
    if (e) return recipeSheet(host, cs.sheet);
    cs.sheet = null;
  }
  const body = h('div', {});
  const filters = h('div', { class: 'chips' });
  const opts: [CraftFilter, string][] = [['all', 'Tout'], ['hand', 'À la main'], ['workbench', 'Établi'], ['campfire', 'Feu de camp'], ['forge', 'Forge']];
  for (const [k, lbl] of opts) {
    const near = k !== 'all' && k !== 'hand' && g.nearStation(k as Station);
    filters.append(h('button', { class: 'chip' + (k === cs.filter ? ' on' : ''), onclick: () => { cs.filter = k; host.openPanel('craft'); } }, lbl + (near ? ' ✓' : '')));
  }
  filters.append(h('button', { class: 'chip toggle' + (cs.only ? ' on' : ''), 'aria-pressed': cs.only ? 'true' : 'false', onclick: () => { cs.only = !cs.only; host.openPanel('craft'); } }, cs.only ? 'Fabricables seulement ✓' : 'Fabricables seulement'));
  body.append(filters);
  const list = listEntries(g, cs.filter, cs.only);
  if (!list.length) body.append(h('p', { class: 'note-muted', text: cs.only ? 'Rien n’est fabricable ici pour le moment. Retirez le filtre pour voir ce qu’il manque.' : 'Aucune recette.' }));
  // ordre fixe : la liste ne se réorganise jamais selon la disponibilité
  for (const e of list) {
    const d = item(e.output);
    const r0 = e.recipes[0];
    const multi = e.recipes.length > 1;
    const okAny = e.recipes.some((r) => canCraft(g, r).ok);
    const c = canCraft(g, r0);
    const row = h('div', { class: 'recipe' + (okAny ? '' : ' disabled') + (g.pinned === e.key ? ' pinned' : ''), role: 'button', tabindex: '0', 'aria-label': `${d.name} : ouvrir la fiche` });
    row.append(
      h('div', { class: 'rico' }, icon(d.icon, 40)),
      h('div', { class: 'rmain' },
        h('div', { class: 'rname' }, `${d.name}${recipeQty(g, r0) > 1 ? ` ×${recipeQty(g, r0)}` : ''} `, h('small', { text: `· ${STATION_NAMES[e.station]}` }), g.pinned === e.key ? h('span', { class: 'tag', text: 'Suivie' }) : null),
        h('div', { class: 'rben', text: multi ? `${e.recipes.length} méthodes : ${e.recipes.map((r) => r.method).join(' ou ')}` : benefits(e.output).slice(0, 3).join(' · ') }),
        multi ? null : costLine(g, r0.inputs),
        !multi && !c.ok ? h('div', { class: 'reason', text: c.reason ?? '' }) : null,
      ),
    );
    const btn = multi
      ? h('button', { class: 'btn', text: 'Choisir', onclick: (ev: Event) => { ev.stopPropagation(); cs.sheet = e.key; host.openPanel('craft'); } })
      : h('button', { class: 'btn primary', text: 'Fabriquer', disabled: !c.ok, onclick: (ev: Event) => { ev.stopPropagation(); doCraft(host, r0.id, 1); } });
    row.append(btn);
    row.addEventListener('click', () => { cs.sheet = e.key; host.openPanel('craft'); });
    body.append(row);
  }
  return body;
}

function doCraft(host: PanelHost, id: string, times: number): void {
  const g = host.game;
  const res = craft(g, id, times);
  if (!res.ok && res.reason) g.toast(res.reason, 'warn');
  const scroll = (document.querySelector('#panel-layer .pbody') as HTMLElement | null)?.scrollTop ?? 0;
  host.openPanel('craft');
  const nb = document.querySelector('#panel-layer .pbody') as HTMLElement | null;
  if (nb) nb.scrollTop = scroll;
}

/** Fiche de recette : usage, ingrédients, station, quantité, bénéfices, comparaison, quantités. */
function recipeSheet(host: PanelHost, key: string): HTMLElement {
  const g = host.game;
  const e = entryByKey(key)!;
  const d = item(e.output);
  const body = h('div', { class: 'sheet' });
  body.append(h('button', { class: 'btn back', text: '← Toutes les recettes', onclick: () => { ui.craft.sheet = null; host.openPanel('craft'); } }));
  body.append(h('h3', { class: 'sheet-h' }, icon(d.icon, 36), d.name));
  body.append(h('p', { text: d.desc }));
  const ben = benefits(e.output);
  if (ben.length) body.append(h('div', { class: 'stats' }, h('div', { class: 'note-muted', text: 'Effets :' }), ...ben.map((b) => h('div', { text: b }))));
  const cmp = compareWithEquipped(g, e.output);
  if (cmp) body.append(h('p', { class: 'compare', text: cmp }));
  for (const r of e.recipes) body.append(methodBlock(host, r, e.recipes.length > 1));
  const pinned = g.pinned === key;
  body.append(h('div', { class: 'actions' },
    h('button', { class: 'btn' + (pinned ? ' on' : ''), text: pinned ? 'Ne plus suivre' : 'Épingler cette recette', onclick: () => { g.pinned = pinned ? null : key; host.openPanel('craft'); } }),
    pinned ? h('span', { class: 'note-muted', text: 'Les ressources manquantes s’affichent en haut de l’écran.' }) : null));
  return body;
}

function methodBlock(host: PanelHost, r: Recipe, showMethod: boolean): HTMLElement {
  const g = host.game;
  const box = h('div', { class: 'method' });
  if (showMethod) box.append(h('h4', { text: r.method ?? '' }));
  const ings = h('div', { class: 'ings big' });
  for (const [id, n] of Object.entries(r.inputs)) {
    const have = countItem(g.player.inv, id);
    const pe = producingEntry(id);
    const chip = h('span', { class: 'ing ' + (have >= n ? 'have' : 'miss') }, icon(item(id).icon, 20), `${item(id).name} ${have}/${n}`);
    if (pe && have < n) chip.append(h('button', { class: 'linkish', text: '(à fabriquer)', onclick: () => { ui.craft.sheet = pe.key; host.openPanel('craft'); } }));
    ings.append(chip);
  }
  box.append(h('div', { class: 'note-muted', text: 'Ingrédients (possédés / requis) :' }), ings);
  const stx = stationText(g, r);
  box.append(h('div', { class: stx.ok ? 'okline' : 'reason', text: `Station : ${stx.text}` }));
  box.append(h('div', { text: `Produit : ${recipeQty(g, r)} × ${item(r.output).name}${recipeQty(g, r) > r.qty ? ' (bonus de l’établi renforcé)' : ''}` }));
  const c = canCraft(g, r);
  if (!c.ok) box.append(h('div', { class: 'reason', text: c.reason ?? '' }));
  const acts = h('div', { class: 'actions' });
  for (const q of quantityOptions(g, r)) acts.append(h('button', { class: 'btn' + (q.times === 1 ? ' primary' : ''), text: `Fabriquer ${q.label}`, disabled: !q.ok, onclick: () => doCraft(host, r.id, q.times) }));
  box.append(acts);
  if (g.stats.craftedBy[r.id]) box.append(h('div', { class: 'note-muted', text: `Déjà fabriqué ainsi : ${g.stats.craftedBy[r.id]} fois.` }));
  return box;
}

// ------------------------------------------------------------ construction
function buildBody(host: PanelHost): HTMLElement {
  const g = host.game;
  const body = h('div', {});
  body.append(h('div', { class: 'actions', style: { marginTop: '0', marginBottom: '10px' } },
    h('button', { class: 'btn', text: 'Gérer : réparer, améliorer ou démolir', onclick: () => host.startManage() })));
  for (const b of BUILDINGS) {
    const ok = Object.entries(b.cost).every(([id, n]) => countItem(g.player.inv, id) >= n);
    body.append(h('div', { class: 'recipe' + (ok ? '' : ' disabled') },
      h('div', { class: 'rico' }, icon(b.icon, 44)),
      h('div', { class: 'rmain' },
        h('div', { class: 'rname' }, b.name, h('small', { text: ` · PV ${b.hp}${b.w > 1 || b.h > 1 ? ` · ${b.w}×${b.h}` : ''}` })),
        h('div', { class: 'note-muted', text: b.desc }),
        b.upgrade ? h('div', { class: 'rben', text: `Amélioration : ${b.upgrade.name} — ${b.upgrade.benefits.join(' ; ')}` }) : null,
        costLine(g, b.cost),
      ),
      h('button', { class: 'btn primary', text: 'Placer', disabled: !ok, onclick: () => host.startPlacement(b.id) }),
    ));
  }
  return body;
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
  const bs = buildingStats(b.type, b.level);
  body.append(h('h3', { style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '0 0 6px' } }, icon(bs.icon, 36), bs.name));
  body.append(h('p', { text: `Points de vie : ${Math.ceil(b.hp)}/${d.hp}` }));
  const acts = h('div', { class: 'actions' });
  const rc = repairCost(g, b.id)!;
  if (b.hp < d.hp) {
    body.append(h('div', { class: 'note-muted', text: 'Réparation :' }), costLine(g, rc));
    acts.append(h('button', { class: 'btn primary', text: 'Réparer', onclick: () => { repairBuildingAction(g, b.id); host.openPanel('manage', String(b.id)); } }));
  }
  if (d.upgrade && (b.level ?? 1) < 2) {
    const u = d.upgrade;
    const c = canUpgrade(g, b.id);
    body.append(h('div', { class: 'method' },
      h('h4', {}, icon(u.icon, 28), `Améliorer en ${u.name.toLowerCase()}`),
      h('div', { class: 'stats' }, ...u.benefits.map((x) => h('div', { text: x }))),
      h('div', { class: 'note-muted', text: 'Même emplacement, contenu conservé.' }),
      costLine(g, u.cost),
      c.ok ? null : h('div', { class: 'reason', text: c.reason ?? '' }),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', text: 'Améliorer', disabled: !c.ok, onclick: () => { upgradeBuilding(g, b.id); host.openPanel('manage', String(b.id)); } }))));
  } else if (d.upgrade) body.append(h('div', { class: 'stats' }, ...d.upgrade.benefits.map((x) => h('div', { class: 'okline', text: `✓ ${x}` }))));
  const refund = demolishRefund(b.type);
  const rtxt = Object.entries(refund).map(([id, n]) => `${n} ${item(id).name}`).join(', ') || 'rien';
  body.append(h('p', { class: 'note-muted', text: `Démolir rembourse : ${rtxt}.${b.items && b.items.some((s) => s) ? ' Le contenu du coffre tombera dans un sac.' : ''}` }));
  acts.append(h('button', { class: 'btn danger', text: 'Démolir', onclick: () => host.confirm(`Démolir ${bs.name} ? Remboursement : ${rtxt}.`, 'Démolir', () => { const r = demolish(g, b.id); if (!r.ok && r.reason) g.toast(r.reason, 'warn'); host.closePanel(); host.startManage(); }) }));
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
    const s = slotEl(st);
    s.addEventListener('click', () => { if (st) { putInContainer(g, i); host.sfx('pick_0'); } re(); });
    igrid.append(s);
  });
  const empty = slots.every((s) => !s);
  body.append(h('div', { class: 'cont-layout' },
    h('div', {}, h('h3', { text: `${containerName(g)} — touchez pour prendre` }), cgrid,
      empty ? h('p', { class: 'note-muted', text: 'Vide.' }) : null,
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', text: 'Tout prendre', disabled: empty, onclick: () => { takeAll(g); re(); } }))),
    h('div', {}, h('h3', { text: 'Votre sac — touchez pour déposer' }), igrid),
  ));
  return panel(containerName(g), host, body);
}

// ------------------------------------------------------------ menus
/** Menu compact regroupant les accès de gestion (le sac reste accessible directement). */
export function hubPanel(host: PanelHost): HTMLElement {
  const entry = (key: string, label: string, sub: string, panelName: string) =>
    h('button', { class: 'hub-btn', onclick: () => host.openPanel(panelName) }, icon(key, 30), h('span', { class: 'hub-lbl' }, h('b', { text: label }), h('small', { text: sub })));
  const body = h('div', { class: 'hub-grid' },
    entry('world:i_hammer', 'Fabriquer', 'Outils, armes, repas', 'craft'),
    entry('world:i_planks', 'Construire', 'Camp et défenses', 'build'),
    entry('items:i_map', 'Carte', 'Lieux et marqueurs', 'map'),
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
    const list = o.checklist?.(g);
    if (list) body.append(h('ul', { class: 'checklist' }, ...list.map((x) => h('li', { class: x.done ? 'done' : x.optional ? 'opt' : '' }, h('span', { class: 'box', text: x.done ? '✓' : '' }), x.label + (x.optional && !x.done ? ' (conseillé)' : '')))));
    else {
      const prog = o.progress?.(g);
      if (prog) body.append(h('p', { class: 'obj-prog', text: prog }));
    }
    body.append(h('p', { text: o.hint }));
  } else {
    body.append(h('h3', { class: 'obj-h', text: g.final.state === 'won' ? 'La forêt est libérée' : 'Survivre' }), h('p', { text: 'Tous les objectifs sont accomplis. Continuez à explorer, construire et survivre.' }));
  }
  const done = OBJECTIVES.filter((x) => g.completed.has(x.id) && !(x.intro && g.tutorialSkipped && !x.done(g)));
  if (done.length) {
    body.append(h('p', { class: 'note-muted', text: 'Déjà accomplis :' }));
    body.append(h('ul', { class: 'obj-done' }, ...done.map((x) => h('li', { text: x.title }))));
  }
  const acts = h('div', { class: 'actions' }, h('button', { class: 'btn primary', text: 'Reprendre', onclick: () => host.closePanel() }));
  if (inIntro(g)) acts.append(h('button', { class: 'btn', text: 'Passer l’introduction', onclick: () => host.confirm('Passer l’introduction ? Les étapes restantes seront considérées comme faites ; vous gardez tout ce que vous avez déjà accompli.', 'Passer', () => { host.skipIntro(); host.closePanel(); }) }));
  body.append(acts);
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
  const body = h('div', { class: 'options' });
  const range = (label: string, key: 'master' | 'music' | 'sfx' | 'joySize' | 'joyOpacity' | 'buttonSize', min: number, max: number, step: number, show?: (v: number) => string) => {
    const out = h('output', { text: show ? show(s[key]) : '' });
    const inp = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(s[key]), 'aria-label': label }) as HTMLInputElement;
    inp.addEventListener('input', () => { s[key] = Number(inp.value); if (show) out.textContent = show(s[key]); host.applySettings(); });
    return h('label', { class: 'opt' }, h('span', { text: label }), inp, show ? out : null);
  };
  const check = (label: string, key: 'muted' | 'reduceShake' | 'debug' | 'showHints' | 'leftHanded') => {
    const inp = h('input', { type: 'checkbox', 'aria-label': label }) as HTMLInputElement;
    inp.checked = s[key];
    inp.addEventListener('change', () => { s[key] = inp.checked; host.applySettings(); });
    return h('label', { class: 'opt' }, h('span', { text: label }), inp);
  };
  const choice = <K extends 'controlMode' | 'quality'>(label: string, key: K, opts: [Settings[K], string][]) =>
    h('div', { class: 'opt' }, h('span', { text: label }), h('div', { class: 'seg' }, ...opts.map(([v, l]) => h('button', { class: 'chip' + (s[key] === v ? ' on' : ''), 'aria-pressed': s[key] === v ? 'true' : 'false', onclick: () => { s[key] = v; host.applySettings(); host.openPanel('options'); } }, l))));
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  body.append(
    h('h3', { text: 'Commandes' }),
    choice('Type de commandes', 'controlMode', [['auto', 'Automatique'], ['touch', 'Tactile'], ['keyboard', 'Clavier']]),
    h('p', { class: 'note-muted', text: 'Automatique : les commandes tactiles s’affichent dès que vous touchez l’écran et se masquent quand vous jouez au clavier (appareils hybrides compris).' }),
    range('Taille du joystick', 'joySize', 0.8, 1.3, 0.05, pct),
    range('Opacité du joystick', 'joyOpacity', 0.35, 1, 0.05, pct),
    range('Taille des boutons', 'buttonSize', 0.9, 1.25, 0.05, pct),
    check('Disposition gaucher (joystick à droite)', 'leftHanded'),
    h('h3', { text: 'Son' }),
    range('Volume général', 'master', 0, 1, 0.05), range('Musique', 'music', 0, 1, 0.05), range('Effets sonores', 'sfx', 0, 1, 0.05),
    check('Muet', 'muted'),
    h('h3', { text: 'Affichage' }),
    choice('Qualité', 'quality', [['auto', 'Automatique'], ['high', 'Haute'], ['eco', 'Économie']]),
    h('p', { class: 'note-muted', text: 'Automatique : la résolution baisse d’elle-même si le jeu n’est pas fluide. Économie : résolution réduite dès le départ (batterie).' }),
    check('Réduire les secousses de l’écran', 'reduceShake'),
    h('h3', { text: 'Aides' }),
    check('Afficher les aides d’objectif', 'showHints'),
    h('div', { class: 'actions' }, h('button', { class: 'btn', text: 'Réafficher les aides déjà vues', onclick: () => { host.resetTips(); host.game.toast('Les aides réapparaîtront au bon moment.', 'info'); } })),
    h('details', { class: 'advanced' }, h('summary', { text: 'Avancé' }),
      check('Mode debug (FPS, temps de calcul, collisions)', 'debug'),
      h('p', { class: 'note-muted', text: `Version : ${host.version}` })),
    h('p', { class: 'note-muted', text: 'Le plein écran et le verrouillage de l’orientation dépendent de votre navigateur ; le jeu fonctionne sans.' }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', text: 'Plein écran', onclick: () => { const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void }; (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())?.catch?.(() => {}); } }),
      h('button', { class: 'btn', text: 'Retour', onclick: () => host.openPanel(host.game ? 'pause' : 'none') })),
  );
  return panel('Options', host, body, { narrow: true });
}

export function helpPanel(host: PanelHost): HTMLElement {
  const body = h('div', { class: 'credits' });
  body.innerHTML = `
  <h3>But du jeu</h3>
  <p>Survivez dans les Bois de Cendre, retrouvez les trois fragments du sceau dans les lieux maudits (hameau à l’est, cimetière à l’ouest, pierres noires au nord), restaurez le sanctuaire du Loup tout au nord et repoussez l’assaut final.</p>
  <h3>Téléphone</h3>
  <ul><li>Joystick : glissez dans la zone du pouce (à gauche, ou à droite en disposition gaucher). Poussé à fond : course.</li>
  <li>Attaque : frappe l’ennemi le plus proche devant vous (visée assistée). Sans ennemi, elle récolte aussi.</li>
  <li>Action : un verbe court indique l’action (Couper, Miner, Cueillir, Fouiller, Lire, Réparer…) ; le nom de la cible s’affiche près d’elle. Maintenez pour répéter. Touchez un objet proche pour le choisir comme cible.</li>
  <li>Esquive : courte roulade invulnérable (endurance).</li>
  <li>Raccourcis (5 cases) : ils désignent un type d’objet et ne déplacent rien dans le sac. Configurez-les depuis le sac.</li>
  <li>Sac, et Menu : fabrication, construction, carte, objectif, pause.</li></ul>
  <h3>Clavier</h3>
  <ul><li>Déplacement : ZQSD / WASD / flèches · Course : Maj</li>
  <li>Attaque : Espace ou J · Action : E, F ou Entrée · Esquive : K ou X</li>
  <li>Raccourcis : 1 à 5 · Sac : I ou Tab · Fabrication : C · Construction : B · Carte : M · Pause : Échap</li></ul>
  <h3>Survie</h3>
  <ul><li>Trois jauges : santé, faim, endurance. La faim baisse lentement ; à zéro, vous perdez des PV. La fiche d’un aliment indique le gain réel selon votre faim.</li>
  <li>La santé remonte lentement si vous êtes nourri et hors combat, plus vite près d’un feu (encore plus près d’un feu amélioré).</li>
  <li>Les zombies entendent la récolte et les combats. Un grognement proche est signalé par un repère discret au bord de l’écran. Chaque attaque est annoncée (« ! » et clignotement) : esquivez ou reculez.</li>
  <li>La nuit, une horde attaque : arme, nourriture, feu, puis palissades, portes et pieux.</li>
  <li>La paillasse définit votre point de réapparition. En cas de mort, la moitié de votre sac tombe dans un sac récupérable, indiqué sur la carte.</li></ul>`;
  return panel('Commandes et règles', host, body);
}

export function creditsPanel(host: PanelHost): HTMLElement {
  const body = h('div', { class: 'credits' });
  body.append(h('p', { text: 'Tous les graphismes et sons proviennent de ressources gratuites sous licences libres, téléchargées puis découpées, assemblées ou converties sans être redessinées. Détail complet : ASSET_CREDITS.md et assets/manifest.json.' }));
  for (const c of CREDITS) {
    body.append(h('h3', { text: c.pack }));
    body.append(h('p', {}, `Auteurs : ${c.authors}`, h('br'), `Licence : ${c.license}`, h('br'), 'Source : ', h('a', { href: c.url, target: '_blank', rel: 'noopener', text: c.url }), c.via ? h('span', { text: ` (copie utilisée : ${c.via})` }) : null));
    if (c.note) body.append(h('p', { class: 'note-muted', text: c.note }));
  }
  body.append(h('h3', { text: 'Jeu' }), h('p', { text: `Code : Phaser 3 (licence MIT), TypeScript, Vite. Conception et programmation : projet « Les Bois de Cendre ». Version ${host.version}.` }));
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

