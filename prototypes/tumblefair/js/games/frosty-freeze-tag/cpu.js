// Frosty Freeze Tag CPU. As a runner: if a friend is frozen and the Frost is far enough away it goes and stands next
// to the statue to thaw it; otherwise it looks round for the spot it reaches well before the Frost (off the fences)
// and dashes when the Frost gets close. As the Frost: it chases the nearest runner that can be frozen (not one that has
// just been thawed), aiming a little ahead, and uses frost breath when it is right on top of someone. Family thaws
// recklessly and runs into corners; Tricky waits for a safe moment and leads its chase.
import { A, by, thinker, stickTo, lead, slip, noisy, inArena } from '../cpu-kit.js';
import { RULES } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, think = thinker(c, { every: c.skill.think * 1.2 }), arena = c.init?.arena || { hw: 9, hd: 6 };
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me || g.ph !== 'play') return null;
      const role = g.ro?.[c.pid] ?? 0;
      if (role === 2 || role === 3) return null;                 // counting, or frozen solid
      const frosts = [], free = [], statues = [];
      for (const [p, b] of v.bodies) { if (p === c.pid) continue; const r = g.ro?.[p] ?? 0; (r === 1 || r === 2 ? frosts : r === 3 ? statues : free).push({ b, r }); }
      for (const q of g.cpu || []) frosts.push({ b: { x: q[1], z: q[2], vx: 0, vz: 0 }, r: 1 });
      for (const q of g.pal || []) statues.push({ b: { x: q[1], z: q[2] }, r: 3 });
      if (role === 1) {
        const prey = free.filter(h => h.r === 0).map(h => h.b);
        if (!prey.length) return think(v, () => stickTo(me, 0, 0, sk, { arrive: 1.5 }));
        return think(v, () => {
          let t = prey[0], td = Infinity; for (const h of prey) { const d = Math.hypot(h.x - me.x, h.z - me.z); if (d < td) { td = d; t = h; } }
          const p = lead(t, by(sk, [0, 0.25, 0.45]) * Math.min(1, td / 3));
          const breath = td < RULES.breathR * 0.7 && v.t - (mem.breath ?? -9) > RULES.breathCool + 0.1 && c.rng() < sk.q;
          if (breath) mem.breath = v.t;
          return { ...stickTo(me, noisy(p.x, 0.8, sk, c.rng), noisy(p.z, 0.8, sk, c.rng), sk, { arrive: 0 }), b: breath ? A : 0 };
        });
      }
      const near = frosts.reduce((m, f) => Math.min(m, Math.hypot(f.b.x - me.x, f.b.z - me.z)), 99);
      return think(v, () => {
        // a friend to thaw, when the Frost is far enough away (Family goes anyway)
        let st = null, sd = Infinity; for (const s of statues) { const d = Math.hypot(s.b.x - me.x, s.b.z - me.z); if (d < sd) { sd = d; st = s.b; } }
        const safe = by(sk, [1.8, 3.2, 4.2]);
        if (st && near > safe && !slip(sk, c.rng, 0.5)) return sd < RULES.thawR - 0.35 ? { mx: 0, mz: 0 } : stickTo(me, st.x, st.z, sk, { arrive: 0.3 });
        let best = null, bs = -Infinity;
        for (let i = 0; i < by(sk, [6, 14, 26]); i++) {
          const x = (c.rng() * 2 - 1) * (arena.hw - 1.2), z = (c.rng() * 2 - 1) * (arena.hd - 1.2), dm = Math.hypot(x - me.x, z - me.z);
          let s = -dm * 0.15;
          for (const f of frosts) {
            const b = f.b, dg = Math.hypot(x - b.x, z - b.z), ux = (x - me.x) / (dm || 1), uz = (z - me.z) / (dm || 1);
            const along = Math.max(0, Math.min(dm, (b.x - me.x) * ux + (b.z - me.z) * uz)), pass = Math.hypot(me.x + ux * along - b.x, me.z + uz * along - b.z);
            s += Math.min(dg - dm * 0.9, 6) - (pass < 2.2 ? (2.2 - pass) * 4 : 0);
          }
          if (s > bs) { bs = s; best = { x, z }; }
        }
        if (!best || slip(sk, c.rng, 0.3)) best = inArena(noisy(me.x, 4, sk, c.rng), noisy(me.z, 4, sk, c.rng), arena);
        const run = stickTo(me, best.x, best.z, sk, { arrive: 0 });
        if (near < by(sk, [1.6, 2.6, 3.4]) && v.t - (mem.dash ?? -9) > RULES.dashCool + 0.05 && c.rng() < sk.q + 0.25) { mem.dash = v.t; return { ...run, b: A }; }
        return run;
      });
    },
  };
}
