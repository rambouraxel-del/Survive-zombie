// Entrées tactiles (multitouch) et clavier. Chaque commande suit son propre
// identifiant de pointeur : marcher, attaquer et interagir ne se neutralisent pas.
//
// Trois natures d'entrée sont distinguées :
//  - l'appui ponctuel (attaque, action, esquive) est mis en attente (`attackTap`…) et
//    consommé par la simulation : il n'est jamais perdu, même très bref ;
//  - l'état maintenu (joystick, bouton gardé enfoncé) sert au déplacement et à la récolte répétée ;
//  - la répétition volontaire suit la cadence de l'arme ou de l'outil (gérée par la simulation).
import { newInput, type InputState } from '../sim/types';

export type InputKind = 'touch' | 'keyboard' | 'mouse';

export interface ControlCallbacks {
  onQuickSlot: (i: number) => void;
  onShortcut: (name: 'inventory' | 'craft' | 'build' | 'map' | 'pause' | 'journal' | 'weapons' | 'nextWeapon') => void;
  isBlocked: () => boolean; // un menu est ouvert : la simulation est en pause
  onInputKind?: (k: InputKind) => void;
}

const BASE_JOY_RADIUS = 56;

export class Controls {
  state: InputState = newInput();
  private keys = new Set<string>();
  private joyId: number | null = null;
  private joyOx = 0;
  private joyOy = 0;
  private joyVx = 0;
  private joyVy = 0;
  private attackId: number | null = null;
  private interactId: number | null = null;
  /** ultime : pointeur qui vise (tactile), ou touche L maintenue (clavier + souris) */
  private ultId: number | null = null;
  private ultOx = 0;
  private ultOy = 0;
  private ultKey = false;
  private mouseX = 0;
  private mouseY = 0;
  private ultCancelEl: HTMLElement;
  private joyBase: HTMLElement;
  private joyKnob: HTMLElement;
  private cb: ControlCallbacks;
  /** rayon du joystick (px CSS), réglable */
  joyRadius = BASE_JOY_RADIUS;
  touchUsed = false;
  lastKind: InputKind | null = null;

  constructor(root: HTMLElement, cb: ControlCallbacks) {
    this.cb = cb;
    const zone = root.querySelector<HTMLElement>('#joy-zone')!;
    this.joyBase = root.querySelector<HTMLElement>('#joy-base')!;
    this.joyKnob = root.querySelector<HTMLElement>('#joy-knob')!;
    this.ultCancelEl = root.querySelector<HTMLElement>('#ult-cancel')!;
    window.addEventListener('pointermove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    // méthode d'entrée réellement utilisée (appareils hybrides : tactile + clavier/souris)
    window.addEventListener('pointerdown', (e) => this.setKind(e.pointerType === 'mouse' ? 'mouse' : 'touch'), { capture: true });

    zone.addEventListener('pointerdown', (e) => {
      if (this.joyId !== null) return;
      e.preventDefault();
      this.touchUsed = true;
      this.joyId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      this.joyOx = e.clientX;
      this.joyOy = e.clientY;
      this.joyBase.style.left = `${e.clientX - r.left}px`;
      this.joyBase.style.top = `${e.clientY - r.top}px`;
      this.joyBase.classList.add('active');
      this.updateJoy(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyId) return;
      e.preventDefault();
      this.updateJoy(e.clientX, e.clientY);
    });
    const endJoy = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.releaseJoy();
    };
    zone.addEventListener('pointerup', endJoy);
    zone.addEventListener('pointercancel', endJoy);
    zone.addEventListener('lostpointercapture', endJoy);

    this.holdButton(root.querySelector('#btn-attack')!, 'attack');
    this.holdButton(root.querySelector('#btn-action')!, 'interact');
    const dodge = root.querySelector<HTMLElement>('#btn-dodge')!;
    dodge.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.touchUsed = true;
      if (!this.cb.isBlocked()) this.state.dodge = true;
      dodge.classList.add('pressed');
    });
    const up = () => dodge.classList.remove('pressed');
    dodge.addEventListener('pointerup', up);
    dodge.addEventListener('pointercancel', up);
    dodge.addEventListener('pointerleave', up);
    dodge.addEventListener('contextmenu', (e) => e.preventDefault());

    // compétences : appui ponctuel
    for (const i of [0, 1] as const) {
      const el = root.querySelector<HTMLElement>(`#btn-skill-${i}`)!;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.touchUsed = true;
        if (!this.cb.isBlocked()) this.state.skillTap[i] = true;
        el.classList.add('pressed');
      });
      const off = () => el.classList.remove('pressed');
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    // changer d'arme : appui = arme suivante ; appui long = choix dans la liste
    const wb = root.querySelector<HTMLElement>('#btn-weapon')!;
    let wbT = 0;
    let wbLong = false;
    wb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      wbLong = false;
      wb.classList.add('pressed');
      clearTimeout(wbT);
      wbT = window.setTimeout(() => {
        wbLong = true;
        wb.classList.remove('pressed');
        if (!this.cb.isBlocked()) this.cb.onShortcut('weapons');
      }, 450);
    });
    wb.addEventListener('pointerup', (e) => {
      e.preventDefault();
      clearTimeout(wbT);
      wb.classList.remove('pressed');
      if (!wbLong && !this.cb.isBlocked()) this.cb.onShortcut('nextWeapon');
    });
    const wbOff = () => {
      clearTimeout(wbT);
      wb.classList.remove('pressed');
    };
    wb.addEventListener('pointercancel', wbOff);
    wb.addEventListener('pointerleave', wbOff);
    wb.addEventListener('contextmenu', (e) => e.preventDefault());

    // ultime : maintenir, glisser pour viser, relâcher pour lancer ; relâcher sur « annuler » l'annule
    const ub = root.querySelector<HTMLElement>('#btn-ult')!;
    ub.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.touchUsed = true;
      if (this.cb.isBlocked() || this.ultId !== null) return;
      this.ultId = e.pointerId;
      this.ultOx = e.clientX;
      this.ultOy = e.clientY;
      try {
        ub.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      ub.classList.add('pressed');
      this.state.ultAiming = true;
      this.state.ultX = 0;
      this.state.ultY = 0;
      this.ultCancelEl.classList.remove('hidden', 'over');
    });
    ub.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.ultId) return;
      e.preventDefault();
      const R = 90;
      let dx = (e.clientX - this.ultOx) / R;
      let dy = (e.clientY - this.ultOy) / R;
      const l = Math.hypot(dx, dy);
      if (l > 1) {
        dx /= l;
        dy /= l;
      }
      this.state.ultX = dx;
      this.state.ultY = dy;
      this.ultCancelEl.classList.toggle('over', this.overCancel(e.clientX, e.clientY));
    });
    const ultEnd = (e: PointerEvent, cancelled: boolean) => {
      if (e.pointerId !== this.ultId) return;
      this.ultId = null;
      ub.classList.remove('pressed');
      this.finishUlt(cancelled || this.overCancel(e.clientX, e.clientY));
    };
    ub.addEventListener('pointerup', (e) => ultEnd(e, false));
    ub.addEventListener('pointercancel', (e) => ultEnd(e, true));
    ub.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    // relâchement fiable : perte de focus, arrière-plan, rotation, redimensionnement
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => this.reset());
    window.addEventListener('orientationchange', () => this.reset());
    window.addEventListener('pagehide', () => this.reset());
    window.addEventListener('resize', () => this.releaseJoy());
  }

  private setKind(k: InputKind): void {
    if (k === this.lastKind) return;
    this.lastKind = k;
    this.cb.onInputKind?.(k);
  }

  private holdButton(el: HTMLElement, which: 'attack' | 'interact'): void {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.touchUsed = true;
      if (which === 'attack') this.attackId = e.pointerId;
      else this.interactId = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* pointeur déjà relâché */
      }
      el.classList.add('pressed');
      if (this.cb.isBlocked()) return;
      // l'appui est mémorisé : même relâché avant le prochain pas de simulation, il agit
      if (which === 'attack') this.state.attackTap = true;
      else this.state.interactTap = true;
    });
    const end = (e: PointerEvent) => {
      const id = which === 'attack' ? this.attackId : this.interactId;
      if (e.pointerId !== id) return;
      if (which === 'attack') this.attackId = null;
      else this.interactId = null;
      el.classList.remove('pressed');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private updateJoy(x: number, y: number): void {
    const R = this.joyRadius;
    let dx = x - this.joyOx;
    let dy = y - this.joyOy;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    this.joyVx = dx / R;
    this.joyVy = dy / R;
    this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  private releaseJoy(): void {
    this.joyId = null;
    this.joyVx = 0;
    this.joyVy = 0;
    this.joyBase.classList.remove('active');
    this.joyKnob.style.transform = 'translate(0px, 0px)';
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    const c = e.code;
    const gameKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyJ', 'KeyK', 'KeyE', 'KeyF', 'KeyX', 'Enter', 'Tab', 'KeyU', 'KeyI', 'KeyL', 'KeyR', 'KeyG'];
    if (gameKeys.includes(c)) e.preventDefault();
    if (down) this.keys.add(c);
    else this.keys.delete(c);
    // ultime au clavier : maintenir L, viser à la souris (ou vers l'ennemi le plus proche), relâcher
    if (c === 'KeyL' && !down && this.ultKey) {
      this.ultKey = false;
      this.finishUlt(false);
      return;
    }
    if (!down || e.repeat) return;
    this.setKind('keyboard');
    if (c === 'Escape') {
      if (this.state.ultAiming) {
        this.ultKey = false;
        this.ultId = null;
        this.finishUlt(true);
        return;
      }
      this.cb.onShortcut('pause');
    }
    if (this.cb.isBlocked()) return;
    if (c === 'KeyK' || c === 'KeyX') this.state.dodge = true;
    if (c === 'Space' || c === 'KeyJ') this.state.attackTap = true;
    if (c === 'KeyE' || c === 'KeyF' || c === 'Enter') this.state.interactTap = true;
    if (c === 'KeyU') this.state.skillTap[0] = true;
    if (c === 'KeyI') this.state.skillTap[1] = true;
    if (c === 'KeyL' && this.ultId === null) {
      this.ultKey = true;
      this.state.ultAiming = true;
      this.state.ultX = 0;
      this.state.ultY = 0;
    }
    if (c.startsWith('Digit')) {
      const n = Number(c.slice(5));
      if (n >= 1 && n <= 5) this.cb.onQuickSlot(n - 1);
    }
    if (c === 'Tab') this.cb.onShortcut('inventory');
    if (c === 'KeyC') this.cb.onShortcut('craft');
    if (c === 'KeyB') this.cb.onShortcut('build');
    if (c === 'KeyM') this.cb.onShortcut('map');
    if (c === 'KeyN') this.cb.onShortcut('journal');
    if (c === 'KeyR') this.cb.onShortcut('nextWeapon');
    if (c === 'KeyG') this.cb.onShortcut('weapons');
  }

  private overCancel(x: number, y: number): boolean {
    const r = this.ultCancelEl.getBoundingClientRect();
    return r.width > 0 && x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8;
  }

  private finishUlt(cancel: boolean): void {
    if (!this.state.ultAiming) return;
    this.state.ultAiming = false;
    this.ultCancelEl.classList.add('hidden');
    if (cancel || this.cb.isBlocked()) this.state.ultCancel = true;
    else this.state.ultRelease = true;
  }

  /** Visée clavier : direction de la souris depuis le centre de l'écran (le personnage). */
  private keyboardAim(): void {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const R = Math.min(window.innerWidth, window.innerHeight) * 0.42;
    let dx = (this.mouseX - cx) / R;
    let dy = (this.mouseY - cy) / R;
    const l = Math.hypot(dx, dy);
    if (this.lastKind !== 'mouse' && l === 0) return;
    if (l > 1) {
      dx /= l;
      dy /= l;
    }
    this.state.ultX = dx;
    this.state.ultY = dy;
  }

  /** Lecture à chaque image : combine joystick et clavier. */
  poll(): InputState {
    const k = this.keys;
    let kx = 0;
    let ky = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) kx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) kx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) ky -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) ky += 1;
    if (kx || ky) {
      const l = Math.hypot(kx, ky);
      this.state.mx = kx / l;
      this.state.my = ky / l;
      this.state.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    } else {
      this.state.mx = this.joyVx;
      this.state.my = this.joyVy;
      // joystick poussé à fond : course
      this.state.sprint = Math.hypot(this.joyVx, this.joyVy) > 0.96;
    }
    const kbAttack = k.has('Space') || k.has('KeyJ');
    const kbInteract = k.has('KeyE') || k.has('KeyF') || k.has('Enter');
    this.state.attack = this.attackId !== null || kbAttack;
    this.state.interact = this.interactId !== null || kbInteract;
    if (this.ultKey && this.mouseX + this.mouseY > 0) this.keyboardAim();
    return this.state;
  }

  /** Relâche toutes les commandes (perte de focus, menu, orientation…). */
  reset(): void {
    this.keys.clear();
    this.releaseJoy();
    this.attackId = null;
    this.interactId = null;
    this.state.attack = false;
    this.state.interact = false;
    this.state.attackTap = false;
    this.state.interactTap = false;
    this.state.dodge = false;
    this.state.skillTap[0] = false;
    this.state.skillTap[1] = false;
    if (this.state.ultAiming) this.state.ultCancel = true;
    this.state.ultAiming = false;
    this.state.ultRelease = false;
    this.ultId = null;
    this.ultKey = false;
    this.ultCancelEl.classList.add('hidden');
    this.state.mx = 0;
    this.state.my = 0;
    this.state.sprint = false;
    document.querySelectorAll('.pressed').forEach((el) => el.classList.remove('pressed'));
  }
}
