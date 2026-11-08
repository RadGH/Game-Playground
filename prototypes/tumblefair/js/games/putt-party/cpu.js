// Putt Party CPU: when its ball is ready it eyes the hole (tries a handful of lines and strengths on the public course,
// the way a person pictures a putt), then points the stick and holds A until the power meter reads what it wants.
// Family tries few lines and its aim and release are shaky; Tricky reads more lines and lets go close to the mark.
import { A, by, gauss, readDelay } from '../cpu-kit.js';
import { simulatePutt, puttSpeed, powerFor } from '../golf-kit.js';

export function createCpu(c) { return createPuttCpu(c); }

/** Shared by golf games built on golf-putt.js (same state rows: [pid, x, z, st, strokes, power]). */
export function createPuttCpu(c) {
  const sk = c.skill, holes = c.init?.holes || [], L = c.init?.level || { cupR: 0.22, cap: 2.25, period: 1.8, max: 9.5 };
  let plan = null, key = null;
  function makePlan(g, row) {
    const H = holes[g.h]; if (!H) return null;
    const course = { ...H.course, cup: { x: H.cup.x, z: H.cup.z, r: L.cupR, cap: L.cap } };
    const bx = row[1], bz = row[2], direct = Math.atan2(H.cup.x - bx, H.cup.z - bz), d = Math.hypot(H.cup.x - bx, H.cup.z - bz);
    let best = null;
    const tries = by(sk, [6, 16, 30]);
    for (let i = 0; i < tries; i++) {
      const yaw = i === 0 ? direct : direct + (c.rng() * 2 - 1) * (i < tries / 2 ? 0.35 : 1.6);
      const p = Math.min(1, Math.max(0.03, powerFor(d * (0.9 + c.rng() * 0.9), L.max)));
      const r = simulatePutt(course, bx, bz, yaw, puttSpeed(p, L.max), g.t + 1);
      const score = r.in ? -1 : Math.hypot(r.x - H.cup.x, r.z - H.cup.z);
      if (!best || score < best.score) best = { yaw, p, score };
    }
    const yaw = best.yaw + gauss(c.rng) * by(sk, [0.12, 0.06, 0.035]);
    const p = Math.min(1, Math.max(0.03, best.p * (1 + gauss(c.rng) * by(sk, [0.16, 0.08, 0.05]))));
    return { yaw, hold: p * L.period / 2, at: null, held: 0 };
  }
  return {
    tick(v) {
      const g = v.g; if (!g || g.ph !== 'play') { plan = null; return null; }
      const row = (g.b || []).find(r => r[0] === c.pid);
      if (!row || row[3] !== 0) { plan = null; return null; }
      const k = g.h + ':' + row[4];
      if (k !== key) { key = k; plan = makePlan(g, row); if (plan) plan.at = v.t + readDelay(sk, c.rng, 0.6); }
      if (!plan || v.t < plan.at) return null;
      const mx = Math.sin(plan.yaw), mz = Math.cos(plan.yaw);
      if (plan.held < plan.hold - 0.025) { plan.held += v.dt; return { mx, mz, b: A }; }
      return { mx, mz, b: 0 };                                        // let go: the putt goes
    },
  };
}
