// Entrées tactiles (multitouch) et clavier. Chaque commande suit son propre
// identifiant de pointeur : marcher, attaquer et interagir ne se neutralisent pas.
import type { InputState } from '../sim/types';

export interface ControlCallbacks {
  onQuickSlot: (i: number) => void;
  onShortcut: (name: 'inventory' | 'craft' | 'build' | 'map' | 'pause') => void;
  isBlocked: () => boolean; // un menu est ouvert : la simulation est en pause
}

const JOY_RADIUS = 56;

export class Controls {
  state: InputState = { mx: 0, my: 0, sprint: false, attack: false, interact: false, dodge: false };
  private keys = new Set<string>();
  private joyId: number | null = null;
  private joyOx = 0;
  private joyOy = 0;
  private joyVx = 0;
  private joyVy = 0;
  private attackId: number | null = null;
  private interactId: number | null = null;
  private joyBase: HTMLElement;
  private joyKnob: HTMLElement;
  private cb: ControlCallbacks;
  touchUsed = false;

  constructor(root: HTMLElement, cb: ControlCallbacks) {
    this.cb = cb;
    const zone = root.querySelector<HTMLElement>('#joy-zone')!;
    this.joyBase = root.querySelector<HTMLElement>('#joy-base')!;
    this.joyKnob = root.querySelector<HTMLElement>('#joy-knob')!;

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

    this.holdButton(root.querySelector('#btn-attack')!, (v) => (this.state.attack = v), 'attack');
    this.holdButton(root.querySelector('#btn-action')!, (v) => (this.state.interact = v), 'interact');
    const dodge = root.querySelector<HTMLElement>('#btn-dodge')!;
    dodge.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.touchUsed = true;
      this.state.dodge = true;
      dodge.classList.add('pressed');
    });
    const up = () => dodge.classList.remove('pressed');
    dodge.addEventListener('pointerup', up);
    dodge.addEventListener('pointercancel', up);
    dodge.addEventListener('pointerleave', up);

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    // relâchement fiable
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => this.reset());
    window.addEventListener('orientationchange', () => this.reset());
    window.addEventListener('pagehide', () => this.reset());
    window.addEventListener('resize', () => this.releaseJoy());
  }

  private holdButton(el: HTMLElement, set: (v: boolean) => void, which: 'attack' | 'interact'): void {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.touchUsed = true;
      if (which === 'attack') this.attackId = e.pointerId;
      else this.interactId = e.pointerId;
      el.setPointerCapture(e.pointerId);
      el.classList.add('pressed');
      set(true);
    });
    const end = (e: PointerEvent) => {
      const id = which === 'attack' ? this.attackId : this.interactId;
      if (e.pointerId !== id) return;
      if (which === 'attack') this.attackId = null;
      else this.interactId = null;
      el.classList.remove('pressed');
      set(false);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private updateJoy(x: number, y: number): void {
    let dx = x - this.joyOx;
    let dy = y - this.joyOy;
    const d = Math.hypot(dx, dy);
    if (d > JOY_RADIUS) {
      dx = (dx / d) * JOY_RADIUS;
      dy = (dy / d) * JOY_RADIUS;
    }
    this.joyVx = dx / JOY_RADIUS;
    this.joyVy = dy / JOY_RADIUS;
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
    const gameKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyJ', 'KeyK', 'KeyE', 'KeyF', 'KeyX', 'Enter', 'Tab'];
    if (gameKeys.includes(c)) e.preventDefault();
    if (down) this.keys.add(c);
    else this.keys.delete(c);
    if (!down || e.repeat) return;
    if (c === 'Escape') this.cb.onShortcut('pause');
    if (this.cb.isBlocked()) return;
    if (c === 'KeyK' || c === 'KeyX') this.state.dodge = true;
    if (c.startsWith('Digit')) {
      const n = Number(c.slice(5));
      if (n >= 1 && n <= 5) this.cb.onQuickSlot(n - 1);
    }
    if (c === 'KeyI' || c === 'Tab') this.cb.onShortcut('inventory');
    if (c === 'KeyC') this.cb.onShortcut('craft');
    if (c === 'KeyB') this.cb.onShortcut('build');
    if (c === 'KeyM') this.cb.onShortcut('map');
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
    this.state.dodge = false;
    this.state.mx = 0;
    this.state.my = 0;
    this.state.sprint = false;
    document.querySelectorAll('.pressed').forEach((el) => el.classList.remove('pressed'));
  }
}
