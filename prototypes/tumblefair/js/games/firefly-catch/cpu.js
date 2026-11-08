// Firefly Catch CPU: walks to the best firefly it can see (near; a golden one counts extra), or to a glowing bush when
// the meadow is thin, slows as it closes in and swings a reaction time after one is in reach. Family wanders, swings
// late and forgets the bushes; Tricky goes for gold, shakes bushes and lines up swings that take two flies at once.
import { A, by, stickTo, noisy, slip } from '../cpu-kit.js';
import { RULES } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, posts = c.init?.arena?.posts || [], mem = { swingAt: 0, inAt: null, next: 0, out: { mx: 0, mz: 0 } };
  const goldPull = by(sk, [1, 1.5, 1.8]), bushes = by(sk, [0.5, 0.7, 0.85]), pace = by(sk, [0.8, 0.85, 0.87]) * (0.92 + c.rng() * 0.16);
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me || (me.flags & 8)) return null;
      const flies = (g.f || []).map(f => ({ x: f[1], z: f[2], gold: f[3] }));
      const near = flies.filter(f => Math.hypot(f.x - me.x, f.z - me.z) <= RULES.reach * by(sk, [0.8, 0.88, 0.92]));
      const byBush = posts.some((p, i) => g.bu?.[i] && Math.hypot(p.x - me.x, p.z - me.z) <= p.r + RULES.shakeR * 0.85);
      // swing a beat after something is in reach (and the net is back)
      if (near.length || byBush) { if (mem.inAt == null) mem.inAt = v.t + by(sk, [0.32, 0.26, 0.22]) * (0.6 + c.rng() * 0.8); }
      else mem.inAt = null;
      if (mem.inAt != null && v.t >= mem.inAt && v.t >= mem.swingAt) { mem.inAt = null; mem.swingAt = v.t + RULES.netCool + by(sk, [0.18, 0.12, 0.09]); return { ...mem.out, b: A }; }
      if (v.t < mem.next) return { ...mem.out, b: 0 };
      mem.next = v.t + sk.think * (0.8 + c.rng() * 0.4);
      let tx = null, tz = null, best = -1e9;
      for (const f of flies) { const s = -Math.hypot(f.x - me.x, f.z - me.z) + (f.gold ? goldPull : 0) + noisy(0, 1.5, sk, c.rng); if (s > best) { best = s; tx = f.x; tz = f.z; } }
      if (c.rng() < bushes) posts.forEach((p, i) => { if (!g.bu?.[i]) return; const s = -Math.hypot(p.x - me.x, p.z - me.z) + 1.8 - (flies.length > 6 ? 2 : 0); if (s > best) { best = s; tx = p.x; tz = p.z; } });
      if (tx == null || slip(sk, c.rng, 0.4)) { mem.out = { mx: 0, mz: 0 }; return mem.out; }   // looks around for a moment
      const d = Math.hypot(tx - me.x, tz - me.z);
      mem.out = stickTo(me, tx, tz, sk, { arrive: 0, mag: pace * (d < RULES.reach + 0.6 ? 0.45 : 1) });
      return { ...mem.out, b: 0 };
    },
  };
}
