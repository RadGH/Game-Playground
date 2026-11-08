// Paint Panic CPU: keeps its own copy of the floor from the painted-tile updates and walks to the patch with the most
// tiles that are not its colour, grabbing a paint bomb when one is close. Family looks at fewer patches and drifts
// toward them sloppily; Tricky weighs more spots, prefers rivals' tiles and goes further for a bomb.
import { thinker, stickTo, nearest, by, noisy, slip } from '../cpu-kit.js';
import { GRID } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, think = thinker(c), mem = {};
  const grid = Int8Array.from(c.init?.grid || new Array(GRID.w * GRID.h).fill(-1)), mine = c.seat;
  const owner = (x, z) => { const cx = Math.floor(x + GRID.w / 2), cz = Math.floor(z + GRID.h / 2); return cx < 0 || cz < 0 || cx >= GRID.w || cz >= GRID.h ? null : grid[cz * GRID.w + cx]; };
  function patchScore(x, z) {
    let s = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const o = owner(x + dx, z + dz); if (o == null || o === mine) continue; s += o < 0 ? 1 : by(sk, [1, 1.2, 1.5]); }
    return s;
  }
  return {
    tick(v) {
      const g = v.g, me = v.me;
      if (g && g !== mem.g) { mem.g = g; const d = g.d || []; for (let i = 0; i + 1 < d.length; i += 2) grid[d[i]] = d[i + 1]; }
      if (!me || !g) return null;
      return think(v, () => {
        const bomb = nearest(me, (g.bombs || []).map(b => ({ x: b[1], z: b[2] })));
        if (bomb.item && bomb.d < by(sk, [3, 5, 8])) return stickTo(me, bomb.item.x, bomb.item.z, sk, { arrive: 0 });
        if (!mem.to || v.t > mem.until || patchScore(mem.to.x, mem.to.z) < 3 || slip(sk, c.rng, 0.3)) {
          let best = null, bs = -Infinity;
          for (let i = 0; i < by(sk, [5, 10, 18]); i++) {
            const x = (c.rng() * 2 - 1) * 8, z = (c.rng() * 2 - 1) * 6;
            const s = patchScore(x, z) - Math.hypot(x - me.x, z - me.z) * 0.35;
            if (s > bs) { bs = s; best = { x, z }; }
          }
          mem.to = { x: noisy(best.x, 1.2, sk, c.rng), z: noisy(best.z, 1.2, sk, c.rng) }; mem.until = v.t + 2.5;
        }
        return stickTo(me, mem.to.x, mem.to.z, sk, { arrive: 0 });
      });
    },
  };
}
