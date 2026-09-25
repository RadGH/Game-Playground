// Loose-cell physics (falling sand). Dust, Rubble and Slag fall straight down, else slide
// diagonally, so they pile into slopes. Only awake chunks are stepped; a chunk with no movement
// goes back to sleep. Slag cools into Rubble.

import { M, S } from './materials.js';
import { CHUNK } from './world.js';

export function stepLoose(world, tickNo) {
  const W = world.w, H = world.h, mat = world.mat, st = world.mats.state;
  const moved = world.moved;
  const stamp = (tickNo % 65000) + 1; // unique per tick (for 65000 ticks), so no clearing needed
  const leftFirst = (tickNo & 1) === 0;
  let movedAny = 0;

  // Walk chunk rows bottom-up so a column of sand falls together in one tick.
  for (let cy = world.ch - 1; cy >= 0; cy--) {
    for (let cxi = 0; cxi < world.cw; cxi++) {
      const cx = leftFirst ? cxi : world.cw - 1 - cxi;
      const ci = cy * world.cw + cx;
      if (!world.awake[ci]) continue;
      const x0 = cx * CHUNK, y0 = cy * CHUNK;
      const x1 = Math.min(W, x0 + CHUNK), y1 = Math.min(H, y0 + CHUNK);
      let chunkMoved = false;
      for (let y = y1 - 1; y >= y0; y--) {
        const row = y * W;
        for (let k = 0; k < x1 - x0; k++) {
          const x = leftFirst ? x0 + k : x1 - 1 - k;
          const i = row + x;
          const m = mat[i];
          if (st[m] !== S.LOOSE) continue;
          // Slag cools.
          if (m === M.SLAG) {
            const heat = world.aux[i] + 1;
            if (heat >= 180) { mat[i] = M.RUBBLE; world.hp[i] = world.mats.hp[M.RUBBLE]; world.aux[i] = 0; world.touch(x, y); chunkMoved = true; continue; }
            world.aux[i] = heat;
            if ((heat & 15) === 0) world.touchGfx(x, y);
            chunkMoved = true; // keep hot chunks awake so they finish cooling
          }
          if (moved[i] === stamp) continue;
          if (y >= H - 1) continue;
          const below = i + W;
          if (mat[below] === M.EMPTY) { swap(world, i, below, x, y, x, y + 1, stamp); chunkMoved = true; continue; }
          // Diagonal slide; random-ish order by parity for natural piles.
          const dir = ((x + y + tickNo) & 1) ? 1 : -1;
          const a = x + dir, b = x - dir;
          if (a >= 0 && a < W && mat[below + dir] === M.EMPTY && mat[i + dir] === M.EMPTY) {
            swap(world, i, below + dir, x, y, a, y + 1, stamp); chunkMoved = true; continue;
          }
          if (b >= 0 && b < W && mat[below - dir] === M.EMPTY && mat[i - dir] === M.EMPTY) {
            swap(world, i, below - dir, x, y, b, y + 1, stamp); chunkMoved = true; continue;
          }
        }
      }
      if (chunkMoved) { world.awakeNext[ci] = 1; movedAny++; }
    }
  }
  world.swapAwake();
  return movedAny;
}

function swap(world, i, j, x, y, x2, y2, stamp) {
  const mat = world.mat, hp = world.hp, team = world.team, aux = world.aux;
  const m = mat[i]; mat[i] = mat[j]; mat[j] = m;
  const h = hp[i]; hp[i] = hp[j]; hp[j] = h;
  const t = team[i]; team[i] = team[j]; team[j] = t;
  const a = aux[i]; aux[i] = aux[j]; aux[j] = a;
  world.moved[j] = stamp;
  world.touch(x, y);
  world.touch(x2, y2);
  // Sand leaving a spot can un-support a wall resting on it.
  if (y > 0) {
    const up = mat[i - world.w];
    const st = world.mats.state[up];
    if (st === S.STRUCTURAL || st === S.STICKY) world.supportQueue.push(i - world.w);
  }
}
