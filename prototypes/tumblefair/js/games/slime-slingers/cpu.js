// Slime Slingers CPU: picks the best mark (a slingable that is already gooey counts extra — the third glob is worth 3),
// closes to throwing range, faces it and throws; it sidesteps globs flying at it and washes off at the pump when it is
// badly slimed. Family throws a little slower and wider and often forgets to wash; Tricky leads, dodges and washes.
import { thinker, stickTo, stickFrom, by, noisy, slip, A, B } from '../cpu-kit.js';
import { RULES } from './sim.js';

const STUN = 2, FROZEN = 8, GHOST = 32;
export function createCpu(c) {
  const think = thinker(c), sk = c.skill, mem = { gl: new Map() }, pump = c.init?.pump || RULES.pump;
  const range = 6, gap = by(sk, [1.15, 1.05, 0.92]);       // likes to throw from / seconds between throws
  return {
    tick(v) {
      const me = v.me, g = v.g; if (!me || !g || g.cd || (me.flags & (FROZEN | STUN))) return null;
      // globs: work out their flight from the last two looks
      const seen = new Map(); let threat = null;
      for (const [id, x, z] of g.gl || []) {
        const was = mem.gl.get(id); seen.set(id, [x, z]); if (!was) continue;
        const vx = (x - was[0]) / v.dt, vz = (z - was[1]) / v.dt, sp = Math.hypot(vx, vz) || 1;
        const rx = me.x - x, rz = me.z - z, along = (rx * vx + rz * vz) / sp, side = Math.abs(rx * vz - rz * vx) / sp;
        if (along > 0 && along < 4 && side < RULES.globR + 0.3 && Math.hypot(rx, rz) > 0.8) threat = { vx: vx / sp, vz: vz / sp };   // not my own just-thrown glob
      }
      mem.gl = seen;
      const out = think(v, () => {
        mem.want = null;
        if (threat && !slip(sk, c.rng) && c.rng() < by(sk, [0.4, 0.55, 0.68])) {
          const sx = -threat.vz, sz = threat.vx, s = (me.x * sx + me.z * sz) > 0 ? -1 : 1;     // sidestep (toward the middle)
          return { mx: sx * s, mz: sz * s, b: c.rng() < by(sk, [0.1, 0.25, 0.35]) ? B : 0 };
        }
        const lvl = g.lv?.[c.pid] || 0;
        if (lvl >= 2 && c.rng() < by(sk, [0.35, 0.6, 0.8])) return stickTo(me, pump.x, pump.z, sk, { arrive: 0 });
        const marks = [...v.bodies].filter(([p, b]) => p !== c.pid && !(b.flags & (FROZEN | GHOST))).map(([p, b]) => ({ ...b, lvl: g.lv?.[p] || 0 }));
        for (const h of g.gh || []) if (!(h[4] & (FROZEN | GHOST))) marks.push({ x: h[1], z: h[2], vx: 0, vz: 0, lvl: h[3] });
        let tgt = null, ts = -1e9;
        for (const m of marks) { const s = -Math.hypot(m.x - me.x, m.z - me.z) + m.lvl * 2 * sk.q; if (s > ts) { ts = s; tgt = m; } }
        if (!tgt) return null;
        const d = Math.hypot(tgt.x - me.x, tgt.z - me.z), lead = by(sk, [0.4, 0.6, 0.85]) * d / RULES.globSpeed;
        const ax = noisy(tgt.x + (tgt.vx || 0) * lead, 0.9, sk, c.rng), az = noisy(tgt.z + (tgt.vz || 0) * lead, 0.9, sk, c.rng);
        if (d > range) return stickTo(me, tgt.x, tgt.z, sk, { arrive: 0 });
        // in range: face it (a small push turns me without walking much); the tap comes below, once I face it
        if (!mem.aim || v.t > mem.aimAt) { mem.aim = Math.atan2(ax - me.x, az - me.z); mem.aimAt = v.t + 0.5; }   // where I mean to throw (held a moment)
        if (d < 2.2) return stickFrom(me, tgt.x, tgt.z, sk, { mag: 0.5 });   // too close: back off a step first
        mem.want = mem.aim;
        return { mx: Math.sin(mem.aim) * 0.3, mz: Math.cos(mem.aim) * 0.3 };
      });
      // the throw itself: a tap once I face where I meant to throw, no more often than `gap`
      let da = (mem.want ?? 99) - me.yaw; da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
      if (mem.want != null && da < 0.3 && v.t >= (mem.next ?? 0) && out.b === 0) { mem.want = null; mem.next = v.t + gap * (0.8 + c.rng() * 0.4); return { ...out, b: A }; }
      return out;
    },
  };
}
