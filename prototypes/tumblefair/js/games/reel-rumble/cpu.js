// Reel Rumble CPU: picks a fish shadow it can reach (bigger ones are worth the trip), aims the stick at it and holds A
// until the power swing matches the distance; when the bobber plunges it presses A after its reaction time, then
// reels while the tension meter has room and lets go when it gets high or the fish surges. Family casts wide, hooks
// late (and misses bites) and lets the line get too tight; Tricky picks big fish and reads the surges.
import { A, by, gauss, readDelay } from '../cpu-kit.js';
import { CAST, clampYaw } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, init = c.init || {}, period = init.level?.period ?? 1.8, mem = {};
  const me = (init.pegs || [])[c.players.findIndex(p => p.pid === c.pid)] || { x: 0, z: 5 };
  const press = () => { mem.pa = !mem.pa; return mem.pa ? { mx: 0, mz: 0, b: A } : null; };
  return {
    tick(v) {
      const g = v.g; if (!g) return null;
      const row = (g.b || []).find(r => r[0] === c.pid); if (!row) return null;
      const st = row[1];
      if (st !== mem.st) { mem.st = st; mem.since = v.t; mem.plan = null; mem.pa = false; }
      if (st === 0) {                                                     // aim and cast
        if (!mem.plan) {
          let best = null, bs = -Infinity;
          for (const f of g.f || []) {
            const d = Math.hypot(f[1] - me.x, f[2] - me.z); if (d < CAST.min || d > CAST.max) continue;
            const s = f[4] * by(sk, [0.3, 0.8, 0.8]) - d * by(sk, [0.12, 0.12, 0.3]) + c.rng() * by(sk, [1.2, 0.8, 0.4]);
            if (s > bs) { bs = s; best = f; }
          }
          const tx = best ? best[1] : me.x + (c.rng() - 0.5) * 6, tz = best ? best[2] : me.z - 6;
          const yaw = clampYaw(Math.atan2(tx - me.x, tz - me.z) + gauss(c.rng) * 0.12 * sk.aim);
          const d = Math.hypot(tx - me.x, tz - me.z), p = Math.max(0.05, Math.min(1, (d - CAST.min) / (CAST.max - CAST.min) + gauss(c.rng) * 0.12 * sk.aim));
          mem.plan = { yaw, hold: p * period / 2, held: 0, at: v.t + readDelay(sk, c.rng, 0.5) };
        }
        const P = mem.plan; if (v.t < P.at) return null;
        const mx = Math.sin(P.yaw), mz = Math.cos(P.yaw);
        if (P.held < P.hold - 0.025) { P.held += v.dt; return { mx, mz, b: A }; }
        return { mx, mz, b: 0 };
      }
      if (st === 2) {                                                     // waiting: nobody coming? reel in and try again
        const near = (g.f || []).some(f => Math.hypot(f[1] - row[2], f[2] - row[3]) < 3.4);
        if (v.t - mem.since > (near ? 12 : by(sk, [9, 6, 4.5]))) { mem.since = v.t; return press(); }
        return null;
      }
      if (st === 3) {                                                     // BITE: hook it
        mem.hookAt ??= v.t + sk.react * (0.7 + c.rng() * 0.7) * by(sk, [1.15, 1, 0.9]);
        if (v.t >= mem.hookAt) { mem.hookAt = null; return { mx: 0, mz: 0, b: A }; }
        return null;
      }
      mem.hookAt = null;
      if (st === 4) {                                                     // the fight
        const ten = row[5] / 100, surge = row[6];
        if (surge && mem.surgeSeen == null) mem.surgeSeen = v.t + sk.react * 0.6;
        if (!surge) mem.surgeSeen = null;
        const easing = surge && v.t >= mem.surgeSeen && ten > 0.3;
        const hold = !easing && ten < by(sk, [0.8, 0.74, 0.8]) + gauss(c.rng) * 0.05 * sk.aim;
        return { mx: 0, mz: 0, b: hold ? A : 0 };
      }
      return null;
    },
  };
}
