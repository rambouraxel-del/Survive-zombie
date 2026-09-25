import { item } from '../data/items';

export interface Stack {
  id: string;
  qty: number;
  dur?: number; // durabilité restante (objets à pile unique)
}

export type Slots = (Stack | null)[];

export function makeSlots(n: number): Slots {
  return Array.from({ length: n }, () => null);
}

export function cloneSlots(s: Slots): Slots {
  return s.map((x) => (x ? { ...x } : null));
}

export function newStack(id: string, qty: number, dur?: number): Stack {
  const d = item(id);
  const st: Stack = { id, qty };
  if (d.durability !== undefined) st.dur = dur ?? d.durability;
  return st;
}

export function countItem(slots: Slots, id: string): number {
  let n = 0;
  for (const s of slots) if (s && s.id === id) n += s.qty;
  return n;
}

/** Quantité de `id` qui peut encore entrer dans les emplacements. */
export function spaceFor(slots: Slots, id: string): number {
  const max = item(id).stack;
  let room = 0;
  for (const s of slots) {
    if (!s) room += max;
    else if (s.id === id && max > 1) room += max - s.qty;
  }
  return room;
}

/** Ajoute et renvoie la quantité qui n'a PAS pu être ajoutée. */
export function addItem(slots: Slots, id: string, qty: number, dur?: number): number {
  const max = item(id).stack;
  let left = qty;
  if (max > 1) {
    for (const s of slots) {
      if (left <= 0) break;
      if (s && s.id === id && s.qty < max) {
        const n = Math.min(max - s.qty, left);
        s.qty += n;
        left -= n;
      }
    }
  }
  for (let i = 0; i < slots.length && left > 0; i++) {
    if (!slots[i]) {
      const n = Math.min(max, left);
      slots[i] = newStack(id, n, dur);
      left -= n;
    }
  }
  return left;
}

/** Ajoute une pile existante (conserve la durabilité). Renvoie le reste. */
export function addStack(slots: Slots, st: Stack): number {
  return addItem(slots, st.id, st.qty, st.dur);
}

/** Retire `qty` d'un objet seulement si la quantité totale est disponible. */
export function removeItem(slots: Slots, id: string, qty: number): boolean {
  if (countItem(slots, id) < qty) return false;
  let left = qty;
  // on consomme d'abord les piles les plus petites
  const idx = slots
    .map((s, i) => [s, i] as const)
    .filter(([s]) => s && s.id === id)
    .sort((a, b) => a[0]!.qty - b[0]!.qty);
  for (const [s, i] of idx) {
    if (left <= 0) break;
    const n = Math.min(s!.qty, left);
    s!.qty -= n;
    left -= n;
    if (s!.qty <= 0) slots[i] = null;
  }
  return true;
}

export function hasAll(slots: Slots, cost: Record<string, number>): boolean {
  return Object.entries(cost).every(([id, n]) => countItem(slots, id) >= n);
}

/** Retire tout un coût de façon atomique. */
export function removeAll(slots: Slots, cost: Record<string, number>): boolean {
  if (!hasAll(slots, cost)) return false;
  for (const [id, n] of Object.entries(cost)) removeItem(slots, id, n);
  return true;
}

/** Échange / fusionne deux emplacements d'un même conteneur ou de deux conteneurs. */
export function moveBetween(a: Slots, ai: number, b: Slots, bi: number): void {
  const sa = a[ai];
  const sb = b[bi];
  if (!sa) return;
  if (sb && sb.id === sa.id && item(sa.id).stack > 1) {
    const max = item(sa.id).stack;
    const n = Math.min(max - sb.qty, sa.qty);
    sb.qty += n;
    sa.qty -= n;
    if (sa.qty <= 0) a[ai] = null;
    return;
  }
  a[ai] = sb;
  b[bi] = sa;
}

/** Transfert rapide d'une pile vers un autre conteneur. Renvoie la quantité déplacée. */
export function quickTransfer(from: Slots, fi: number, to: Slots): number {
  const st = from[fi];
  if (!st) return 0;
  const before = st.qty;
  const left = addStack(to, st);
  if (left <= 0) from[fi] = null;
  else st.qty = left;
  return before - left;
}

export function isEmpty(slots: Slots): boolean {
  return slots.every((s) => !s);
}

export function totalItems(slots: Slots): number {
  return slots.reduce((n, s) => n + (s ? s.qty : 0), 0);
}
