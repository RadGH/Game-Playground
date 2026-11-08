// Cannonball Catch CPU (co-op): once it has noticed a new landing ring it runs to the ring it is closest to among the
// team (a big x2 ball wants a second catcher, so it joins whoever is nearest), and dives when a ball is about to land
// just out of reach. Family notices late, runs slower and dives badly; Tricky shares the yard out and times dives well.
import { A, by, stickTo, reacted, slip } from '../cpu-kit.js';
import { RULES } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, seen = new Map();
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me) return null;
      for (const b of g.bl || []) if (!seen.has(b[0])) seen.set(b[0], v.t + sk.react * by(sk, [1.4, 0.85, 0.7]) * (0.75 + c.rng() * 0.5));
      const balls = (g.bl || []).filter(b => v.t >= seen.get(b[0]));
      if (!balls.length) {                                          // wait in my share of the yard
        const n = c.players.length, i = c.players.findIndex(p => p.pid === c.pid), hx = n > 1 ? -5 + 10 * i / (n - 1) : 0;
        return stickTo(me, hx, 0, sk, { mag: 0.5 });
      }
      const team = [...v.bodies].filter(([p]) => p !== c.pid).map(([, b]) => b);
      let best = null, bs = Infinity;
      for (const b of balls) {
        const x = b[3], z = b[4], left = b[5], d = Math.hypot(x - me.x, z - me.z);
        const closer = team.filter(t => Math.hypot(t.x - x, t.z - z) < d).length;
        const need = b[7] ? 2 : 1;
        const cost = left + (closer >= need ? 6 : 0) + (d / (6.4 * sk.speed) > left + 0.3 ? 4 : 0) + d * 0.15;
        if (cost < bs) { bs = cost; best = b; }
      }
      if (mem.slipUntil > v.t) return null;
      if (slip(sk, c.rng, 0.02)) mem.slipUntil = v.t + 0.5;          // a moment's daydream
      const x = best[3], z = best[4], left = best[5], d = Math.hypot(x - me.x, z - me.z);
      const st = stickTo(me, x, z, sk, { arrive: 0.3 });
      const canDive = by(sk, [0.4, 0.75, 0.9]) > (mem.diveRoll ??= c.rng());
      if (d > RULES.catchR && d < 3.4 && left < by(sk, [0.3, 0.38, 0.42]) && canDive && reacted(mem, 'dive' + best[0], v.t, sk, c.rng, 0.25)) { mem.diveRoll = null; return { ...st, b: A }; }
      return st;
    },
  };
}
