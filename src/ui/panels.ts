// Panneaux modaux (le jeu est en pause tant qu'un panneau est ouvert).
// La gestion (sac, armes, fabrication, construction, carte, journal) est regroupée dans un
// panneau à onglets ; les options et la sauvegarde restent dans une partie distincte (Pause).
import { BUILDINGS, BUILDING_BY_ID, buildingStats, type BuildingDef } from '../data/buildings';
import { DESTINATIONS, DUNGEONS, MAX_TIER, type Destination } from '../data/destinations';
import { ENCHANTS, ENCHANT_BY_ID } from '../data/enchants';
import { item, TIER_LABEL, type EquipSlot, type Station } from '../data/items';
import { NOTE_BY_ID } from '../data/notes';
import { STATION_NAMES, producingEntry, type Recipe } from '../data/recipes';
import { FAMILIES, FAMILY, MASTERY_MAX, MASTERY_XP, ULTS, familySkills, type Family, type SkillId } from '../data/weapons';
import {
  available, canCraft, canEnchant, canUpgrade, chooseStarter, containerName, containerSlots, craft, demolish, demolishRefund, depositAll,
  dropSlot, enchantable, enchantItem, equipSlot, foodGain, moveSlot, putInContainer, recipeQty, rest, STARTER_WEAPONS, takeAll,
  takeFromContainer, unequip, upgradeBuilding, useGain, useSlot,
} from '../sim/actions';
import {
  benefits, compareWithEquipped, enchantText, entryByKey, listEntries, quantityOptions, requirementText, stationText, weaponSkillsText, type CraftFilter,
} from '../sim/crafting';
import type { Game } from '../sim/game';
import { assignHotbar, hotbarQty, isHotbarAssignable, swapHotbar, HOTBAR_SIZE } from '../sim/hotbar';
import { currentObjective, inIntro, OBJECTIVES } from '../sim/objectives';
import { currentFamily, globalLevel, loadout, mastery, ownedWeapons, setLoadout, skillUnlocked, ultUnlocked } from '../sim/profile';
import { checkpointName, destStatus, dungeonWait, isUnlocked, returnToCamp, startExpedition } from '../sim/travel';
import type { Settings } from '../settings';
import { h } from './dom';
import { hotbarSlotEl, placeName, slotEl } from './hud';
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
  startMove(buildingId: number): void;
  startManage(): void;
  saveNow(reason: string): Promise<void>;
  exportSave(): void;
  exportLegacy(): void;
  hasLegacy: boolean;
  importSave(): void;
  applySettings(): void;
  quitToTitle(): void;
  confirm(text: string, ok: string, onOk: () => void): void;
  resetTips(): void;
  skipIntro(): void;
  inGame: boolean;
}

// état d'interface conservé pendant la session (onglet, filtre, sélection…)
export const ui = {
  tab: 'inventory' as ManageTab,
  inv: { sel: null as number | EquipSlot | null, moving: null as number | null, hbSel: null as number | null, pickFor: null as number | null, hbMove: null as number | null },
  craft: { filter: 'all' as CraftFilter, only: false, sheet: null as string | null },
  arms: { family: null as Family | null },
  ench: { sel: null as number | EquipSlot | null },
  travel: { tier: {} as Record<string, number> },
  map: newMapState(),
};

export type ManageTab = 'inventory' | 'arms' | 'craft' | 'build' | 'map' | 'journal';

function panel(title: string, host: PanelHost, body: HTMLElement, opts: { narrow?: boolean; tabs?: HTMLElement; wide?: boolean; headTabs?: boolean } = {}): HTMLElement {
  const p = h('div', { class: 'panel' + (opts.narrow ? ' narrow' : '') + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-label': title },
    h('div', { class: 'phead' }, h('h2', { text: title }), opts.headTabs ? opts.tabs ?? null : null, h('button', { class: 'close', text: 'Fermer', onclick: () => host.closePanel() })),
    opts.headTabs ? null : opts.tabs ?? null,
    body,
  );
  body.classList.add('pbody');
  return p;
}

/** Ingrédients : possédés (sac, plus coffres du camp quand on y est) / requis. */
function costLine(g: Game, cost: Record<string, number>, times = 1): HTMLElement {
  const box = h('div', { class: 'ings' });
  for (const [id, n] of Object.entries(cost)) {
    const have = available(g, id);
    box.append(h('span', { class: 'ing ' + (have >= n * times ? 'have' : 'miss') }, icon(item(id).icon, 18), `${item(id).name} ${have}/${n * times}`));
  }
  return box;
}

const campRule = (g: Game) => (g.atCamp ? h('p', { class: 'note-muted', text: 'Au camp, les ingrédients sont pris dans le sac puis dans les coffres du camp (jamais en double).' }) : null);

// ------------------------------------------------------------ panneau de gestion à onglets
export function managePanelTabs(host: PanelHost, tab: ManageTab): HTMLElement {
  const g = host.game;
  if (tab === 'build' && !g.atCamp) tab = 'inventory';
  ui.tab = tab;
  const tabs = h('div', { class: 'tabs main-tabs', role: 'tablist' });
  const TABS: [ManageTab, string, string][] = [['inventory', 'Sac', 'Tab'], ['arms', 'Armes', 'G'], ['craft', 'Fabriquer', 'C'], ['map', 'Carte', 'M'], ['journal', 'Journal', 'N']];
  if (g.atCamp) TABS.splice(3, 0, ['build', 'Camp', 'B']);
  for (const [k, lbl, key] of TABS)
    tabs.append(h('button', { class: 'tab' + (k === tab ? ' on' : ''), role: 'tab', 'aria-selected': k === tab ? 'true' : 'false', onclick: () => host.openPanel(k) }, lbl, h('kbd', { text: key })));
  let body: HTMLElement;
  let title = 'Sac';
  switch (tab) {
    case 'inventory':
      body = inventoryBody(host);
      break;
    case 'arms':
      body = armsBody(host);
      title = 'Armes et maîtrises';
      break;
    case 'craft':
      body = craftBody(host);
      title = 'Fabrication';
      break;
    case 'build':
      body = buildBody(host);
      title = 'Aménager le camp';
      break;
    case 'journal':
      body = journalBody(host);
      title = 'Journal';
      break;
    default:
      body = mapView({ game: g, rerender: () => host.openPanel('map') }, ui.map);
      title = `Carte — ${placeName(g)}`;
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
      } else if (typeof st.sel === 'number' && p.inv[st.sel] && isHotbarAssignable(p.inv[st.sel]!.id) && st.pickFor === null) {
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
  for (const [slot, label] of [['weapon', 'Arme'], ['armor', 'Protection'], ['accessory', 'Accessoire']] as const) {
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
        } else if (stack) g.toast('Seuls les aliments, soins, bombes et équipements vont en raccourci.', 'info');
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
    det.append(h('p', { class: 'mode-banner', text: `Raccourci ${st.pickFor + 1} : touchez un objet du sac (aliment, soin, bombe ou équipement).` }), h('div', { class: 'actions' }, h('button', { class: 'btn', text: 'Annuler', onclick: () => { st.pickFor = null; rerender(); } })));
  } else if (st.hbMove !== null) {
    det.append(h('p', { class: 'mode-banner', text: `Réorganisation : touchez le raccourci où placer « ${item(g.hotbar[st.hbMove]!.id).name} ».` }), h('div', { class: 'actions' }, h('button', { class: 'btn', text: 'Annuler', onclick: () => { st.hbMove = null; rerender(); } })));
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
    if (!stack) det.append(h('p', { class: 'note-muted', text: 'Touchez un objet pour voir ses caractéristiques et ses actions. Touchez une case « Raccourcis » pour la configurer.' }));
    else det.append(...itemSheet(host, stack, sel!, rerender));
  }
  body.append(h('div', { class: 'inv-layout' }, h('div', {}, equipRow, grid), det));
  const free = p.inv.filter((s) => !s).length;
  body.append(h('p', { class: 'note-muted', text: `${p.inv.length - free}/${p.inv.length} emplacements utilisés. Les outils (hache, masse) servent depuis le sac.` }));
  return body;
}

/** Fiche d'un objet : caractéristiques chiffrées, gain réel, prérequis, compétences, actions. */
function itemSheet(host: PanelHost, stack: { id: string; qty: number; ench?: string }, sel: number | EquipSlot, rerender: () => void): HTMLElement[] {
  const g = host.game;
  const st = ui.inv;
  const d = item(stack.id);
  const out: HTMLElement[] = [];
  out.push(h('h3', {}, icon(d.icon, 28), d.name + (d.tier ? ` (rang ${TIER_LABEL[d.tier]})` : '') + (stack.qty > 1 ? ` × ${stack.qty}` : '')));
  out.push(h('p', { text: d.desc }));
  const lines: HTMLElement[] = [];
  const fg = foodGain(g, stack.id);
  const ug = useGain(g, stack.id);
  if (fg) {
    lines.push(h('div', { text: `Apport : +${fg.nominal} faim${d.food!.health ? ` · +${d.food!.health} PV` : ''}${d.food!.regen ? ' · récupération accrue 60 s' : ''}` }));
    lines.push(h('div', { class: fg.surplus > 0 ? 'warnline' : 'okline', text: `Gain actuel : +${fg.effective} faim${fg.surplus > 0 ? ` ; surplus perdu : ${fg.surplus}` : ''}${fg.heal ? ` · +${fg.heal} PV` : ''}` }));
    if (!fg.useful) lines.push(h('div', { class: 'reason', text: 'Ni faim ni blessure : manger maintenant ne servirait à rien.' }));
  } else for (const b of benefits(stack.id)) lines.push(h('div', { text: b }));
  if (ug) {
    lines.push(h('div', { class: ug.useful ? 'okline' : 'reason', text: `Effet maintenant : ${ug.text}${ug.useful ? '' : ' (inutile pour l’instant)'}` }));
  }
  const req = requirementText(g, stack.id);
  if (req) lines.push(h('div', { class: req.ok ? 'okline' : 'reason', text: req.text }));
  const et = enchantText(stack.ench);
  if (et) lines.push(h('div', { class: 'ench-line', text: `Enchantement — ${et}` }));
  const cmp = compareWithEquipped(g, stack.id);
  if (cmp && typeof sel === 'number') lines.push(h('div', { class: 'note-muted', text: cmp }));
  out.push(h('div', { class: 'stats' }, ...lines));
  const sk = weaponSkillsText(stack.id);
  if (sk.length) out.push(h('details', { class: 'skills-info' }, h('summary', { text: 'Compétences de cette famille' }), ...sk.map((x) => h('div', { class: 'note-muted', text: x }))));
  const acts = h('div', { class: 'actions' });
  if (typeof sel === 'number') {
    if (d.food) acts.append(h('button', { class: 'btn primary', text: 'Manger', disabled: !fg!.useful, onclick: () => { useSlot(g, sel); rerender(); } }));
    if (d.use) acts.append(h('button', { class: 'btn primary', text: d.use.bomb ? 'Lancer' : 'Utiliser', disabled: !ug?.useful, onclick: () => { const r = useSlot(g, sel); if (r.ok && d.use?.bomb) host.closePanel(); else rerender(); } }));
    if (d.slot) {
      const ok = !req || req.ok;
      acts.append(h('button', { class: 'btn primary', text: d.slot === 'weapon' ? 'Prendre en main' : 'Équiper', disabled: !ok, onclick: () => { const r = equipSlot(g, sel); if (r.ok) st.sel = d.slot!; rerender(); } }));
    }
    acts.append(h('button', { class: 'btn', text: 'Ranger ailleurs', onclick: () => { st.moving = sel; rerender(); } }));
    if (!d.unique && d.kind !== 'component')
      acts.append(h('button', { class: 'btn danger', text: 'Jeter', onclick: () => host.confirm(`Jeter ${stack.qty} × ${d.name} ? L’objet restera au sol dans un sac.`, 'Jeter', () => { dropSlot(g, sel); st.sel = null; host.openPanel('inventory'); }) }));
  } else acts.append(h('button', { class: 'btn', text: 'Retirer', onclick: () => { unequip(g, sel); st.sel = null; rerender(); } }));
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

// ------------------------------------------------------------ armes, maîtrises, compétences
function armsBody(host: PanelHost): HTMLElement {
  const g = host.game;
  const cur = currentFamily(g);
  const fam: Family = ui.arms.family ?? cur ?? 'sword';
  const body = h('div', {});
  const re = () => host.openPanel('arms');

  // armes possédées : changement immédiat (autorisé partout, même en combat)
  const owned = ownedWeapons(g);
  const wrow = h('div', { class: 'weapon-strip' });
  for (const w of owned) {
    const d = item(w.id);
    const b = h('button', { class: 'wpick' + (w.where === 'equip' ? ' on' : ''), 'aria-label': `${d.name}${w.where === 'equip' ? ' (en main)' : ''}` },
      icon(d.icon, 30), h('span', { text: `${FAMILY[d.weapon!.family].short} ${TIER_LABEL[d.tier ?? 1]}` }));
    b.addEventListener('click', () => {
      if (w.where !== 'equip') equipSlot(g, w.where);
      ui.arms.family = d.weapon!.family;
      re();
    });
    wrow.append(b);
  }
  body.append(h('div', { class: 'sect' }, h('h3', { text: 'Vos armes (toucher pour prendre en main)' }), owned.length ? wrow : h('p', { class: 'note-muted', text: 'Aucune arme : choisissez-en une au râtelier du camp.' })));

  // maîtrises
  const mrow = h('div', { class: 'mastery-grid' });
  for (const f of FAMILIES) {
    const lvl = mastery(g, f);
    const xp = g.mastery[f] ?? 0;
    const next = lvl >= MASTERY_MAX ? null : MASTERY_XP[lvl + 1];
    const prev = MASTERY_XP[lvl];
    const pct = next === null ? 100 : Math.round(((xp - prev) / (next - prev)) * 100);
    const b = h('button', { class: 'mrow-btn' + (f === fam ? ' on' : '') + (f === cur ? ' cur' : ''), onclick: () => { ui.arms.family = f; re(); } },
      h('b', { text: FAMILY[f].short }), h('span', { class: 'mlvl', text: `Maîtrise ${lvl}` }),
      h('span', { class: 'mbar' }, h('i', { style: { width: `${pct}%` } })));
    mrow.append(b);
  }
  body.append(h('div', { class: 'sect' }, h('h3', { text: `Maîtrises — niveau global ${globalLevel(g)}` }), mrow,
    h('p', { class: 'note-muted', text: 'La maîtrise d’une famille ne progresse qu’avec les dégâts réellement infligés à de vrais ennemis avec cette famille (pas le mannequin). Chaque niveau : +2,5 % de dégâts pour la famille ; le niveau global ajoute des PV.' })));

  // compétences de la famille choisie
  const lo = loadout(g, fam);
  const sect = h('div', { class: 'sect' }, h('h3', { text: `${FAMILY[fam].name} — compétences` }), h('p', { class: 'note-muted', text: FAMILY[fam].desc }));
  for (const s of familySkills(fam)) {
    const un = skillUnlocked(g, s.id);
    const slot = lo.indexOf(s.id);
    const cd = g.cooldowns[s.id] ?? 0;
    const row = h('div', { class: 'recipe' + (un ? '' : ' disabled') },
      h('div', { class: 'rico' }, icon(s.icon, 34)),
      h('div', { class: 'rmain' },
        h('div', { class: 'rname' }, s.name, h('small', { text: ` · ${s.cost} ${FAMILY[fam].resource === 'mana' ? 'mana' : 'endurance'} · recharge ${s.cooldown} s${cd > 0 ? ` (encore ${Math.ceil(cd)} s)` : ''}` })),
        h('div', { class: 'rben', text: s.desc }),
        un ? null : h('div', { class: 'reason', text: `Se débloque à la maîtrise ${s.unlock}.` })),
    );
    if (un) {
      const btns = h('div', { class: 'slot-pick' });
      for (const i of [0, 1] as const)
        btns.append(h('button', { class: 'btn small' + (slot === i ? ' on' : ''), text: `Bouton ${i + 1}`, 'aria-pressed': slot === i ? 'true' : 'false', onclick: () => { setLoadout(g, fam, i, s.id as SkillId); host.sfx('click'); re(); } }));
      row.append(btns);
    }
    sect.append(row);
  }
  const u = ULTS[fam];
  sect.append(h('div', { class: 'recipe' + (ultUnlocked(g, fam) ? '' : ' disabled') },
    h('div', { class: 'rico' }, icon(u.icon, 34)),
    h('div', { class: 'rmain' },
      h('div', { class: 'rname' }, `Ultime — ${u.name}`, h('small', { text: ` · jauge ${Math.floor(g.ult)} %` })),
      h('div', { class: 'rben', text: u.desc }),
      h('div', { class: 'note-muted', text: 'Jauge partagée par toutes les armes : elle se remplit en infligeant et en subissant des dégâts réels. Maintenez le bouton, glissez pour viser, relâchez pour lancer (relâcher sur « annuler » l’annule).' }),
      ultUnlocked(g, fam) ? null : h('div', { class: 'reason', text: `Se débloque à la maîtrise ${u.unlock}.` }))));
  sect.append(h('p', { class: 'note-muted', text: 'Le choix des deux compétences est mémorisé pour chaque famille. Les recharges continuent même si l’arme n’est pas en main.' }));
  body.append(sect);
  return body;
}

/** Sélecteur rapide d'arme (appui long sur le bouton d'arme, touche G). */
export function weaponPickPanel(host: PanelHost): HTMLElement {
  const g = host.game;
  const owned = ownedWeapons(g);
  const body = h('div', { class: 'weapon-strip big' });
  if (!owned.length) body.append(h('p', { class: 'note-muted', text: 'Aucune arme : choisissez-en une au râtelier du camp.' }));
  for (const w of owned) {
    const d = item(w.id);
    body.append(h('button', { class: 'wpick' + (w.where === 'equip' ? ' on' : ''), onclick: () => { if (w.where !== 'equip') equipSlot(g, w.where); host.closePanel(); } },
      icon(d.icon, 36), h('span', { text: d.name }), h('small', { text: `Maîtrise ${mastery(g, d.weapon!.family)}` })));
  }
  return panel('Changer d’arme', host, body, { narrow: true });
}

// ------------------------------------------------------------ fabrication
function craftBody(host: PanelHost): HTMLElement {
  const g = host.game;
  const cs = ui.craft;
  if (cs.sheet) {
    if (entryByKey(cs.sheet)) return recipeSheet(host, cs.sheet);
    cs.sheet = null;
  }
  const body = h('div', {});
  const filters = h('div', { class: 'chips' });
  const opts: [CraftFilter, string][] = [['all', 'Tout'], ['hand', 'À la main'], ['workbench', 'Établi'], ['campfire', 'Feu'], ['forge', 'Forge']];
  for (const [k, lbl] of opts) {
    const near = k !== 'all' && k !== 'hand' && g.nearStation(k as Station);
    filters.append(h('button', { class: 'chip' + (k === cs.filter ? ' on' : ''), onclick: () => { cs.filter = k; host.openPanel('craft'); } }, lbl + (near ? ' ✓' : '')));
  }
  filters.append(h('button', { class: 'chip toggle' + (cs.only ? ' on' : ''), 'aria-pressed': cs.only ? 'true' : 'false', onclick: () => { cs.only = !cs.only; host.openPanel('craft'); } }, cs.only ? 'Fabricables seulement ✓' : 'Fabricables seulement'));
  body.append(filters);
  const rule = campRule(g);
  if (rule) body.append(rule);
  const list = listEntries(g, cs.filter, cs.only);
  if (!list.length) body.append(h('p', { class: 'note-muted', text: cs.only ? 'Rien n’est fabricable ici pour le moment. Retirez le filtre pour voir ce qu’il manque.' : 'Aucune recette.' }));
  for (const e of list) {
    const d = item(e.output);
    const r0 = e.recipes[0];
    const multi = e.recipes.length > 1;
    const okAny = e.recipes.some((r) => canCraft(g, r).ok);
    const c = canCraft(g, r0);
    const req = requirementText(g, e.output);
    const row = h('div', { class: 'recipe' + (okAny ? '' : ' disabled') + (g.pinned === e.key ? ' pinned' : ''), role: 'button', tabindex: '0', 'aria-label': `${d.name} : ouvrir la fiche` });
    row.append(
      h('div', { class: 'rico' }, icon(d.icon, 40)),
      h('div', { class: 'rmain' },
        h('div', { class: 'rname' }, `${d.name}${recipeQty(g, r0) > 1 ? ` ×${recipeQty(g, r0)}` : ''} `, h('small', { text: `· ${STATION_NAMES[e.station]}` }), g.pinned === e.key ? h('span', { class: 'tag', text: 'Suivie' }) : null),
        h('div', { class: 'rben', text: multi ? `${e.recipes.length} méthodes : ${e.recipes.map((r) => r.method).join(' ou ')}` : benefits(e.output).slice(0, 3).join(' · ') }),
        req && req.text.includes('requise') ? h('div', { class: req.ok ? 'okline' : 'warnline', text: req.text }) : null,
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
  host.openPanel('craft', 'keep');
  const nb = document.querySelector('#panel-layer .pbody') as HTMLElement | null;
  if (nb) nb.scrollTop = scroll;
}

function recipeSheet(host: PanelHost, key: string): HTMLElement {
  const g = host.game;
  const e = entryByKey(key)!;
  const d = item(e.output);
  const body = h('div', { class: 'sheet' });
  body.append(h('button', { class: 'btn back', text: '← Toutes les recettes', onclick: () => { ui.craft.sheet = null; host.openPanel('craft'); } }));
  body.append(h('h3', { class: 'sheet-h' }, icon(d.icon, 36), d.name + (d.tier ? ` (rang ${TIER_LABEL[d.tier]})` : '')));
  body.append(h('p', { text: d.desc }));
  const ben = benefits(e.output);
  if (ben.length) body.append(h('div', { class: 'stats' }, h('div', { class: 'note-muted', text: 'Caractéristiques :' }), ...ben.map((b) => h('div', { text: b }))));
  const req = requirementText(g, e.output);
  if (req) body.append(h('p', { class: req.ok ? 'okline' : 'reason', text: req.text }));
  const sk = weaponSkillsText(e.output);
  if (sk.length) body.append(h('div', { class: 'stats' }, h('div', { class: 'note-muted', text: 'Compétences associées :' }), ...sk.map((x) => h('div', { text: x }))));
  const cmp = compareWithEquipped(g, e.output);
  if (cmp) body.append(h('p', { class: 'compare', text: cmp }));
  const rule = campRule(g);
  if (rule) body.append(rule);
  for (const r of e.recipes) body.append(methodBlock(host, r, e.recipes.length > 1));
  const pinned = g.pinned === key;
  body.append(h('div', { class: 'actions' },
    h('button', { class: 'btn' + (pinned ? ' on' : ''), text: pinned ? 'Ne plus suivre' : 'Épingler cette recette', onclick: () => { g.pinned = pinned ? null : key; host.openPanel('craft', 'keep'); } }),
    pinned ? h('span', { class: 'note-muted', text: 'Les ressources manquantes s’affichent en haut de l’écran.' }) : null));
  return body;
}

function methodBlock(host: PanelHost, r: Recipe, showMethod: boolean): HTMLElement {
  const g = host.game;
  const box = h('div', { class: 'method' });
  if (showMethod) box.append(h('h4', { text: r.method ?? '' }));
  const ings = h('div', { class: 'ings big' });
  for (const [id, n] of Object.entries(r.inputs)) {
    const have = available(g, id);
    const pe = producingEntry(id);
    const chip = h('span', { class: 'ing ' + (have >= n ? 'have' : 'miss') }, icon(item(id).icon, 20), `${item(id).name} ${have}/${n}`);
    if (pe && have < n) chip.append(h('button', { class: 'linkish', text: '(à fabriquer)', onclick: () => { ui.craft.sheet = pe.key; host.openPanel('craft', 'keep'); } }));
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

// ------------------------------------------------------------ camp : construction
const CAT_NAMES: Record<BuildingDef['category'], string> = { station: 'Installations', storage: 'Rangement', furniture: 'Mobilier', decor: 'Décors' };

function buildBody(host: PanelHost): HTMLElement {
  const g = host.game;
  const body = h('div', {});
  const inHouse = g.mapId === 'house';
  body.append(h('p', { class: 'note-muted', text: inHouse ? 'Dans la maison : mobilier, coffres, lit. Le camp est sûr : rien n’y est jamais attaqué.' : 'Au camp : installations, coffres, décors. L’emplacement de la maison, les chemins et les emplacements réservés aux compagnons sont protégés.' }));
  body.append(h('div', { class: 'actions', style: { marginTop: '0', marginBottom: '10px' } },
    h('button', { class: 'btn', text: 'Déplacer, améliorer ou démonter', onclick: () => host.startManage() })));
  const list = BUILDINGS.filter((b) => !b.hidden && (b.where === 'both' || b.where === (inHouse ? 'house' : 'camp')));
  for (const cat of ['station', 'storage', 'furniture', 'decor'] as const) {
    const items = list.filter((b) => b.category === cat);
    if (!items.length) continue;
    body.append(h('h3', { text: CAT_NAMES[cat] }));
    for (const b of items) {
      const ok = Object.entries(b.cost).every(([id, n]) => available(g, id) >= n);
      const count = [...g.world.buildings.values()].filter((x) => x.type === b.id).length;
      body.append(h('div', { class: 'recipe' + (ok ? '' : ' disabled') },
        h('div', { class: 'rico' }, icon(b.icon, 44)),
        h('div', { class: 'rmain' },
          h('div', { class: 'rname' }, b.name, h('small', { text: ` · ${b.w}×${b.h}${count ? ` · déjà ${count}` : ''}` })),
          h('div', { class: 'note-muted', text: b.desc }),
          b.upgrade ? h('div', { class: 'rben', text: `Amélioration : ${b.upgrade.name} — ${b.upgrade.benefits.join(' ; ')}` }) : null,
          costLine(g, b.cost),
        ),
        h('button', { class: 'btn primary', text: 'Placer', disabled: !ok, onclick: () => host.startPlacement(b.id) }),
      ));
    }
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
  body.append(h('p', { class: 'note-muted', text: d.desc }));
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
  const full = !!b.items && b.items.some((s) => s);
  body.append(h('p', { class: 'note-muted', text: `Démonter rembourse : ${rtxt}.` }));
  if (full) body.append(h('p', { class: 'reason', text: 'Ce coffre contient des objets : videz-le avant de le démonter (le déplacer reste possible, contenu compris).' }));
  const acts = h('div', { class: 'actions' });
  acts.append(h('button', { class: 'btn primary', text: 'Déplacer (gratuit)', onclick: () => host.startMove(b.id) }));
  acts.append(h('button', { class: 'btn danger', text: 'Démonter', disabled: full, onclick: () => host.confirm(`Démonter ${bs.name} ? Remboursement : ${rtxt}.`, 'Démonter', () => { const r = demolish(g, b.id); if (!r.ok && r.reason) g.toast(r.reason, 'warn'); host.closePanel(); host.startManage(); }) }));
  acts.append(h('button', { class: 'btn', text: 'Autre élément', onclick: () => { host.closePanel(); host.startManage(); } }));
  body.append(acts);
  return panel('Gérer', host, body, { narrow: true });
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
  const isStore = g.openContainer?.kind === 'building';
  const hasRes = g.player.inv.some((s) => s && ['resource', 'rare', 'component'].includes(item(s.id).kind));
  body.append(h('div', { class: 'cont-layout' },
    h('div', {}, h('h3', { text: `${containerName(g)} — toucher pour prendre` }), cgrid,
      empty ? h('p', { class: 'note-muted', text: 'Vide.' }) : null,
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', text: 'Tout prendre', disabled: empty, onclick: () => { takeAll(g); re(); } }))),
    h('div', {}, h('h3', { text: 'Votre sac — toucher pour déposer' }), igrid,
      isStore ? h('div', { class: 'actions' }, h('button', { class: 'btn', text: 'Ranger toutes les ressources', disabled: !hasRes, onclick: () => { depositAll(g); re(); } })) : null),
  ));
  return panel(containerName(g), host, body);
}

// ------------------------------------------------------------ départs (carrefour des expéditions)
const KIND_NAMES: Record<Destination['kind'], string> = { farm: 'Région de ressources', main: 'Expédition principale', dungeon: 'Donjon à paliers' };
const STATUS_NAMES = { locked: 'Verrouillée', available: 'Disponible', progress: 'En cours', done: 'Terminée' };

export function travelPanel(host: PanelHost): HTMLElement {
  const g = host.game;
  const body = h('div', { class: 'dest-list' });
  body.append(h('p', { class: 'note-muted', text: 'Régions de ressources : chaque sortie est une nouvelle instance (ressources renouvelées) ; une chute y coûte 20 % de la récolte de la sortie. Expéditions principales : la progression (points de halte, portes, coffres) est conservée entre les départs. Donjons : paliers 1 à 5, une défaite ne change jamais le palier.' }));
  for (const d of DESTINATIONS) {
    const stt = destStatus(g, d.id);
    const unlocked = isUnlocked(g, d);
    const card = h('div', { class: `dest ${stt}` });
    const info = h('div', { class: 'dmain' },
      h('div', { class: 'dname' }, h('b', { text: d.name }), h('span', { class: `dstat ${stt}`, text: STATUS_NAMES[stt] })),
      h('div', { class: 'dkind', text: `${KIND_NAMES[d.kind]} · danger ${'●'.repeat(d.danger)}${'○'.repeat(5 - d.danger)}` }),
    );
    if (!unlocked) {
      info.append(h('div', { class: 'reason', text: d.lockedText }));
      card.append(h('div', { class: 'dimg locked' }, icon(d.image, 48)), info);
      body.append(card);
      continue;
    }
    info.append(h('div', { class: 'note-muted', text: d.desc }), h('div', { class: 'rben', text: `Récompenses : ${d.rewards}` }));
    const acts = h('div', { class: 'actions' });
    if (d.kind === 'main') {
      const cp = checkpointName(g, d.map);
      info.append(h('div', { class: 'okline', text: cp ? `Point de halte : ${cp} (vous y reprendrez)` : 'Départ : entrée de la région' }));
      if (d.bossName) info.append(h('div', { class: 'note-muted', text: `Boss : ${g.flags.has(d.bossFlag ?? '') ? `${d.bossName} (vaincu)` : '?'}` }));
      acts.append(h('button', { class: 'btn primary', text: stt === 'done' ? 'Revisiter' : stt === 'progress' ? 'Reprendre' : 'Partir', onclick: () => go(host, d.id, 1) }));
    } else if (d.kind === 'farm') {
      if (d.bossName) info.append(h('div', { class: 'note-muted', text: `Boss facultatif : ${g.flags.has(d.bossFlag ?? '') ? `${d.bossName} (vaincu)` : 'une tanière au fond de la région'}` }));
      acts.append(h('button', { class: 'btn primary', text: 'Partir (nouvelle sortie)', onclick: () => go(host, d.id, 1) }));
    } else {
      const s = g.dungeon(d.id);
      const dd = DUNGEONS[d.id];
      const sel = Math.min(s.unlocked, ui.travel.tier[d.id] ?? s.unlocked);
      const wait = dungeonWait(g, d.id);
      const tiers = h('div', { class: 'tiers' });
      for (let t = 1; t <= MAX_TIER; t++) {
        const open = t <= s.unlocked;
        tiers.append(h('button', { class: 'chip tier' + (t === sel ? ' on' : '') + (s.cleared.includes(t) ? ' cleared' : ''), disabled: !open, 'aria-label': `Palier ${t}${s.cleared.includes(t) ? ' (réussi)' : ''}${open ? '' : ' (verrouillé)'}`, onclick: () => { ui.travel.tier[d.id] = t; host.openPanel('travel'); } }, `${t}${s.cleared.includes(t) ? ' ✓' : ''}`));
      }
      const td = dd.tiers[sel - 1];
      info.append(h('div', { class: 'note-muted', text: `Palier ${sel} : ennemis PV ×${td.hpMul.toFixed(2).replace('.', ',')}, dégâts ×${td.dmgMul.toFixed(2).replace('.', ',')}${td.elite ? `, élites ${Math.round(td.elite * 100)} %` : ''}. Boss : ${dd.bossName}.` }), tiers);
      info.append(h('div', { class: 'note-muted', text: `Palier suivant : se débloque en réussissant le palier ${s.unlocked}${s.unlocked >= MAX_TIER ? ' (maximum atteint)' : ''}. Instances jouées : ${s.runs}.` }));
      if (wait > 0) info.append(h('div', { class: 'reason', text: `Les lieux se repeuplent : prochaine instance dans ${Math.ceil(wait)} s de jeu (le temps passe au camp).` }));
      acts.append(h('button', { class: 'btn primary', text: `Entrer — palier ${sel}`, disabled: wait > 0, onclick: () => go(host, d.id, sel) }));
    }
    info.append(acts);
    card.append(h('div', { class: 'dimg' }, icon(d.image, 48)), info);
    body.append(card);
  }
  return panel('Carrefour des expéditions', host, body);
}

function go(host: PanelHost, id: string, tier: number): void {
  const g = host.game;
  const r = startExpedition(g, id, tier);
  if (!r.ok) {
    g.toast(r.reason ?? 'Départ impossible', 'warn');
    host.openPanel('travel');
    return;
  }
  host.closePanel();
}

export function exitPanel(host: PanelHost): HTMLElement {
  const g = host.game;
  const run = g.run;
  const body = h('div', {});
  if (!run) {
    body.append(h('p', { text: 'Vous êtes au camp.' }));
    return panel('Retour', host, body, { narrow: true });
  }
  if (run.kind === 'farm') {
    const got = Object.entries(run.gains).map(([id, n]) => [id, Math.min(n, Math.max(0, available(g, id) - (run.pre[id] ?? 0)))] as const).filter(([, n]) => n > 0);
    body.append(h('p', { text: 'Rentrer met la récolte de cette sortie en sûreté. La prochaine sortie sera une nouvelle instance (ressources renouvelées).' }));
    body.append(h('p', { class: 'note-muted', text: got.length ? `Récolte : ${got.map(([id, n]) => `${n} ${item(id).name.toLowerCase()}`).join(', ')}.` : 'Rien récolté pour l’instant.' }));
  } else if (run.kind === 'main') {
    body.append(h('p', { text: 'Votre progression est conservée : points de halte, portes et raccourcis ouverts, coffres vidés, boss vaincus. Vous reprendrez au dernier point de halte.' }));
  } else {
    body.append(h('p', { text: run.bossDefeated ? `Palier ${run.tier} réussi : pensez au coffre de récompense avant de partir.` : `Quitter maintenant abandonne l’instance : le palier reste ${run.tier}, sans pénalité.` }));
  }
  body.append(h('div', { class: 'actions' },
    h('button', { class: 'btn primary', text: 'Rentrer au camp', onclick: () => { returnToCamp(g); host.closePanel(); } }),
    h('button', { class: 'btn', text: 'Rester', onclick: () => host.closePanel() })));
  return panel('Rentrer au camp ?', host, body, { narrow: true });
}

export function checkpointPanel(host: PanelHost): HTMLElement {
  const g = host.game;
  const run = g.run;
  const body = h('div', {});
  const name = run ? checkpointName(g, run.map) ?? 'Point de halte' : 'Point de halte';
  body.append(h('p', { text: `${name} : en cas de chute, vous reviendrez ici.` }));
  if (run?.kind === 'farm') body.append(h('p', { class: 'note-muted', text: 'Rentrer d’ici met la récolte de la sortie en sûreté.' }));
  else body.append(h('p', { class: 'note-muted', text: 'Rentrer d’ici conserve toute la progression de la région.' }));
  body.append(h('div', { class: 'actions' },
    h('button', { class: 'btn', text: 'Rentrer au camp', onclick: () => { returnToCamp(g); host.closePanel(); } }),
    h('button', { class: 'btn primary', text: 'Continuer', onclick: () => host.closePanel() })));
  return panel(name, host, body, { narrow: true });
}

// ------------------------------------------------------------ râtelier (arme de départ)
export function rackPanel(host: PanelHost): HTMLElement {
  const g = host.game;
  const body = h('div', {});
  if (!g.starter) {
    body.append(h('p', { text: 'Choisissez l’arme avec laquelle vous partirez. Vous pourrez fabriquer les autres familles plus tard et changer d’arme à tout moment, même en combat.' }));
    const grid = h('div', { class: 'starter-grid' });
    for (const id of STARTER_WEAPONS) {
      const d = item(id);
      const f = d.weapon!.family;
      const s1 = familySkills(f)[0];
      grid.append(h('div', { class: 'starter' },
        h('div', { class: 'sthead' }, icon(d.icon, 36), h('b', { text: FAMILY[f].name })),
        h('div', { class: 'note-muted', text: FAMILY[f].desc }),
        h('div', { class: 'rben', text: `${FAMILY[f].ranged ? 'À distance' : 'Au contact'} · ${FAMILY[f].resource === 'mana' ? 'mana' : 'endurance'} · compétence : ${s1.name}` }),
        h('button', { class: 'btn primary', text: `Prendre : ${d.name}`, onclick: () => { chooseStarter(g, id); host.closePanel(); } })));
    }
    body.append(grid);
    return panel('Râtelier : arme de départ', host, body);
  }
  body.append(h('p', { text: `Arme de départ : ${item(g.starter).name}. Les autres armes se fabriquent (établi, forge) ; changez d’arme avec le bouton d’arme (appui long : liste) ou l’onglet « Armes ».` }));
  body.append(h('div', { class: 'actions' },
    h('button', { class: 'btn primary', text: 'Armes et compétences', onclick: () => host.openPanel('arms') }),
    h('button', { class: 'btn', text: 'Fermer', onclick: () => host.closePanel() })));
  return panel('Râtelier', host, body, { narrow: true });
}

// ------------------------------------------------------------ lit, enchantement
export function bedPanel(host: PanelHost): HTMLElement {
  const g = host.game;
  const body = h('div', {},
    h('p', { text: 'Se reposer rend tous les PV, l’endurance et la mana. Au camp, la faim ne baisse pas et rien ne vous attaque.' }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary', text: 'Se reposer', onclick: () => { rest(g); host.closePanel(); void host.saveNow('rest'); } }),
      h('button', { class: 'btn', text: 'Fermer', onclick: () => host.closePanel() })),
  );
  return panel('Lit', host, body, { narrow: true });
}

export function enchantPanel(host: PanelHost): HTMLElement {
  const g = host.game;
  const body = h('div', {});
  const list = enchantable(g);
  const re = () => host.openPanel('enchant');
  body.append(h('p', { class: 'note-muted', text: 'Un seul enchantement par objet : en graver un autre remplace l’ancien (annoncé avant). L’enchantement reste sur l’objet (rangement, changement d’arme, chute).' }));
  if (!list.length) {
    body.append(h('p', { text: 'Aucun objet enchantable : armes, protections et accessoires (sac ou équipement).' }));
    return panel('Autel d’enchantement', host, body);
  }
  const sel = list.find((x) => x.where === ui.ench.sel) ?? list[0];
  ui.ench.sel = sel.where;
  const row = h('div', { class: 'weapon-strip' });
  for (const x of list) {
    const d = item(x.st.id);
    row.append(h('button', { class: 'wpick' + (x === sel ? ' on' : '') + (x.st.ench ? ' ench' : ''), onclick: () => { ui.ench.sel = x.where; re(); } },
      icon(d.icon, 30), h('span', { text: d.name }), h('small', { text: typeof x.where === 'number' ? 'sac' : 'équipé' })));
  }
  body.append(row);
  const d = item(sel.st.id);
  body.append(h('h3', {}, icon(d.icon, 28), d.name), h('p', { class: sel.st.ench ? 'ench-line' : 'note-muted', text: sel.st.ench ? `Actuel : ${enchantText(sel.st.ench)}` : 'Aucun enchantement.' }));
  for (const e of ENCHANTS) {
    if (!e.slots.includes(d.slot!)) continue;
    const c = canEnchant(g, sel.where, e.id);
    const cur = sel.st.ench === e.id;
    body.append(h('div', { class: 'recipe' + (c.ok ? '' : ' disabled') },
      h('div', { class: 'rmain' },
        h('div', { class: 'rname', text: e.name + (cur ? ' (actuel)' : '') }),
        h('div', { class: 'rben', text: e.desc }),
        costLine(g, e.cost),
        c.ok || cur ? null : h('div', { class: 'reason', text: c.reason ?? '' })),
      h('button', { class: 'btn primary', text: 'Graver', disabled: !c.ok, onclick: () => {
        const doIt = () => { enchantItem(g, sel.where, e.id); re(); };
        if (sel.st.ench) host.confirm(`Remplacer « ${ENCHANT_BY_ID[sel.st.ench].name} » par « ${e.name} » sur ${d.name} ? L’ancien enchantement sera perdu.`, 'Remplacer', doIt);
        else doIt();
      } })));
  }
  const rule = campRule(g);
  if (rule) body.append(rule);
  return panel('Autel d’enchantement', host, body);
}

// ------------------------------------------------------------ journal et objectifs
function journalBody(host: PanelHost): HTMLElement {
  const g = host.game;
  const body = h('div', {});
  const o = currentObjective(g);
  if (o) {
    body.append(h('h3', { class: 'obj-h', text: o.title }));
    const list = o.checklist?.(g);
    if (list) body.append(h('ul', { class: 'checklist' }, ...list.map((x) => h('li', { class: x.done ? 'done' : x.optional ? 'opt' : '' }, h('span', { class: 'box', text: x.done ? '✓' : '' }), x.label))));
    else {
      const prog = o.progress?.(g);
      if (prog) body.append(h('p', { class: 'obj-prog', text: prog }));
    }
    body.append(h('p', { text: o.hint }));
    if (inIntro(g)) body.append(h('div', { class: 'actions' }, h('button', { class: 'btn', text: 'Passer le guidage', onclick: () => host.confirm('Passer le guidage ? Les étapes restantes seront considérées comme faites (sans arme choisie, vous pourrez toujours en prendre une au râtelier).', 'Passer', () => { host.skipIntro(); host.closePanel(); }) })));
  } else body.append(h('h3', { class: 'obj-h', text: 'Ligne principale accomplie' }), h('p', { text: 'Montez les paliers des donjons, améliorez votre équipement et vos maîtrises.' }));
  const opt = OBJECTIVES.filter((x) => x.optional);
  body.append(h('h3', { text: 'Facultatif' }), h('ul', { class: 'checklist' }, ...opt.map((x) => h('li', { class: g.completed.has(x.id) ? 'done' : 'opt' }, h('span', { class: 'box', text: g.completed.has(x.id) ? '✓' : '' }), `${x.title} — `, h('small', { text: x.hint })))));
  const done = OBJECTIVES.filter((x) => !x.optional && g.completed.has(x.id));
  if (done.length) body.append(h('h3', { text: 'Accomplis' }), h('ul', { class: 'obj-done' }, ...done.map((x) => h('li', { text: x.title }))));
  if (g.journal.length) {
    body.append(h('h3', { text: 'Carnet de route' }));
    body.append(h('ul', { class: 'journal' }, ...g.journal.slice().reverse().slice(0, 40).map((e) => h('li', {}, h('small', { text: `${Math.floor(e.t / 60)} min · ` }), e.text))));
  }
  const notes = g.stats.notesRead.filter((id) => NOTE_BY_ID[id]);
  if (notes.length) body.append(h('h3', { text: 'Notes trouvées' }), h('div', { class: 'chips' }, ...notes.map((id) => h('button', { class: 'chip', text: NOTE_BY_ID[id].title, onclick: () => host.openPanel('note', id) }))));
  return body;
}

export function objectivePanel(host: PanelHost): HTMLElement {
  ui.tab = 'journal';
  return managePanelTabs(host, 'journal');
}

// ------------------------------------------------------------ menus
export function hubPanel(host: PanelHost): HTMLElement {
  const g = host.game;
  const entry = (key: string, label: string, sub: string, panelName: string) =>
    h('button', { class: 'hub-btn', onclick: () => host.openPanel(panelName) }, icon(key, 30), h('span', { class: 'hub-lbl' }, h('b', { text: label }), h('small', { text: sub })));
  const body = h('div', { class: 'hub-grid' },
    entry('items:i_longsword', 'Armes', 'Maîtrises, compétences', 'arms'),
    entry('world:i_hammer', 'Fabriquer', 'Armes, protections, repas', 'craft'),
    g.atCamp ? entry('world:i_planks', 'Aménager', 'Installations, mobilier', 'build') : null,
    entry('items:i_map', 'Carte', 'Lieux et marqueurs', 'map'),
    entry('items:i_scroll', 'Journal', 'Objectifs, carnet', 'journal'),
    entry('items:i_chest', 'Pause', 'Options, sauvegarde…', 'pause'),
  );
  const p = panel('Menu', host, body, { narrow: true });
  p.classList.add('hub');
  return p;
}

export function pausePanel(host: PanelHost): HTMLElement {
  const body = h('div', { class: 'menu-list' },
    h('button', { class: 'btn primary', text: 'Reprendre', onclick: () => host.closePanel() }),
    h('button', { class: 'btn', text: 'Sauvegarder maintenant', onclick: () => void host.saveNow('manual') }),
    h('button', { class: 'btn', text: 'Options', onclick: () => host.openPanel('options') }),
    h('button', { class: 'btn', text: 'Commandes et règles', onclick: () => host.openPanel('help') }),
    h('button', { class: 'btn', text: 'Crédits', onclick: () => host.openPanel('credits') }),
    h('button', { class: 'btn', text: 'Exporter la sauvegarde (JSON)', onclick: () => host.exportSave() }),
    host.hasLegacy ? h('button', { class: 'btn', text: 'Exporter l’ancienne sauvegarde (V1)', onclick: () => host.exportLegacy() }) : null,
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
  const check = (label: string, key: 'muted' | 'reduceShake' | 'reduceFlash' | 'debug' | 'showHints' | 'leftHanded') => {
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
    h('p', { class: 'note-muted', text: 'Automatique : les commandes tactiles s’affichent dès que vous touchez l’écran et se masquent quand vous jouez au clavier.' }),
    range('Taille du joystick', 'joySize', 0.8, 1.3, 0.05, pct),
    range('Opacité du joystick', 'joyOpacity', 0.35, 1, 0.05, pct),
    range('Taille des boutons', 'buttonSize', 0.9, 1.25, 0.05, pct),
    check('Disposition gaucher (joystick à droite, actions à gauche)', 'leftHanded'),
    h('h3', { text: 'Son' }),
    range('Volume général', 'master', 0, 1, 0.05), range('Musique', 'music', 0, 1, 0.05), range('Effets sonores', 'sfx', 0, 1, 0.05),
    check('Muet', 'muted'),
    h('h3', { text: 'Affichage et confort' }),
    choice('Qualité', 'quality', [['auto', 'Automatique'], ['high', 'Haute'], ['eco', 'Économie']]),
    h('p', { class: 'note-muted', text: 'Automatique : la résolution baisse d’elle-même si le jeu n’est pas fluide. Économie : résolution réduite dès le départ (batterie).' }),
    check('Réduire les secousses de l’écran', 'reduceShake'),
    check('Réduire les flashs et clignotements', 'reduceFlash'),
    h('h3', { text: 'Aides' }),
    check('Afficher les conseils', 'showHints'),
    h('div', { class: 'actions' }, h('button', { class: 'btn', text: 'Réafficher les conseils déjà vus', onclick: () => { host.resetTips(); if (host.inGame) host.game.toast('Les conseils réapparaîtront au bon moment.', 'info'); } })),
    h('details', { class: 'advanced' }, h('summary', { text: 'Avancé' }),
      check('Mode debug (FPS, temps de calcul)', 'debug'),
      h('p', { class: 'note-muted', text: `Version : ${host.version}` })),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', text: 'Plein écran', onclick: () => { const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void }; (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())?.catch?.(() => {}); } }),
      h('button', { class: 'btn', text: 'Retour', onclick: () => host.openPanel(host.inGame ? 'pause' : 'none') })),
  );
  return panel('Options', host, body, { narrow: true });
}

export function helpPanel(host: PanelHost): HTMLElement {
  const body = h('div', { class: 'credits' });
  body.innerHTML = `
  <h3>But du jeu</h3>
  <p>Depuis votre camp, partez en expédition : récoltez au Bois des chasseurs et au Marais corrompu, explorez le Bastion abandonné puis l’Ancienne carrière et vainquez leurs maîtres. Chaque victoire ouvre un donjon à cinq paliers. Fabriquez de meilleures armes, gravez des enchantements, montez vos maîtrises.</p>
  <h3>Téléphone</h3>
  <ul><li>Joystick : glissez dans la zone du pouce (à gauche, ou à droite en disposition gaucher). Poussé à fond : course.</li>
  <li>Attaque : visée légèrement assistée vers l’ennemi le plus proche devant vous. Sans ennemi, elle récolte.</li>
  <li>Deux boutons de compétence (chiffre : recharge ; petit nombre : coût). Ultime : maintenez, glissez pour viser, relâchez pour lancer ; relâchez sur « annuler » pour l’annuler.</li>
  <li>Bouton d’arme : appui = arme suivante ; appui long = liste. Changer d’arme est permis partout, même en combat.</li>
  <li>Action : verbe court (Couper, Fouiller, Allumer, Partir…). Esquive : roulade invulnérable (endurance).</li></ul>
  <h3>Clavier</h3>
  <ul><li>Déplacement : ZQSD / WASD / flèches · Course : Maj · Attaque : Espace ou J · Action : E ou F · Esquive : K</li>
  <li>Compétences : U et I · Ultime : maintenir L (visée à la souris), relâcher · Arme suivante : R · Liste des armes : G</li>
  <li>Raccourcis : 1 à 5 · Sac : Tab · Fabrication : C · Aménager : B · Carte : M · Journal : N · Pause : Échap</li></ul>
  <h3>Règles</h3>
  <ul><li>Le camp est sûr : ni attaque ni faim. La faim baisse seulement en expédition, avec des effets progressifs (récupération, puis endurance, puis PV).</li>
  <li>Attaques de base : endurance (armes) ou mana (magie). Aucune munition. L’arbalète se recharge seulement quand elle est en main.</li>
  <li>Maîtrise : seuls les dégâts réels infligés à de vrais ennemis la font progresser. Le mannequin ne donne ni maîtrise ni charge d’ultime.</li>
  <li>Chute en expédition principale ou en donjon : retour au dernier point de halte (les ennemis ordinaires reviennent ; boss, coffres et raccourcis restent). Chute en région de ressources : retour au camp avec la perte de 20 % de la récolte de la sortie (le détail s’affiche).</li>
  <li>Donjons : un palier ne progresse qu’après une victoire ; une défaite ne change jamais le palier. Un court délai sépare deux instances récompensées.</li>
  <li>Attaques ennemies annoncées : cercle ou cône au sol, clignotement. Esquivez, puis frappez pendant leur récupération.</li></ul>`;
  return panel('Commandes et règles', host, body);
}

export function creditsPanel(host: PanelHost): HTMLElement {
  const body = h('div', { class: 'credits' });
  body.append(h('p', { text: 'Tous les graphismes, musiques et sons proviennent de ressources gratuites sous licences libres, téléchargées puis découpées, assemblées ou converties sans être redessinées. Détail complet : ASSET_CREDITS.md et assets/manifest.json.' }));
  for (const c of CREDITS) {
    body.append(h('h3', { text: c.pack }));
    body.append(h('p', {}, `Auteurs : ${c.authors}`, h('br'), `Licence : ${c.license}`, h('br'), 'Source : ', h('a', { href: c.url, target: '_blank', rel: 'noopener', text: c.url }), c.via ? h('span', { text: ` (copie utilisée : ${c.via})` }) : null));
    if (c.note) body.append(h('p', { class: 'note-muted', text: c.note }));
  }
  body.append(h('h3', { text: 'Jeu' }), h('p', { text: `Code : Phaser 3 (licence MIT), TypeScript, Vite. Projet « Les Bois de Cendre ». Version ${host.version}.` }));
  return panel('Crédits', host, body);
}

export function notePanel(host: PanelHost, id: string): HTMLElement {
  const n = NOTE_BY_ID[id];
  const body = h('div', {}, h('div', { class: 'notetext', text: n ? n.text : '…' }));
  return panel(n ? n.title : 'Note', host, body, { narrow: true });
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
