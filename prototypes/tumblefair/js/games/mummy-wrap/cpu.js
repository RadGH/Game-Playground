// Mummy Wrap CPU: keeps the same spinner a phone keeps, watches each new gap appear and aims its tap for the moment
// the bandage reaches the gap's middle, off by a person's timing error. Family's taps wander more (more GOODs and
// slips, and it waits a lap when a gap comes up too quickly); Tricky lands mostly PERFECTs.
import { by, gauss } from '../cpu-kit.js';
import { createSpinner, angleAt, LEVEL } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  const spread = by(sk, [0.075, 0.06, 0.052]), seeS = by(sk, [0.4, 0.28, 0.2]);
  return {
    tick(v) {
      const g = v.g, init = v.init; if (!g || g.phase !== 'play' || !init) return;
      if (mem.t0 == null) { mem.t0 = v.t; mem.L = LEVEL[init.diff] || LEVEL.normal; mem.S = createSpinner(mem.L, init.offsets); }
      const t = v.t - mem.t0, S = mem.S, L = mem.L;
      if (mem.planFor !== S.k + ':' + S.miss) {                   // a new gap (or a slip): find when the end reaches it
        mem.planFor = S.k + ':' + S.miss;
        const from = Math.max(t + seeS, S.fumble + 0.05);
        let tt = from; const a0 = angleAt(from, L);
        let need = (((S.gap - a0) % 360) + 360) % 360;
        for (let i = 0; i < 400 && need > 0; i++) { const step = 0.005; const a1 = angleAt(tt + step, L); need -= a1 - angleAt(tt, L); tt += step; }
        mem.at = tt + gauss(c.rng) * spread;
      }
      if (t < mem.at || mem.at > init.play) return;
      S.tap(mem.at);
      v.act('tap', { t: Math.round(mem.at * 1000) / 1000 });
    },
  };
}
