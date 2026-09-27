// Mesures de performance par image (ms), consultables dans le mode debug
// et par les tests (window.__perf). Coût négligeable : quelques performance.now().

export type PerfKey = 'sim' | 'scene' | 'render' | 'ui' | 'frame';

const KEYS: PerfKey[] = ['sim', 'scene', 'render', 'ui', 'frame'];
const N = 240; // ~4 s à 60 i/s

class PerfStats {
  private buf: Record<PerfKey, Float32Array> = Object.fromEntries(KEYS.map((k) => [k, new Float32Array(N)])) as Record<PerfKey, Float32Array>;
  private i = 0;
  private n = 0;
  private cur: Record<PerfKey, number> = { sim: 0, scene: 0, render: 0, ui: 0, frame: 0 };
  steps = 0;
  domWrites = 0;

  add(k: PerfKey, ms: number): void {
    this.cur[k] += ms;
  }

  /** Clôt l'image courante. */
  commit(): void {
    for (const k of KEYS) {
      this.buf[k][this.i] = this.cur[k];
      this.cur[k] = 0;
    }
    this.i = (this.i + 1) % N;
    this.n = Math.min(N, this.n + 1);
  }

  reset(): void {
    this.i = 0;
    this.n = 0;
    this.steps = 0;
    this.domWrites = 0;
  }

  /** Moyenne et 95e centile de chaque mesure sur la fenêtre glissante. */
  summary(): Record<PerfKey, { avg: number; p95: number }> & { frames: number; steps: number; domWrites: number } {
    const out = { frames: this.n, steps: this.steps, domWrites: this.domWrites } as Record<PerfKey, { avg: number; p95: number }> & { frames: number; steps: number; domWrites: number };
    for (const k of KEYS) {
      const arr = Array.from(this.buf[k].slice(0, this.n)).sort((a, b) => a - b);
      const avg = arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
      out[k] = { avg: Math.round(avg * 100) / 100, p95: Math.round((arr[Math.floor(arr.length * 0.95)] ?? 0) * 100) / 100 };
    }
    return out;
  }
}

export const perf = new PerfStats();
