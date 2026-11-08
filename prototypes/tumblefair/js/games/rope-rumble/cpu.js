// Rope Rumble CPU: taps PULL once per drum beat, early or late by the skill's timing error, and grades its own tap
// against the drum exactly the way the phone does (PERFECT close to the beat, GOOD otherwise). Family drifts off the
// beat and skips beats now and then; Tricky lands most taps on the beat.
import { gauss, slip, by } from '../cpu-kit.js';
import { RULES } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, count = c.init?.count ?? RULES.count, bps = (c.init?.bpm ?? 110) / 60;
  let target = null, err = 0, lastN = -99, round = -1, form = 1;
  return {
    tick(v) {
      const g = v.g; if (!g || g.ph !== 'pull') { target = null; return; }
      if (g.r !== round) { round = g.r; lastN = -99; form = (0.5 + c.rng() * 1.0) * by(sk, [0.62, 0.9, 1.1]); }   // the drum starts again each pull; some pulls go better than others
      if (target == null || target <= lastN) {
        target = Math.max(lastN + 1, count, Math.ceil(g.bt - 0.3));
        err = gauss(c.rng) * sk.tapMs * form / 1000 * bps + 0.02 * bps;                        // in beats
        if (slip(sk, c.rng, 0.3)) err += 0.5 + c.rng() * 0.4;                          // lost the rhythm for a beat
      }
      if (g.bt < target + err) return;
      const nb = Math.round(g.bt), off = (g.bt - nb) / bps;
      const sent = lastN; lastN = target;
      if (nb < count || nb <= sent) return;
      const q = off >= -RULES.perfect && off <= RULES.perfect + 0.06 ? 2 : 1;
      v.act('pull', { n: nb, q });
      lastN = Math.max(lastN, nb);
    },
  };
}
