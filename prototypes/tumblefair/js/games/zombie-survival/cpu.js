// Night of the Shamblers CPU (co-op): picks a downed friend up when nothing is about to grab it, bonks the nearest
// Shambler when it is in reach and the bat is ready (it remembers its own swings), backs off toward the middle while the
// bat cools, and plants a fence when a crowd is coming. Family is slow to swing, wanders into crowds and forgets
// friends; Tricky keeps its distance and revives quickly.
import { A, B, by, stickTo, slip, gauss } from '../cpu-kit.js';
import { RULES } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = { swung: -9, pb: false };
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me || (me.flags & 8) || (g.dn || []).some(d => d[0] === c.pid)) return null;
      if (mem.pb) { mem.pb = false; return null; }                        // let go of the last press
      const press = (b, mx = 0, mz = 0) => { mem.pb = true; return { mx, mz, b }; };
      const zs = (g.z || []).filter(z => z[5] !== 3).map(z => ({ x: z[2], z: z[3], k: z[1] }));
      const dist = z => Math.hypot(z.x - me.x, z.z - me.z);
      let near = null, nd = 99; for (const z of zs) { const d = dist(z); if (d < nd) { nd = d; near = z; } }
      const ready = v.t - mem.swung > RULES.swingCool + by(sk, [0.45, 0.15, 0.05]);
      // a downed friend
      const friend = (g.dn || []).map(d => v.bodies.get(d[0])).filter(Boolean).sort((a, b) => dist(a) - dist(b))[0];
      if (friend && nd > by(sk, [1.2, 1.6, 1.8]) && !slip(sk, c.rng, 0.4)) {
        if (dist(friend) > 0.9) return stickTo(me, friend.x, friend.z, sk, { arrive: 0.3 });
        if (near && nd < 2.3 && ready) { mem.swung = v.t; return press(A); }
        return null;
      }
      if (!near) return stickTo(me, 0, 0, sk, { mag: 0.5 });
      const ux = (near.x - me.x) / (nd || 1), uz = (near.z - me.z) / (nd || 1);
      const crowd = zs.filter(z => dist(z) < 3.2).length;
      if (crowd >= 3 && (g.bc?.[c.pid] ?? 0) > 0 && nd > 1.4 && c.rng() < by(sk, [0.05, 0.25, 0.5])) return press(B, ux * 0.25, uz * 0.25);
      if (ready && nd < by(sk, [1.8, 2.05, 2.15]) && c.rng() < by(sk, [0.35, 0.7, 0.9])) { mem.swung = v.t; return press(A, ux * 0.3, uz * 0.3); }
      // cooling, or nothing in reach yet: back off toward the middle (Family is slow to)
      if (nd < by(sk, [1.6, 2.3, 2.6])) { let mx = -ux - me.x * 0.06 + gauss(c.rng) * 0.2 * sk.aim, mz = -uz - me.z * 0.06; const m = Math.hypot(mx, mz) || 1; return { mx: mx / m * sk.speed, mz: mz / m * sk.speed, b: 0 }; }
      return { mx: ux * 0.6 * sk.speed, mz: uz * 0.6 * sk.speed, b: 0 };
    },
  };
}
