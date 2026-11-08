// Hoop Frenzy CPU: holds the meter for as long as its mark needs and lets go near the green band, off by a person's
// timing error. Once the hoops slide, Normal and Tricky wait for the hoop to slow at the end of its slide before
// letting go; Family shoots whenever and lets go further from the green.
import { by, gauss } from '../cpu-kit.js';
import { SPOTS, LEVELS, PLAY, slideAt } from './sim.js';
import { idealPower, tolFor } from '../hoops-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = { next: 0 };
  const err = by(sk, [1.0, 0.78, 0.6]), prep = by(sk, [0.75, 0.45, 0.3]), waitSlide = by(sk, [0, 0.6, 0.9]);
  return {
    tick(v) {
      const g = v.g, init = v.init; if (!g?.go || !init) return;
      if (mem.t0 == null) { mem.t0 = v.t; mem.next = v.t + prep; }
      const row = g.st?.[c.pid]; if (!row || row[2] || v.t < mem.next) return;
      const L = init.level || LEVELS.normal, ht = v.t - mem.t0, i = init.lanes?.[c.pid] ?? 0;
      const moving = Math.abs(slideAt(L, ht + 0.05, i) - slideAt(L, ht, i)) / 0.05;
      if (moving > 0.35 && c.rng() < waitSlide && !(mem.waited > 1.5)) { mem.waited = (mem.waited || 0) + v.dt; return; }
      mem.waited = 0;
      const d = SPOTS[row[0] % SPOTS.length], p = Math.max(0, Math.min(1, idealPower(d) + gauss(c.rng) * err * tolFor(d, L.tol) * 0.6));
      v.act('shoot', { p: Math.round(p * 1000) / 1000, ht: Math.min(PLAY, ht) });
      mem.next = v.t + 0.85 + prep * (0.7 + c.rng() * 0.6) + p * L.period / 2;
    },
  };
}
