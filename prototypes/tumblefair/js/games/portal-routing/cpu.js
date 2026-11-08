// Portal Routing CPU: a racer on its own board. It looks the new board over, works out which way each gate must point
// (the board is on every phone: the same rule the glowing trail uses), then flips the wrong ones one at a time, in
// the marble's order, at a person's pace. Family takes longer to read a board and now and then flips the wrong gate.
import { by, slip, gauss } from '../cpu-kit.js';
import { runBall } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, stages = c.init?.stages || [];
  const form = 0.85 + c.rng() * 0.3;                                      // a good day or a bad day
  const look = by(sk, [2.3, 1.9, 1.6]) * form, flip = by(sk, [1.35, 1.15, 1.0]) * form;
  /** The gate settings that roll the marble home, fewest flips from `now`. */
  function plan(s, now) {
    const n = s.gates.length; let best = null, bd = 99;
    for (let m = 0; m < 1 << n; m++) {
      const st = [...Array(n).keys()].map(i => (m >> i) & 1), d = st.reduce((a, v, i) => a + (v !== now[i]), 0);
      if (d < bd && runBall(s, st) === 'goal') { best = st; bd = d; }
    }
    return best;
  }
  return {
    tick(v) {
      const r = v.g?.r?.[c.pid]; if (!r) return;
      const [si, phase, stStr] = r; if (phase === 'clear' || phase === 'done' || !stages[si]) return;
      const st = [...stStr].map(Number);
      if (mem.si !== si) { mem.si = si; mem.goal = plan(stages[si], st); mem.at = v.t + Math.max(0.5, look + stages[si].gates.length * 0.25 + gauss(c.rng) * 0.4); }
      if (v.t < mem.at || !mem.goal) return;
      mem.at = v.t + Math.max(0.35, flip * (0.7 + c.rng() * 0.6));
      let i = mem.goal.findIndex((ok, k) => st[k] !== ok);
      if (i < 0) return;
      if (slip(sk, c.rng, 0.5)) i = Math.floor(c.rng() * st.length);          // flipped the wrong one (it will flip it back)
      v.act('flip', i);
    },
  };
}
