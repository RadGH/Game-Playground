// Quick Draw CPU: waits for the bell and taps after a human reaction time (Family about 0.37 s, Normal 0.32 s, Tricky
// 0.29 s, each with a spread), reporting how long it really waited; now and then a fake-out fools it into a false start.
import { by, gauss } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.phase === 'wait' && g.fake && mem.fake !== g.round + ':' + g.fake.i) {
        mem.fake = g.round + ':' + g.fake.i;
        if (c.rng() < by(sk, [0.16, 0.08, 0.04])) mem.jumpAt = { r: g.round, at: v.t + 0.25 + c.rng() * 0.2 };   // fooled
      }
      if (mem.jumpAt && mem.jumpAt.r === g.round && g.phase === 'wait' && v.t >= mem.jumpAt.at) { mem.jumpAt = null; v.act('tap', { r: g.round, early: true }); return; }
      if (g.phase !== 'bell' || mem.done === g.round) return;
      if (mem.seen?.r !== g.round) mem.seen = { r: g.round, t: v.t, rt: Math.max(170, by(sk, [370, 320, 285]) + gauss(c.rng) * by(sk, [95, 80, 70])) };
      const waited = (v.t - mem.seen.t) * 1000;
      if (waited >= mem.seen.rt) { mem.done = g.round; v.act('tap', { r: g.round, rt: Math.round(waited) }); }
    },
  };
}
