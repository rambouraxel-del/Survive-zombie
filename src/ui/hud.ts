// Affichage tête haute compact : jauges, jour/nuit, objectif sur une ligne,
// barre rapide, boutons d'action (l'arme équipée est affichée sur « Attaque »).
import { DAY, PLAYER } from '../config/balance';
import { item } from '../data/items';
import { PHASE_NAMES, type Game } from '../sim/game';
import { currentObjective } from '../sim/objectives';
import type { Stack } from '../sim/inventory';
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

/** Durée pendant laquelle un objectif nouveau ou qui progresse est mis en avant. */
const FRESH_MS = 6000;

export class Hud {
  private last = { inv: '', weapon: '#', obj: '', target: '' };
  private t = 0;
  private freshTimer = 0;
  onQuickSlot: (i: number) => void = () => {};

  constructor() {
    setIcon($('#m-inv .mico'), 'items:i_bag', 26);
    setIcon($('#m-menu .mico'), 'items:i_note', 26);
    setIcon($('#objective .obj-ico'), 'items:i_map', 18);
    setIcon($('#btn-dodge .aico'), 'items:i_boots', 24);
  }

  private setBar(id: string, v: number, max: number, warn: number, crit: number): void {
    const el = $(id);
    (el.querySelector('.fill') as HTMLElement).style.width = `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
    (el.querySelector('.val') as HTMLElement).textContent = String(Math.max(0, Math.round(v)));
    el.classList.toggle('warn', v <= warn);
    el.classList.toggle('crit', v <= crit);
  }

  update(g: Game, dt: number): void {
    this.t -= dt;
    const p = g.player;
    // bouton d'action : réagit immédiatement au changement de cible
    const tgt = g.target;
    const tkey = tgt ? `${tgt.label}|${tgt.icon}` : '';
    if (tkey !== this.last.target) {
      this.last.target = tkey;
      const btn = $('#btn-action');
      (btn.querySelector('.albl') as HTMLElement).textContent = tgt ? tgt.label : 'Action';
      const ico = btn.querySelector('.aico') as HTMLElement;
      if (tgt) setIcon(ico, tgt.icon, 28);
      else setIcon(ico, 'items:i_bag', 0);
      btn.classList.toggle('has-target', !!tgt);
      btn.classList.toggle('no-target', !tgt);
    }
    if (this.t > 0) return;
    this.t = 0.1;
    this.setBar('#bar-hp', p.hp, PLAYER.maxHealth, 35, 20);
    this.setBar('#bar-hunger', p.hunger, PLAYER.maxHunger, PLAYER.hungerWarn, PLAYER.hungerCritical);
    this.setBar('#bar-stamina', p.stamina, PLAYER.maxStamina, 20, 0);
    $('#dayname').textContent = `Jour ${g.day} · ${PHASE_NAMES[g.phase()]}`;
    $('#dayfill').style.left = `${(g.dayTime / DAY.length) * 100}%`;

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

    const isig = JSON.stringify(p.inv.slice(0, 5));
    if (isig !== this.last.inv) {
      this.last.inv = isig;
      const qb = $('#quickbar');
      clear(qb);
      for (let i = 0; i < 5; i++) {
        const s = slotEl(p.inv[i], { key: String(i + 1), box: 32 });
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
      this.last.obj = osig;
      $('#obj-title').textContent = o ? o.title : g.final.state === 'won' ? 'Forêt libérée : explorez librement' : 'Survivre';
      $('#obj-progress').textContent = prog ? shortProgress(prog) : '';
      const el = $('#objective');
      if (!first) {
        el.classList.add('fresh');
        clearTimeout(this.freshTimer);
        this.freshTimer = window.setTimeout(() => el.classList.remove('fresh'), FRESH_MS);
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
    this.last = { inv: '', weapon: '#', obj: this.last.obj, target: '' };
    this.t = 0;
  }
}

/** « Bois 1/3 · Pierre 0/3 · Fibres 2/2 » -> « 1/3 · 0/3 · 2/2 » pour tenir sur une ligne. */
function shortProgress(p: string): string {
  const parts = p.split('·').map((s) => s.trim());
  if (parts.length > 1 && parts.every((s) => /\d+\/\d+/.test(s))) return parts.map((s) => s.replace(/^[^\d]*\s/, '')).join(' · ');
  return p;
}
