// Sled Bash CPU: picks the nearest sled still on the ice and slides round to the MIDDLE's side of it, so a bump sends it
// outward; when it has a line on it (the target is roughly straight out from here) it boosts. It also keeps clear of the
// edge — more carefully the better it is. Family reacts late, overshoots, and boosts from too far (or off line);
// Tricky leads a moving sled and only boosts when the line is good.
import { A, by, thinker, stickTo, lead, slip, noisy, blend } from '../cpu-kit.js';
import { RULES } from './sim.js';

const OUT = 1, STUN = 2, FROZEN = 8;
export function createCpu(c) {
  const sk = c.skill, mem = {}, think = thinker(c);
  return {
    tick(v) {
      const g = v.g, me = v.me;
      if (!g || !me || g.ph !== 'play' || (me.flags & (OUT | FROZEN))) return null;
      if ((me.flags & STUN)) return null;                       // spinning or mid-boost: no control anyway
      return think(v, () => {
        const rr = g.rr || c.init?.R || 7.4, dc = Math.hypot(me.x, me.z) || 1e-6;
        const sleds = [...v.bodies].filter(([p, b]) => p !== c.pid && !(b.flags & OUT)).map(([, b]) => b);
        for (const q of g.cpu || []) if (!(q[5] & OUT)) sleds.push({ x: q[1], z: q[2], vx: 0, vz: 0 });
        // the edge first: how close is "too close" depends on skill
        const margin = by(sk, [1.2, 1.8, 2.3]);
        const home = dc > rr - margin ? stickTo(me, 0, 0, sk) : null;
        if (!sleds.length) return home || stickTo(me, 0, 0, sk, { arrive: 1.5 });
        let t = sleds[0], td = Infinity; for (const s of sleds) { const d = Math.hypot(s.x - me.x, s.z - me.z); if (d < td) { td = d; t = s; } }
        const p = lead(t, by(sk, [0, 0.2, 0.35])), pd = Math.hypot(p.x, p.z) || 1, ox = p.x / pd, oz = p.z / pd;
        const lx = p.x - me.x, lz = p.z - me.z, ld = Math.hypot(lx, lz) || 1, lined = (lx / ld) * ox + (lz / ld) * oz;
        const ready = v.t - (mem.boost ?? -9) > RULES.dashCool + 0.1;
        // boost: Tricky waits for a good line, Family has a go from anywhere near
        if (ready && ld < by(sk, [3.4, 3.0, 2.8]) && lined > by(sk, [-0.2, 0.25, 0.45]) && dc < rr - by(sk, [0.6, 1.1, 1.4]) && c.rng() < sk.q + 0.3) {
          mem.boost = v.t; return { ...stickTo(me, noisy(p.x, 0.6, sk, c.rng), noisy(p.z, 0.6, sk, c.rng), sk, { arrive: 0, mag: 1 }), b: A };
        }
        if (slip(sk, c.rng, 0.5)) return home || stickTo(me, noisy(me.x, 3, sk, c.rng), noisy(me.z, 3, sk, c.rng), sk);
        const ax = p.x - ox * 1.3, az = p.z - oz * 1.3;            // the middle's side of it
        const chase = stickTo(me, noisy(ax, 0.7, sk, c.rng), noisy(az, 0.7, sk, c.rng), sk, { arrive: 0 });
        return home ? blend(sk, [home, 1.5], [chase, 0.5]) : chase;
      });
    },
  };
}
