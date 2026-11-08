// Merry-Go-Guess CPU: watches the ride turn (its speed, and whether it is speeding up or slowing down, are what every
// phone shows) and counts in its head — which is where a person goes wrong: its guess is the true moment off by a
// share of the wait (about 18% at Family, 9% at Normal, 5% at Tricky; a speeding-up or slowing-down ride is harder),
// plus its finger's own timing. Family sometimes counts a lap too few on the two-lap rounds.
import { by, gauss, slip, skillOf } from '../cpu-kit.js';
import { answerOf } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.phase !== 'dark') { if (g.phase === 'show') mem.r = null; return; }
      if (mem.r !== g.round) {
        mem.r = g.round; mem.d0 = v.t; mem.done = false;
        let ans = answerOf({ ps: g.ps, w: g.w, a: g.a, laps: g.laps });
        if (g.laps > 1 && slip(sk, c.rng, 0.35)) ans = answerOf({ ps: g.ps, w: g.w, a: g.a, laps: g.laps - 1 });
        const share = by(sk, [0.18, 0.09, 0.05]) * (g.a ? 1.5 : 1);
        mem.at = Math.max(0.3, ans * (1 + gauss(c.rng) * share) + gauss(c.rng) * skillOf(sk).tapMs / 1000);
      }
      if (mem.done || v.t - mem.d0 < mem.at) return;
      mem.done = true;
      v.act('ring', { r: g.round, ms: Math.round((v.t - mem.d0) * 1000) });
    },
  };
}
