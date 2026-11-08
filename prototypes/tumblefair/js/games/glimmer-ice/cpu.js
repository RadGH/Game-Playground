// Glimmer Ice CPU: remembers where fish glimmered lately, skates to the best open hole near them, chips it if it is
// icing up, drops a line and pulls when it bites (after its reaction time, so it misses some short windows). It
// pulls up and moves on if a hole is about to seal or nothing comes. Family remembers less, picks holes loosely and
// reacts late; Tricky keeps a longer memory and reacts fast.
import { thinker, stickTo, by, slip, A, B } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, think = thinker(c), mem = { seen: [], biteAt: null, dropAt: 0, goal: -1 };
  const memory = by(sk, [2.5, 5, 7]);
  return {
    tick(v) {
      const me = v.me, g = v.g; if (!me || !g || !g.h) return null;
      const holes = v.init.holes, row = g.p.find(r => r[0] === c.pid) || [0, 0, -1], st = row[1], hole = row[2];
      for (const f of g.f || []) if (!f[5]) mem.seen.push({ x: f[1], z: f[2], t: v.t });
      mem.seen = mem.seen.filter(s => v.t - s.t < memory).slice(-60);
      if (st === 2) {                                                   // a bite: pull after a reaction
        mem.biteAt ??= v.t + sk.react * (0.6 + c.rng() * 0.8);
        return v.t >= mem.biteAt ? { mx: 0, mz: 0, b: A } : null;
      }
      mem.biteAt = null;
      if (st === 3) return null;
      if (st === 1) {
        const ice = g.h[hole];
        if (ice >= by(sk, [90, 82, 78]) || v.t - mem.dropAt > by(sk, [12, 9, 7])) return think(v, () => ({ b: A }));   // give up on it
        if (ice > 55 && c.rng() < by(sk, [0.1, 0.3, 0.45])) return think(v, () => ({ b: B }));                         // chip while waiting
        return null;
      }
      return think(v, () => {
        const taken = new Set(g.p.filter(r => r[0] !== c.pid && r[1] > 0).map(r => r[2]));
        const fishNear = h => mem.seen.filter(s => Math.hypot(s.x - h.x, s.z - h.z) < 2.2).length;
        const score = i => taken.has(i) ? -99 : fishNear(holes[i]) * 1.2 - g.h[i] / 35 - Math.hypot(holes[i].x - me.x, holes[i].z - me.z) * 0.25;
        if (mem.goal < 0 || taken.has(mem.goal) || c.rng() < 0.15) {
          const ranked = holes.map((_, i) => [i, score(i) + (c.rng() - 0.5) * sk.aim * 2]).sort((a, b) => b[1] - a[1]);
          mem.goal = slip(sk, c.rng) ? ranked[Math.min(ranked.length - 1, 1)][0] : ranked[0][0];
        }
        const h = holes[mem.goal], d = Math.hypot(h.x - me.x, h.z - me.z);
        if (d > 0.85) return stickTo(me, h.x, h.z, sk, { arrive: 1.2 });
        if (g.h[mem.goal] >= 55) return { b: B };                       // chip it open first
        mem.dropAt = v.t;
        return { b: A };
      });
    },
  };
}
