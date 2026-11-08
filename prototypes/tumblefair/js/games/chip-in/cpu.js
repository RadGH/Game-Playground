// Chip-In CPU: points the stick at the bullseye (now and then a bucket, more often at Tricky), works out how far to
// fly it so the roll ends on the flag (the way a person learns how much a chip runs out), then holds A and lets go when
// the charge looks right. Family's aim and release timing wobble a lot; Tricky's are tight but never perfect.
import { by, noisy, gauss, A } from '../cpu-kit.js';
import { CENTER, BUCKETS, COURSE, carryFor } from './sim.js';
import { rollDistance } from '../golf-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = { plan: null, n: 0 };
  return {
    tick(v) {
      const g = v.g, L = v.init.level; if (!g || !g.b) return null;
      const row = g.b.find(r => r[0] === c.pid), mat = v.init.mats[c.seat] || v.init.mats[0];
      if (!row) return null;
      const [, , , , st, left] = row;
      if (st !== 0 || left <= 0) { mem.plan = null; return { mx: 0, mz: 0, b: 0 }; }
      if (!mem.plan) {
        const bucket = c.rng() < by(sk, [0.05, 0.12, 0.2]);
        const T = bucket ? BUCKETS[Math.floor(c.rng() * 2)] : CENTER, D = Math.hypot(T.x - mat.x, T.z - mat.z);
        let d = D;
        if (!bucket) { let lo = 0, hi = D; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (m + rollDistance(0.6 + m * L.roll, COURSE.roll, COURSE.lin) < D) lo = m; else hi = m; } d = (lo + hi) / 2; }
        d = noisy(d, by(sk, [0.75, 0.6, 0.5]), sk, c.rng);
        const p = Math.max(0.03, Math.min(1, (d - carryFor(0)) / 10));
        const held = p * L.period / 2 + gauss(c.rng) * sk.tapMs / 1000 * by(sk, [0.55, 0.75, 0.85]);   // you watch the ring, so the release is closer than a blind tap
        const yaw = noisy(Math.atan2(T.x - mat.x, T.z - mat.z), 0.09, sk, c.rng);
        mem.plan = { yaw, ticks: Math.max(1, Math.round(held / 0.05)), at: v.t + 0.5 + sk.react * (1 + c.rng()), held: 0 };
      }
      const P = mem.plan, mx = Math.sin(P.yaw) * 0.9, mz = Math.cos(P.yaw) * 0.9;
      if (v.t < P.at) return { mx, mz, b: 0 };
      if (P.held < P.ticks) { P.held++; return { mx, mz, b: A }; }
      return { mx, mz, b: 0 };                          // let go: the chip flies (and the next tick sees it in the air)
    },
  };
}
