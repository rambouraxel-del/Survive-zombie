// Affichage tête haute : jauges, jour/nuit, objectif, barre rapide, bouton d'action.
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

export class Hud {
  private last = { inv: '', equip: '', obj: '', target: '', hint: '' };
  private t = 0;
  private lastObjId = '';
  private collapseTimer = 0;
  onQuickSlot: (i: number) => void = () => {};

  constructor() {
    setIcon($('#m-inv .mico'), 'items:i_bag', 28);
    setIcon($('#m-craft .mico'), 'world:i_hammer', 28);
    setIcon($('#m-build .mico'), 'world:i_planks', 28);
    setIcon($('#m-map .mico'), 'items:i_map', 28);
    setIcon($('#m-pause .mico'), 'items:i_note', 28);
    setIcon($('#btn-attack .aico'), 'items:i_sword', 34);
    setIcon($('#btn-dodge .aico'), 'items:i_boots', 26);
    $('#obj-toggle').addEventListener('click', () => $('#objective').classList.toggle('collapsed'));
  }

  private setBar(id: string, v: number, max: number, warn: number, crit: number): void {
    const el = $(id);
    (el.querySelector('.fill') as HTMLElement).style.width = `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
    (el.querySelector('.val') as HTMLElement).textContent = String(Math.max(0, Math.round(v)));
    el.classList.toggle('warn', v <= warn);
    el.classList.toggle('crit', v <= crit);
  }

  update(g: Game, dt: number, showHints: boolean): void {
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
      if (tgt) setIcon(ico, tgt.icon, 30);
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

    const esig = JSON.stringify(p.equip);
    if (esig !== this.last.equip) {
      this.last.equip = esig;
      const box = $('#equipbox');
      clear(box);
      for (const [slot, label] of [['weapon', 'Arme'], ['tool', 'Outil'], ['armor', 'Protection']] as const) {
        const st = p.equip[slot];
        const cell = h('div', { class: 'eq', title: st ? item(st.id).name : `${label} : aucune` });
        if (st) {
          cell.append(icon(item(st.id).icon, 26));
          const d = item(st.id);
          if (d.durability && st.dur !== undefined) {
            const r = st.dur / d.durability;
            cell.append(h('span', { class: 'dur' + (r < 0.25 ? ' low' : '') }, h('i', { style: { width: `${r * 100}%` } })));
          }
        }
        box.append(cell);
      }
    }

    const isig = JSON.stringify(p.inv.slice(0, 5));
    if (isig !== this.last.inv) {
      this.last.inv = isig;
      const qb = $('#quickbar');
      clear(qb);
      for (let i = 0; i < 5; i++) {
        const s = slotEl(p.inv[i], { key: String(i + 1) });
        s.addEventListener('click', () => this.onQuickSlot(i));
        qb.append(s);
      }
    }

    const o = currentObjective(g);
    const osig = o ? `${o.id}|${o.progress?.(g) ?? ''}` : 'done';
    if (osig !== this.last.obj || String(showHints) !== this.last.hint) {
      this.last.obj = osig;
      this.last.hint = String(showHints);
      $('#obj-title').textContent = o ? o.title : g.final.state === 'won' ? 'La forêt est libérée — continuez à explorer' : 'Survivre';
      $('#obj-progress').textContent = o?.progress?.(g) ?? '';
      $('#obj-hint').textContent = o && showHints ? o.hint : '';
      // l'aide se replie seule après quelques secondes pour dégager l'écran
      if (this.last.obj.split('|')[0] !== this.lastObjId) {
        this.lastObjId = this.last.obj.split('|')[0];
        $('#objective').classList.remove('collapsed');
        clearTimeout(this.collapseTimer);
        this.collapseTimer = window.setTimeout(() => $('#objective').classList.add('collapsed'), 12000);
      }
    }
  }

  forceRefresh(): void {
    this.last = { inv: '', equip: '', obj: '', target: '', hint: '' };
    this.t = 0;
  }
}
