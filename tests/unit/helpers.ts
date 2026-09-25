import { Game } from '../../src/sim/game';
import type { InputState } from '../../src/sim/types';
import { TILE } from '../../src/config/balance';

export function idle(): InputState {
  return { mx: 0, my: 0, sprint: false, attack: false, interact: false, dodge: false };
}

export function run(g: Game, seconds: number, input: InputState = idle()): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) g.step(dt, input);
}

/** Téléporte le joueur sur une tuile libre proche de (tx, ty). */
export function teleport(g: Game, tx: number, ty: number): void {
  for (let r = 0; r < 8; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = tx + dx;
        const y = ty + dy;
        if (g.world.passableForPlayer(x, y) && !g.world.objectAtTile(x, y)) {
          g.player.x = (x + 0.5) * TILE;
          g.player.y = (y + 0.5) * TILE;
          return;
        }
      }
}

export function freshGame(seed = 12345): Game {
  const g = Game.newGame(seed);
  return g;
}
