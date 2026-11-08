// Wobble Tower CPU: watches the swing and presses DROP when it expects the block to pass over the middle of its tower,
// sending the phase it saw at the moment it pressed (like a phone). Its press lands early or late by the skill's
// timing error, so Family leans and slices a lot; Tricky lands near the middle and waits for the next pass when the
// tower is already wobbly.
import { by, tapTime, readDelay } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill;
  let plan = null;
  return {
    tick(v) {
      const row = v.g?.p?.[c.pid]; if (!row) return;
      const [, wob, swing, bid, ph, w] = row;
      if (!swing) { plan = null; return; }
      if (!plan || plan.bid !== bid) {
        // the first pass over the middle (sin(ph) = 0) that is far enough ahead to react to
        const wait = readDelay(sk, c.rng, by(sk, [0.5, 0.25, 0.15]));
        let target = Math.ceil((ph + w * wait) / Math.PI) * Math.PI;
        if (wob > 0.6 && c.rng() < sk.q) target += Math.PI;                        // steady yourself: take your time
        plan = { bid, at: v.t + tapTime((target - ph) / w, sk, c.rng, 0.001) };
      }
      if (plan.at != null && v.t >= plan.at) { plan.at = null; v.act('drop', [bid, ph]); }
    },
  };
}
