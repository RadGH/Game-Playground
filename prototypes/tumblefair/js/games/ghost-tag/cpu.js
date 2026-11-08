// Ghost Tag CPU: as a human it looks round for the direction that keeps it furthest from every ghost (and off the
// fences) and dashes when one gets close; as a ghost it floats after the nearest human, aiming a little ahead, and
// BOOs when it is right on top of someone. Family reacts slowly and runs into corners; Tricky leads its chase and
// dodges at the last moment.
import { A, by, thinker, stickTo, lead, slip, noisy, inArena } from '../cpu-kit.js';
import { RULES } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, think = thinker(c, { every: c.skill.think * 1.2 }), arena = c.init?.arena || { hw: 9, hd: 6 };
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me || g.ph !== 'play' || (me.flags & 8)) return null;
      const role = g.ro?.[c.pid] ?? 0;
      const ghosts = [], humans = [];
      for (const [p, b] of v.bodies) if (p !== c.pid) (g.ro?.[p] ? ghosts : humans).push(b);      // a ghost still counting is still a ghost
      for (const q of g.cpu || []) ghosts.push({ x: q[1], z: q[2], vx: 0, vz: 0 });
      if (role === 0) {
        const near = ghosts.reduce((m, b) => Math.min(m, Math.hypot(b.x - me.x, b.z - me.z)), 99);
        return think(v, () => {
          // somewhere I reach well before any ghost, without running past one (Tricky weighs more spots)
          let best = null, bs = -Infinity;
          for (let i = 0; i < by(sk, [6, 14, 26]); i++) {
            const x = (c.rng() * 2 - 1) * (arena.hw - 1.2), z = (c.rng() * 2 - 1) * (arena.hd - 1.2), dm = Math.hypot(x - me.x, z - me.z);
            let s = -dm * 0.15;
            for (const b of ghosts) {
              const dg = Math.hypot(x - b.x, z - b.z), ux = (x - me.x) / (dm || 1), uz = (z - me.z) / (dm || 1);
              const along = Math.max(0, Math.min(dm, (b.x - me.x) * ux + (b.z - me.z) * uz)), pass = Math.hypot(me.x + ux * along - b.x, me.z + uz * along - b.z);
              s += Math.min(dg - dm * 0.9, 6) - (pass < 2.2 ? (2.2 - pass) * 4 : 0);
            }
            if (s > bs) { bs = s; best = { x, z }; }
          }
          if (!best || slip(sk, c.rng, 0.3)) best = inArena(noisy(me.x, 4, sk, c.rng), noisy(me.z, 4, sk, c.rng), arena);
          const st = stickTo(me, best.x, best.z, sk, { arrive: 0 });
          // dash away whenever it is ready (I remember when I last dashed) and a ghost is close; Tricky dashes early and often
          if (near < by(sk, [1.6, 2.6, 3.6]) && v.t - (mem.dash ?? -9) > RULES.dashCool + 0.05 && c.rng() < sk.q + 0.25) { mem.dash = v.t; return { ...st, b: A }; }
          return st;
        });
      }
      if (role !== 1 || !humans.length) return null;
      return think(v, () => {
        let t = humans[0], td = Infinity;
        for (const h of humans) { const d = Math.hypot(h.x - me.x, h.z - me.z); if (d < td) { td = d; t = h; } }
        const p = lead(t, by(sk, [0, 0.25, 0.45]) * Math.min(1, td / 3));
        return { ...stickTo(me, noisy(p.x, 0.8, sk, c.rng), noisy(p.z, 0.8, sk, c.rng), sk, { arrive: 0 }), b: td < RULES.booR * 0.7 && c.rng() < sk.q ? A : 0 };
      });
    },
  };
}
