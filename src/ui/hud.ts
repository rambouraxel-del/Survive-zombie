// Affichage tête haute compact : jauges, jour/nuit, objectif sur une ligne, recette suivie,
// barre rapide (raccourcis indépendants du sac), boutons d'action.
// Le DOM n'est modifié que lorsqu'une valeur affichée change réellement.
import { DAY, PLAYER } from '../config/balance';
import { item } from '../data/items';
import { PHASE_NAMES, type Game } from '../sim/game';
import { currentObjective } from '../sim/objectives';
import { hotbarQty, isEquipped } from '../sim/hotbar';
import { entryByKey, missingFor } from '../sim/crafting';
import type { Stack } from '../sim/inventory';
import { perf } from '../render/perf';
import { $, clear, h } from './dom';
import { icon, setIcon } from './icons';

export function slotEl(st: Stack | null, opts: { key?: string; box?: number; sel?: boolean } = {}): HTMLButtonElement {
  const b = h('button', { class: 'slot' + (opts.sel ? ' sel' : '') }) as HTMLButtonElement;
  if (opts.key) b.append(h('span', { class: 'key', text: opts.key }));
  if (st) {
    const d = item(st.id);
    b.append(icon(d.icon, opts.box ?? 36));
    if (st.qty > 1) b.append(h('span', { class: 'qty', text: String(st.qty) }));
    if (d.durability !== undefined && st.dur !== undefined) {
      const r = st.dur / d.durability;
      const bar = h('span', { class: 'dur' + (r < 0.25 ? ' low' : '') }, h('i', { style: { width: `${Math.max(0, r * 100)}%` } }));
      b.append(bar);
      if (st.dur <= 0) b.classList.add('broken');
    }
    b.title = d.name;
    b.setAttribute('aria-label', `${d.name}${st.qty > 1 ? ` × ${st.qty}` : ''}`);
  } else b.setAttribute('aria-label', 'Emplacement vide');
  return b;
}

/** Case de raccourci : icône, quantité totale, état épuisé ou en main. */
export function hotbarSlotEl(g: Game, i: number, opts: { box?: number; sel?: boolean } = {}): HTMLButtonElement {
  const e = g.hotbar[i];
  const b = h('button', { class: 'slot hb' + (opts.sel ? ' sel' : '') }) as HTMLButtonElement;
  b.append(h('span', { class: 'key', text: String(i + 1) }));
  if (!e) {
    b.classList.add('empty');
    b.setAttribute('aria-label', `Raccourci ${i + 1} vide : toucher pour choisir un objet`);
    return b;
  }
  const d = item(e.id);
  const n = hotbarQty(g, e.id);
  b.append(icon(d.icon, opts.box ?? 32));
  if (n > 1 || (n === 0 && d.stack > 1)) b.append(h('span', { class: 'qty', text: String(n) }));
  if (n === 0) b.classList.add('out');
  if (isEquipped(g, e.id)) b.classList.add('equipped');
  b.setAttribute('aria-label', `Raccourci ${i + 1} : ${d.name}${n === 0 ? ' (épuisé)' : ` × ${n}`}${isEquipped(g, e.id) ? ', en main' : ''}`);
  return b;
}

/** Durée pendant laquelle un objectif nouveau ou qui progresse est mis en avant. */
const FRESH_MS = 6000;

export class Hud {
  private last = { hb: '', weapon: '#', obj: '', target: '', pin: '', bars: '', day: '' };
  private t = 0;
  private freshTimer = 0;
  onQuickSlot: (i: number) => void = () => {};

  constructor() {
    setIcon($('#m-inv .mico'), 'items:i_bag', 26);
    setIcon($('#m-menu .mico'), 'items:i_note', 26);
    setIcon($('#objective .obj-ico'), 'items:i_map', 18);
    setIcon($('#pin .pin-ico'), 'world:i_hammer', 18);
    setIcon($('#btn-dodge .aico'), 'items:i_boots', 24);
  }

  private setBar(id: string, v: number, max: number, warn: number, crit: number): void {
    const el = $(id);
    const w = `${Math.max(0, Math.min(100, (v / max) * 100)).toFixed(1)}%`;
    const fill = el.querySelector('.fill') as HTMLElement;
    if (fill.style.width !== w) fill.style.width = w;
    const val = el.querySelector('.val') as HTMLElement;
    const txt = String(Math.max(0, Math.round(v)));
    if (val.textContent !== txt) val.textContent = txt;
    el.classList.toggle('warn', v <= warn);
    el.classList.toggle('crit', v <= crit);
    perf.domWrites++;
  }

  update(g: Game, dt: number): void {
    this.t -= dt;
    const p = g.player;
    // bouton d'action : réagit immédiatement au changement de cible ; verbe court seulement
    const tgt = g.target;
    const tkey = tgt ? `${tgt.label}|${tgt.icon}|${tgt.empty ? 1 : 0}` : '';
    if (tkey !== this.last.target) {
      this.last.target = tkey;
      const btn = $('#btn-action');
      (btn.querySelector('.albl') as HTMLElement).textContent = tgt ? tgt.label : 'Action';
      const ico = btn.querySelector('.aico') as HTMLElement;
      if (tgt) setIcon(ico, tgt.icon, 28);
      else setIcon(ico, 'items:i_bag', 0);
      btn.classList.toggle('has-target', !!tgt && !tgt.empty);
      btn.classList.toggle('no-target', !tgt);
      btn.setAttribute('aria-label', tgt ? `${tgt.label} : ${tgt.name}` : 'Action (rien à portée)');
    }
    if (this.t > 0) return;
    this.t = 0.1;
    // jauges : écrites seulement si l'arrondi affiché change
    const bars = `${Math.round(p.hp)}|${Math.round(p.hunger)}|${Math.round(p.stamina)}`;
    if (bars !== this.last.bars) {
      this.last.bars = bars;
      this.setBar('#bar-hp', p.hp, PLAYER.maxHealth, 35, 20);
      this.setBar('#bar-hunger', p.hunger, PLAYER.maxHunger, PLAYER.hungerWarn, PLAYER.hungerCritical);
      this.setBar('#bar-stamina', p.stamina, PLAYER.maxStamina, 20, 0);
    }
    const day = `Jour ${g.day} · ${PHASE_NAMES[g.phase()]}`;
    const dpos = `${((g.dayTime / DAY.length) * 100).toFixed(1)}%`;
    if (day + dpos !== this.last.day) {
      this.last.day = day + dpos;
      $('#dayname').textContent = day;
      $('#dayfill').style.left = dpos;
    }

    // arme (ou outil servant d'arme) affichée sur le bouton d'attaque, avec son usure
    const w = p.equip.weapon ?? (p.equip.tool && item(p.equip.tool.id).weapon ? p.equip.tool : null);
    const wsig = w ? `${w.id}|${Math.ceil(w.dur ?? 0)}` : '';
    if (wsig !== this.last.weapon) {
      this.last.weapon = wsig;
      const btn = $('#btn-attack');
      setIcon(btn.querySelector('.aico') as HTMLElement, w ? item(w.id).icon : 'items:i_sword', 30);
      btn.classList.toggle('bare', !w);
      const dur = btn.querySelector('.dur') as HTMLElement;
      const d = w ? item(w.id) : null;
      if (w && d?.durability && w.dur !== undefined) {
        const r = w.dur / d.durability;
        dur.classList.remove('hidden');
        dur.classList.toggle('low', r < 0.25);
        (dur.firstElementChild as HTMLElement).style.width = `${Math.max(0, r * 100)}%`;
      } else dur.classList.add('hidden');
      btn.setAttribute('aria-label', w ? `Attaquer (${item(w.id).name})` : 'Attaquer (mains nues)');
    }

    // barre rapide : raccourcis indépendants du sac
    const hsig = g.hotbar.map((e) => (e ? `${e.id}:${hotbarQty(g, e.id)}:${isEquipped(g, e.id) ? 1 : 0}` : '-')).join('|');
    if (hsig !== this.last.hb) {
      this.last.hb = hsig;
      const qb = $('#quickbar');
      clear(qb);
      for (let i = 0; i < g.hotbar.length; i++) {
        const s = hotbarSlotEl(g, i);
        s.addEventListener('click', () => this.onQuickSlot(i));
        qb.append(s);
      }
    }

    // objectif : une seule ligne, mise en avant brièvement quand il change ou progresse
    const o = currentObjective(g);
    const prog = o?.progress?.(g) ?? '';
    const osig = o ? `${o.id}|${prog}` : `done|${g.final.state}`;
    if (osig !== this.last.obj) {
      const first = this.last.obj === '';
      const changed = this.last.obj.split('|')[0] !== osig.split('|')[0];
      this.last.obj = osig;
      $('#obj-title').textContent = o ? o.title : g.final.state === 'won' ? 'Forêt libérée : explorez librement' : 'Survivre';
      $('#obj-progress').textContent = prog ? shortProgress(prog) : '';
      if (!first && changed) this.highlightObjective();
    }

    // recette suivie : ressources manquantes (directes / à fabriquer)
    const pinSig = g.pinned ? pinText(g) : '';
    if (pinSig !== this.last.pin) {
      this.last.pin = pinSig;
      const el = $('#pin');
      el.classList.toggle('hidden', !g.pinned);
      $('#pin-text').textContent = pinSig;
      if (g.pinned) {
        const e = entryByKey(g.pinned);
        if (e) setIcon($('#pin .pin-ico'), item(e.output).icon, 18);
        el.classList.toggle('ready', !!missingFor(g, g.pinned)?.ready);
      }
    }
  }

  /** Met l'objectif en avant (par exemple au début d'une partie). */
  highlightObjective(): void {
    const el = $('#objective');
    el.classList.add('fresh');
    clearTimeout(this.freshTimer);
    this.freshTimer = window.setTimeout(() => el.classList.remove('fresh'), FRESH_MS);
  }

  forceRefresh(): void {
    this.last = { hb: '', weapon: '#', obj: this.last.obj, target: '', pin: '', bars: '', day: '' };
    this.t = 0;
  }
}

/** Texte compact de la recette suivie : « Massue : pierre 1/3 · corde 0/1 (à fabriquer) ». */
export function pinText(g: Game): string {
  if (!g.pinned) return '';
  const e = entryByKey(g.pinned);
  const m = missingFor(g, g.pinned);
  if (!e || !m) return '';
  const name = item(e.output).name;
  if (m.ready) return `${name} : prêt${m.station.ok ? '' : ` · ${m.station.text.replace(' (pas à portée)', '')}`}`;
  const parts = [
    ...m.direct.map((x) => `${item(x.id).name.toLowerCase()} ${x.have}/${x.need}`),
    ...m.crafted.map((x) => `${item(x.id).name.toLowerCase()} ${x.have}/${x.need} (à fabriquer)`),
  ];
  return `${name} : ${parts.join(' · ')}`;
}

/** « Bois 1/3 · Pierre 0/3 · Fibres 2/2 » -> « 1/3 · 0/3 · 2/2 » pour tenir sur une ligne. */
function shortProgress(p: string): string {
  const parts = p.split('·').map((s) => s.trim());
  if (parts.length > 1 && parts.every((s) => /\d+\/\d+/.test(s))) return parts.map((s) => s.replace(/^[^\d]*\s/, '')).join(' · ');
  return p;
}
