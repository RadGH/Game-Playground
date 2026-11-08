// Monster Mash CPU: follows the chart like a dancer listening to the beat: each arrow is tapped off by a person's
// timing error (within 80 ms = perfect, 170 ms = good, worse = a miss) and now and then it presses the wrong button,
// which breaks the combo. Family is loose and slips more (busy sections hurt it most); Tricky is tight.
import { by, gauss } from '../cpu-kit.js';
import { stepSec, WINDOW } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = { n: 0 };
  const sd = by(sk, [0.086, 0.075, 0.064]), wrong = by(sk, [0.05, 0.04, 0.028]);
  return {
    tick(v) {
      const g = v.g, init = v.init; if (!g || g.phase !== 'play' || !init) return;
      if (mem.t0 == null) mem.t0 = v.t;
      const t = v.t - mem.t0, ch = init.chart, ss = stepSec(ch.bpm);
      while (mem.n < ch.steps.length) {
        const n = mem.n, at = ch.steps[n] * ss;
        if (mem.plan == null) {
          const busy = n > 0 && ch.steps[n] - ch.steps[n - 1] === 1 ? 1.3 : 1;
          mem.plan = { e: gauss(c.rng) * sd * busy, bad: c.rng() < wrong * busy };
        }
        const when = at + Math.max(0, mem.plan.e);
        if (t < when) return;
        const e = Math.abs(mem.plan.e);
        if (mem.plan.bad || e > WINDOW.good) { if (mem.plan.bad || c.rng() < 0.5) v.act('stray', n); }
        else v.act('hit', { n, q: e <= WINDOW.perfect ? 0 : 1 });
        mem.n++; mem.plan = null;
      }
    },
  };
}
