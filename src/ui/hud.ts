// Affichage tête haute compact : jauges (PV, endurance, mana, faim), lieu, barre de boss,
// objectif sur une ligne, recette suivie, raccourcis, boutons d'action (arme, compétences,
// ultime, esquive, action, attaque). Le DOM n'est modifié que lorsqu'une valeur change.
import { PLAYER } from '../config/balance';
import { DEST_BY_ID } from '../data/destinations';
import { item, TIER_LABEL } from '../data/items';
import { FAMILY, SKILL, ULTS } from '../data/weapons';
import type { Game } from '../sim/game';
import { currentObjective } from '../sim/objectives';
import { hotbarQty, isEquipped } from '../sim/hotbar';
import { entryByKey, missingFor } from '../sim/crafting';
import { skillState } from '../sim/combat';
import { currentFamily, currentTier, currentWeapon, maxHp, ultUnlocked } from '../sim/profile';
import { checkpointName } from '../sim/travel';
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
    if (d.tier) b.append(h('span', { class: 'tier', text: TIER_LABEL[d.tier] }));
    if (st.ench) b.classList.add('ench');
    b.title = d.name;
    b.setAttribute('aria-label', `${d.name}${st.qty > 1 ? ` × ${st.qty}` : ''}${st.ench ? ' (enchanté)' : ''}`);
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

/** Nom du lieu actuel (et palier / point de halte). */
export function placeName(g: Game): string {
  const run = g.run;
  if (!run) return g.mapId === 'house' ? 'Camp · maison' : 'Camp (sûr)';
  const d = DEST_BY_ID[run.dest];
  if (run.kind === 'dungeon') return `${d.name.replace('Donjon : ', '')} · palier ${run.tier}`;
  const cp = run.checkpoint ?? (run.kind === 'main' ? g.level(run.map).checkpoint : null);
  return cp ? `${d.name} · ${checkpointName(g, run.map) ?? 'halte'}` : d.name;
}

/** Durée pendant laquelle un objectif nouveau ou qui progresse est mis en avant. */
const FRESH_MS = 6000;

export class Hud {
  private last: Record<string, string> = {};
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

  private changed(k: string, v: string): boolean {
    if (this.last[k] === v) return false;
    this.last[k] = v;
    return true;
  }

  private setBar(id: string, v: number, max: number, warn: number, crit: number, extra = ''): void {
    const el = $(id);
    const w = `${Math.max(0, Math.min(100, (v / max) * 100)).toFixed(1)}%`;
    const fill = el.querySelector('.fill') as HTMLElement;
    if (fill.style.width !== w) fill.style.width = w;
    const val = el.querySelector('.val') as HTMLElement;
    const txt = String(Math.max(0, Math.round(v))) + extra;
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
    if (this.changed('target', tgt ? `${tgt.label}|${tgt.icon}|${tgt.empty ? 1 : 0}` : '')) {
      const btn = $('#btn-action');
      (btn.querySelector('.albl') as HTMLElement).textContent = tgt ? tgt.label : 'Action';
      const ico = btn.querySelector('.aico') as HTMLElement;
      if (tgt) setIcon(ico, tgt.icon, 28);
      else setIcon(ico, 'items:i_bag', 0);
      btn.classList.toggle('has-target', !!tgt && !tgt.empty);
      btn.classList.toggle('no-target', !tgt);
      btn.setAttribute('aria-label', tgt ? `${tgt.label} : ${tgt.name}` : 'Action (rien à portée)');
    }
    this.updateCombat(g);
    if (this.t > 0) return;
    this.t = 0.1;
    const mhp = maxHp(g);
    if (this.changed('bars', `${Math.round(p.hp)}|${mhp}|${Math.round(p.hunger)}|${Math.round(p.stamina)}|${Math.round(p.mana)}|${g.run ? 1 : 0}`)) {
      this.setBar('#bar-hp', p.hp, mhp, mhp * 0.35, mhp * 0.2);
      this.setBar('#bar-stamina', p.stamina, PLAYER.maxStamina, 20, 0);
      this.setBar('#bar-mana', p.mana, PLAYER.maxMana, 20, 0);
      this.setBar('#bar-hunger', p.hunger, PLAYER.maxHunger, 30, 12);
      $('#bar-hunger').classList.toggle('paused', !g.run);
      $('#bar-hunger').title = g.run ? 'La faim baisse pendant les expéditions.' : 'Au camp, la faim ne baisse pas.';
      const fam = currentFamily(g);
      $('#bar-mana').classList.toggle('dim', !!fam && FAMILY[fam].resource !== 'mana');
      $('#bar-stamina').classList.toggle('dim', !!fam && FAMILY[fam].resource === 'mana');
    }
    const pn = placeName(g);
    if (this.changed('place', pn)) $('#place-line').textContent = pn;

    // barre de boss
    const ba = g.bossActive;
    const be = ba ? g.enemies.find((e) => e.id === ba.id) : null;
    const bsig = be ? `${ba!.name}|${Math.ceil(be.hp)}|${be.phase}` : '';
    if (this.changed('boss', bsig)) {
      const bar = $('#bossbar');
      bar.classList.toggle('hidden', !be);
      if (be) {
        $('#boss-name').textContent = `${ba!.name}${be.phase === 2 ? ' — enragé' : ''}`;
        (bar.querySelector('.fill') as HTMLElement).style.width = `${Math.max(0, (be.hp / be.maxHp) * 100).toFixed(1)}%`;
      }
    }

    // barre rapide : raccourcis indépendants du sac
    const hsig = g.hotbar.map((e) => (e ? `${e.id}:${hotbarQty(g, e.id)}:${isEquipped(g, e.id) ? 1 : 0}` : '-')).join('|');
    if (this.changed('hb', hsig)) {
      const qb = $('#quickbar');
      clear(qb);
      for (let i = 0; i < g.hotbar.length; i++) {
        const s = hotbarSlotEl(g, i);
        s.addEventListener('click', () => this.onQuickSlot(i));
        qb.append(s);
      }
    }

    // objectif : une seule ligne, mise en avant brièvement quand il change
    const o = currentObjective(g);
    const prog = o?.progress?.(g) ?? '';
    const osig = o ? `${o.id}|${prog}` : 'done';
    const prevObj = this.last.obj ?? '';
    if (this.changed('obj', osig)) {
      $('#obj-title').textContent = o ? o.title : 'Explorer librement, monter les paliers';
      $('#obj-progress').textContent = prog;
      if (prevObj && prevObj.split('|')[0] !== osig.split('|')[0]) this.highlightObjective();
    }

    // recette suivie
    const pinSig = g.pinned ? pinText(g) : '';
    if (this.changed('pin', pinSig)) {
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

  /** Boutons de combat : mis à jour à chaque image (recharges visibles), écrits seulement si besoin. */
  private updateCombat(g: Game): void {
    const p = g.player;
    const fam = currentFamily(g);
    const w = p.equip.weapon;
    if (this.changed('weapon', w ? `${w.id}|${w.ench ?? ''}` : '')) {
      const atk = $('#btn-attack');
      setIcon(atk.querySelector('.aico') as HTMLElement, w ? item(w.id).icon : 'items:i_claws', 30);
      atk.classList.toggle('bare', !w);
      atk.setAttribute('aria-label', w ? `Attaquer (${item(w.id).name})` : 'Attaquer (mains nues)');
      const wb = $('#btn-weapon');
      setIcon(wb.querySelector('.aico') as HTMLElement, w ? item(w.id).icon : 'items:i_claws', 22);
      (wb.querySelector('.wtier') as HTMLElement).textContent = w ? TIER_LABEL[currentTier(g)] : '';
      wb.setAttribute('aria-label', `Changer d’arme (actuelle : ${w ? item(w.id).name : 'mains nues'}). Appui long : liste.`);
    }
    // arbalète : indicateur de rechargement
    const st = currentWeapon(g);
    const rl = fam === 'crossbow' && !p.xbowLoaded ? Math.min(1, p.reloadT / (st.reload ?? 1)) : -1;
    if (this.changed('reload', rl < 0 ? '' : rl.toFixed(2))) {
      const r = $('#btn-attack .reload');
      r.classList.toggle('hidden', rl < 0);
      if (rl >= 0) (r.firstElementChild as HTMLElement).style.width = `${(rl * 100).toFixed(0)}%`;
    }
    for (const i of [0, 1] as const) {
      const s = skillState(g, i);
      const cd = s.cd > 0 ? Math.ceil(s.cd) : 0;
      const sig = `${s.id ?? '-'}|${cd}|${s.ok ? 1 : 0}|${s.reason ?? ''}`;
      if (!this.changed(`sk${i}`, sig)) continue;
      const b = $(`#btn-skill-${i}`);
      const ico = b.querySelector('.aico') as HTMLElement;
      if (s.id) setIcon(ico, SKILL[s.id].icon, 26);
      else setIcon(ico, 'items:i_key', 20);
      (b.querySelector('.cd') as HTMLElement).textContent = cd ? String(cd) : '';
      (b.querySelector('.cost') as HTMLElement).textContent = s.id ? String(SKILL[s.id].cost) : '';
      b.classList.toggle('locked', !s.id);
      b.classList.toggle('cooling', cd > 0);
      b.classList.toggle('short', !!s.id && !s.ok && cd === 0);
      b.setAttribute('aria-label', s.id ? `${SKILL[s.id].name}${cd ? ` (recharge ${cd} s)` : ''}` : `Compétence ${i + 1} : ${s.reason ?? 'à débloquer'}`);
    }
    const unlocked = !!fam && ultUnlocked(g, fam);
    const pct = Math.floor(g.ult);
    if (this.changed('ult', `${fam ?? '-'}|${pct}|${unlocked ? 1 : 0}`)) {
      const b = $('#btn-ult');
      b.style.setProperty('--ult', `${pct}%`);
      (b.querySelector('.pct') as HTMLElement).textContent = pct >= 100 ? '' : `${pct}`;
      setIcon(b.querySelector('.aico') as HTMLElement, fam ? ULTS[fam].icon : 'items:i_gem_red', 28);
      b.classList.toggle('ready', pct >= 100 && unlocked);
      b.classList.toggle('locked', !unlocked);
      b.setAttribute('aria-label', fam ? `Ultime : ${ULTS[fam].name} (${pct} %). Maintenir et glisser pour viser.` : 'Ultime : équipez une arme');
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
    const obj = this.last.obj;
    this.last = {};
    if (obj) this.last.obj = obj;
    this.t = 0;
  }
}

/** Texte compact de la recette suivie : « Épée longue : acier 1/3 · cuir 0/1 (à fabriquer) ». */
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
