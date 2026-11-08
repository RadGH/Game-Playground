// Pumpkin Fling CPU: picks a landing spot it can see is worth it (the scarecrow's bucket when that beats a long safe
// fling, else a little short of the wall — further short the shakier it is), works out the power and angle like a
// careful player, then stops both meters off by a person's timing error. Family stops them sloppily and rarely
// bothers with the bucket; Tricky is close on both taps and plays the wall tighter.
import { by, gauss } from '../cpu-kit.js';
import { bestFor } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  const cushion = by(sk, [17, 11, 7]), buckety = by(sk, [0.35, 0.75, 0.9]);
  return {
    tick(v) {
      const g = v.g, init = v.init; if (!g?.go || !init || g.busy?.[c.pid] || (g.n?.[c.pid] ?? 3) >= init.flings) return;
      const k = g.n[c.pid];
      if (mem.k !== k) { mem.k = k; mem.at = v.t + sk.react + (init.level.power * 0.5 + init.level.arm * 0.5) * (0.8 + c.rng() * 0.5); }
      if (v.t < mem.at) return;
      const w = init.winds[k], bucket = init.buckets[k], best = g.sc?.[c.pid] || 0;
      const safe = init.wall - cushion;
      let target = safe;
      if (bucket + init.bonus > Math.max(safe, best) && c.rng() < buckety) target = bucket;
      if (best >= safe && k === init.flings - 1 && bucket + init.bonus > best) target = bucket;   // nothing to lose on the last one
      const aim = bestFor(target, w), ms = sk.tapMs / 1000;
      const p = Math.max(0, Math.min(1, aim.p + gauss(c.rng) * ms * (2 / init.level.power) * 0.45));
      const a = Math.max(init.arm[0], Math.min(init.arm[1], aim.a + gauss(c.rng) * ms * 55 * 0.45));
      v.act('fling', { p: Math.round(p * 100) / 100, a: Math.round(a * 10) / 10 });
      mem.at = Infinity;
    },
  };
}
