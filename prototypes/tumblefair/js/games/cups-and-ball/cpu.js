// Shell Shuffle CPU: follows the ball's cup through the shuffle it watched, move by move — every swap the ball is in
// is a chance to lose it (more so the quicker the swap), and a fake-out can fool it into thinking a swap happened.
// Once lost it follows a wrong cup. Then it taps after a moment's thought (a quick tap earns a bonus). Family loses
// the ball often and taps slowly; Tricky rarely loses it.
import { by, later, readDelay, slip } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  function follow(g) {
    let s = g.st;
    for (const m of g.mv || []) {
      const [, d, k, a, b] = m, pairs = [[a, b]]; if (m.length > 5) pairs.push([m[5], m[6]]);
      for (const [p, q] of pairs) {
        if (s !== p && s !== q) continue;
        if (k === 0) {
          if (c.rng() < by(sk, [0.13, 0.065, 0.03]) * (0.6 / Math.max(0.25, d))) { s = s === p ? q : p; s = Math.floor(c.rng() * g.n); }   // lost it
          else s = s === p ? q : p;
        } else if (k !== 3 && slip(sk, c.rng, 0.35)) s = s === p ? q : p;            // fell for a fake
        break;
      }
    }
    return s;
  }
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.ph === 'shuffle' && mem.r !== g.r) { mem.r = g.r; mem.guess = follow(g); }
      if (g.ph !== 'guess' || v.priv?.pick != null) return;
      later(mem, v, 'pick' + g.r, () => v.act('pick', { i: mem.r === g.r ? mem.guess : Math.floor(c.rng() * g.n), r: g.r }), readDelay(sk, c.rng, by(sk, [0.6, 0.35, 0.2])));
    },
  };
}
