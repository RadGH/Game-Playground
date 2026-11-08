// Present Peek CPU: watches the present unwrap (the picture everyone sees) and answers once enough paper is gone for it
// to recognise the toy — Family needs most of it torn off, Tricky only a couple of strips — then reads the four tags.
// Sometimes it is wrong anyway (Family more often), which locks it out of that present like anyone else.
import { by, readDelay } from '../cpu-kit.js';
import { picOf } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, salt = c.init?.salt ?? 0;
  const strips = by(sk, [[4, 7], [3, 5], [2, 5]]), right = by(sk, [0.7, 0.82, 0.88]);
  return {
    tick(v) {
      const g = v.g; if (!g || g.phase !== 'peek' || g.k == null || !g.opts) return;
      if (mem.r !== g.r) { mem.r = g.r; mem.need = strips[0] + Math.floor(c.rng() * (strips[1] - strips[0] + 1)); mem.at = null; mem.done = false; }
      if (mem.done || (g.off ?? 0) < mem.need) return;
      mem.at ??= v.t + readDelay(sk, c.rng, 0.5);         // it has recognised the toy: now find the right tag
      if (v.t < mem.at) return;
      mem.done = true;
      const a = g.opts.indexOf(picOf(g.k, g.r, salt));
      v.act('pick', c.rng() < right || a < 0 ? Math.max(0, a) : (a + 1 + Math.floor(c.rng() * 3)) % 4);
    },
  };
}
