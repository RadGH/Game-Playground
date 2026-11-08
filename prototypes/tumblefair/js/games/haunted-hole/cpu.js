// Haunted Hole CPU: a golfer that pictures a handful of putts before it plays (on the public course, with the ghost's
// drift, the pumpkin's grin and the coffin lid as everyone sees them), then points the stick and holds A until the power
// meter reads what it wants. Family pictures few putts and often forgets the ghost and the lid, and its aim and release
// are shaky; Tricky pictures more (the grin shortcut among them) and lets go close to the mark.
import { A, by, gauss, readDelay } from '../cpu-kit.js';
import { makeBall, stepBalls, puttSpeed, powerFor, speedOf, BALL_R } from '../golf-kit.js';
import { ghostAt, GHOST_R, GHOST_PUFF } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, holes = c.init?.holes || [], L = c.init?.level || { cupR: 0.22, cap: 2.25, period: 1.8, max: 9.5 };
  const lid = c.init?.lid || [2.1, 1.6], lidOpen = t => (t % (lid[0] + lid[1])) < lid[0];
  let plan = null, key = null;
  /** One putt played out in my head: the real ball rules plus the hole's hazards (if I am minding them). */
  function picture(H, x, z, yaw, speed, t0, mind) {
    const cup = { x: H.cup.x, z: H.cup.z, r: L.cupR, cap: L.cap }, course = { ...H.course, cup, dyn: [] };
    const b = makeBall(x, z); b.still = false; b.vx = Math.sin(yaw) * speed; b.vz = Math.cos(yaw) * speed;
    let t = t0, puffed = 0;
    for (let k = 0; k < 240 && !b.still && !b.in; k++) {
      if (mind && H.ghost && puffed <= 0) {
        const g = ghostAt(H.ghost, t), dx = b.x - g.x, dz = b.z - g.z, d = Math.hypot(dx, dz);
        if (d < GHOST_R + BALL_R && d > 1e-6) { b.vx += dx / d * GHOST_PUFF; b.vz += dz / d * GHOST_PUFF; puffed = 0.8; }
      }
      puffed -= 0.05;
      if (H.tunnel) { const T = H.tunnel; if (Math.hypot(b.x - T.x, b.z - T.z) <= T.r && b.vz <= 0) { const sp = Math.min(6, Math.max(2.2, speedOf(b))); b.x = T.ox; b.z = T.oz; b.vx = Math.sin(T.yaw) * sp; b.vz = Math.cos(T.yaw) * sp; } }
      if (H.coffin && mind) { const open = lidOpen(t); course.cup = open ? cup : null; course.dyn = open ? [] : [{ x: H.cup.x, z: H.cup.z, r: 0.5, e: 0.9 }]; }
      stepBalls([b], course, t, 0.05); t += 0.05;
    }
    return { x: b.x, z: b.z, in: b.in };
  }
  function makePlan(g, row, wait) {
    const H = holes[g.h]; if (!H) return null;
    const bx = row[1], bz = row[2], mind = !!(H.ghost || H.coffin) && c.rng() < by(sk, [0.35, 0.75, 0.95]);
    const targets = [H.cup]; if (H.tunnel && c.rng() < sk.q && bz > H.tunnel.z) targets.push({ x: H.tunnel.x, z: H.tunnel.z + 0.05 });
    let best = null; const tries = by(sk, [6, 16, 30]);
    for (let i = 0; i < tries; i++) {
      const T = targets[i % targets.length], direct = Math.atan2(T.x - bx, T.z - bz), d = Math.hypot(T.x - bx, T.z - bz);
      const yaw = i < targets.length ? direct : direct + (c.rng() * 2 - 1) * (i < tries / 2 ? 0.35 : 1.6);
      const p = Math.min(1, Math.max(0.03, powerFor(d * (0.9 + c.rng() * (T === H.cup ? 0.9 : 1.6)), L.max)));
      const r = picture(H, bx, bz, yaw, puttSpeed(p, L.max), g.t + wait + p * L.period / 2, mind);
      const score = r.in ? -1 : Math.hypot(r.x - H.cup.x, r.z - H.cup.z);
      if (!best || score < best.score) best = { yaw, p, score };
    }
    const yaw = best.yaw + gauss(c.rng) * by(sk, [0.12, 0.06, 0.035]);
    const p = Math.min(1, Math.max(0.03, best.p * (1 + gauss(c.rng) * by(sk, [0.16, 0.08, 0.05]))));
    return { yaw, hold: p * L.period / 2, held: 0, score: best.score };
  }
  return {
    tick(v) {
      const g = v.g; if (!g || g.ph !== 'play') { plan = null; return null; }
      const row = (g.b || []).find(r => r[0] === c.pid);
      if (!row || row[3] !== 0) { plan = null; return null; }
      const k = g.h + ':' + row[4];
      if (k !== key) {
        key = k; const wait = readDelay(sk, c.rng, 0.6);
        plan = makePlan(g, row, wait); if (plan) plan.at = v.t + wait;
        // a sharp player waits a beat for a better moment (the ghost out of the way, the lid about to open)
        if (plan && plan.score > -1 && c.rng() < by(sk, [0, 0.5, 0.8]) && g.hl > 8) { const p2 = makePlan(g, row, wait + 1); if (p2 && p2.score < plan.score - 0.3) { plan = p2; plan.at = v.t + wait + 1; } }
      }
      if (!plan || v.t < plan.at) return null;
      const mx = Math.sin(plan.yaw), mz = Math.cos(plan.yaw);
      if (plan.held < plan.hold - 0.025) { plan.held += v.dt; return { mx, mz, b: A }; }
      return { mx, mz, b: 0 };                                        // let go: the putt goes
    },
  };
}
