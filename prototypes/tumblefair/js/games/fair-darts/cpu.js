// Fair Darts CPU: watches its own aim ring (the path is on the phone), picks the calm moment it can see coming in the
// next second or two, and taps THROW then — off by a human timing error (Family ~0.24 s, Tricky ~0.09 s) — sending the
// moment it really let go. A short breather between darts; it always throws all nine before the clock runs out.
import { gauss, by } from '../cpu-kit.js';
import { bestTime, PLAY_S, COOL_S } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = { start: null, plan: null, k: -1, last: -9 };
  const err = by(sk, [0.24, 0.13, 0.09]), look = by(sk, [1.4, 1.9, 2.1]);
  return {
    tick(v) {
      const g = v.g, I = v.init; if (!g || !I || g.phase !== 'play') return;
      if (mem.start == null) mem.start = v.t;
      const el = v.t - mem.start, n = g.n?.[c.pid] ?? 0, path = I.paths?.[I.order.indexOf(c.pid)]?.[n];
      if (!path || n >= I.darts) return;
      if (mem.plan === Infinity && el - mem.last > 1) mem.k = -1;   // that throw was lost: plan this dart again
      if (mem.k !== n) {                                           // a new dart: wait for the next calm moment I can see
        mem.k = n;
        const from = Math.max(el, mem.last + COOL_S) + 0.4 + c.rng() * 0.3, rush = PLAY_S - el < (I.darts - n) * 1.1 + 1;
        const to = rush ? from + 0.4 : from + look;
        mem.plan = Math.min(PLAY_S - 0.6, Math.max(from - 0.3, bestTime(path, from, to) + gauss(c.rng) * err));
      }
      if (el >= mem.plan) { mem.last = el; mem.plan = Infinity; v.act('throw', { t: Math.round(el * 1000) / 1000 }); }
    },
  };
}
