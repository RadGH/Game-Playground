// Hay Bale Scramble CPU: while the fiddle plays it strolls round just outside the ring of bales, keeping close to one;
// when the music stops it reacts, runs to the nearest free bale (one nobody else is closer to, if it can) and sits.
// Family reacts late and can be fooled by the fiddler's hiccup into a stumble; Tricky is quick and barges a rival
// standing between it and its bale.
import { A, B, by, stickTo, slip, nearest } from '../cpu-kit.js';
import { RULES } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, seen = new Map();
  const noticed = (key, t, k = 1) => { if (!seen.has(key)) seen.set(key, t + (0.2 + sk.react * 0.55 * k) * (0.5 + c.rng())); return t >= seen.get(key); };
  const baleAt = (g, i) => { const k = g.bl.length, a = g.a + i * Math.PI * 2 / k; return { x: Math.sin(a) * g.rr, z: Math.cos(a) * g.rr, i }; };
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me || g.out?.[c.pid] || (me.flags & (2 | 8))) return null;
      if (g.ph === 'music') {
        if (g.h && noticed('hic' + g.r, v.t) && slip(sk, c.rng, 0.06) && !mem.fooled) { mem.fooled = true; return { mx: 0, mz: 0, b: A }; }
        if (!g.h) mem.fooled = false;
        // walk round with the ring, a little outside it, next to the nearest bale
        const near = nearest(me, g.bl.map((_, i) => baleAt(g, i))).item; if (!near) return null;
        if (mem.r !== g.r) { mem.r = g.r; mem.lag = (c.rng() - 0.5) * by(sk, [1.6, 1.1, 0.7]); }      // how well I keep up with my bale
        const a = Math.atan2(near.x, near.z) + Math.sign(g.w || 1) * 0.15 + mem.lag, r = g.rr + 0.9;
        return stickTo(me, Math.sin(a) * r, Math.cos(a) * r, sk, { mag: 0.6 });
      }
      if (g.ph !== 'scramble' || !noticed('stop' + g.r + ':' + (g.tr ?? 0), v.t)) return null;
      const others = [...v.bodies].filter(([p, b]) => p !== c.pid && !g.out?.[p] && !(b.flags & 8)).map(([, b]) => b);
      const free = g.bl.map((o, i) => o === -1 ? baleAt(g, i) : null).filter(Boolean);
      if (!free.length) return null;
      const dMe = b => Math.hypot(b.x - me.x, b.z - me.z);
      const score = b => dMe(b) + (others.some(o => Math.hypot(b.x - o.x, b.z - o.z) < dMe(b) - 0.3) ? by(sk, [0, 1.5, 3]) : 0);   // someone will beat me there
      let t = free[0]; for (const b of free) if (score(b) < score(t)) t = b;
      const d = Math.hypot(t.x - me.x, t.z - me.z);
      if (d < RULES.sitR - 0.35) { mem.pa = !mem.pa; return { mx: 0, mz: 0, b: mem.pa ? A : 0 }; }
      const st = stickTo(me, t.x, t.z, sk, { arrive: 0 });
      const block = others.find(o => Math.hypot(o.x - me.x, o.z - me.z) < 1.0 && Math.hypot(t.x - o.x, t.z - o.z) < d);
      if (block && c.rng() < by(sk, [0, 0.03, 0.08])) return { ...st, b: B };
      return st;
    },
  };
}
