// Icônes DOM découpées dans les atlas téléchargés (aucune icône dessinée ni emoji).
interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

const atlases: Record<string, { url: string; w: number; h: number; frames: Record<string, Frame> }> = {};

export async function loadIconAtlases(): Promise<void> {
  for (const name of ['world', 'items', 'props']) {
    const res = await fetch(`assets/atlas/${name}.json`);
    const json = await res.json();
    const frames: Record<string, Frame> = {};
    for (const [k, v] of Object.entries<{ frame: Frame }>(json.frames)) frames[k] = v.frame;
    atlases[name] = { url: `assets/atlas/${name}.png`, w: json.meta.size.w, h: json.meta.size.h, frames };
  }
}

export function frameSize(key: string): { w: number; h: number } {
  const [a, f] = key.split(':');
  const fr = atlases[a]?.frames[f];
  return fr ? { w: fr.w, h: fr.h } : { w: 16, h: 16 };
}

/** Crée une icône qui tient dans une boîte `box` px (agrandissement entier si possible). */
export function icon(key: string, box = 32, cls = 'ico'): HTMLElement {
  const el = document.createElement('span');
  el.className = cls;
  setIcon(el, key, box);
  return el;
}

export function setIcon(el: HTMLElement, key: string, box = 32): void {
  const [a, f] = key.split(':');
  const at = atlases[a];
  const fr = at?.frames[f];
  if (!at || !fr) {
    el.style.backgroundImage = 'none';
    return;
  }
  const m = Math.max(fr.w, fr.h);
  let s = box / m;
  if (s >= 1) s = Math.floor(s);
  el.style.width = `${Math.round(fr.w * s)}px`;
  el.style.height = `${Math.round(fr.h * s)}px`;
  el.style.backgroundImage = `url(${at.url})`;
  el.style.backgroundSize = `${at.w * s}px ${at.h * s}px`;
  el.style.backgroundPosition = `${-fr.x * s}px ${-fr.y * s}px`;
  el.dataset.icon = key;
}
