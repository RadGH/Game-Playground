// Stack Attack CPU: walks to the nearest loose block, grabs it, carries it home and stacks it; shoves a rival carrier
// that is right in front of it now and then, and Tricky sometimes raids a rival's tall tower. Family dawdles, misses
// grabs (presses too early) and wanders off; Tricky picks gold blocks first and walks clean lines.
import { thinker, stickTo, nearest, by, slip, noisy, A, B } from '../cpu-kit.js';
import { PADS, RULES, onPad } from './sim.js';

const STUN = 2;
export function createCpu(c) {
  const think = thinker(c, { every: by(c.skill, [0.27, 0.2, 0.18]) }), sk = { ...c.skill, speed: by(c.skill, [0.86, 0.9, 0.91]) }, pad = PADS[c.seat], mem = {};
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g || (me.flags & STUN)) return null;
      return think(v, () => {
        const carrying = (g.k || []).some(k => k[4] === c.pid);
        if (mem.lost > v.t) return stickTo(me, mem.to.x, mem.to.z, sk);
        if (slip(sk, c.rng, 0.18)) { mem.lost = v.t + by(sk, [0.55, 0.6, 0.6]); mem.to = { x: noisy(me.x, 3, sk, c.rng), z: noisy(me.z, 3, sk, c.rng) }; return stickTo(me, mem.to.x, mem.to.z, sk); }
        // a rival carrier right in front: shove it
        for (const [p, b] of v.bodies) {
          if (p === c.pid || b.flags & STUN) continue;
          const hold = (g.k || []).some(k => k[4] === p), d = Math.hypot(b.x - me.x, b.z - me.z);
          if (hold && d < RULES.shoveR * 0.9 && c.rng() < by(sk, [0.25, 0.35, 0.4])) return { ...stickTo(me, b.x, b.z, sk), b: B };
        }
        if (carrying) {
          const sp = by(sk, [0.95, 1, 1]) * sk.speed;
          if (onPad(me.x, me.z, c.seat)) return { mx: 0, mz: 0, b: A };
          return stickTo(me, pad.x, pad.z, sk, { mag: sp });
        }
        const free = (g.k || []).filter(k => k[4] < 0).map(k => ({ x: k[1], z: k[2], gold: k[3] }));
        // Tricky: raid a tower that is clearly ahead
        if (mem.raid || (c.rng() < by(sk, [0.01, 0.02, 0.03]))) {
          const mine = g.sc?.[c.pid] || 0; let tgt = null;
          for (const [p, s] of (v.init.pads || [])) if (p !== c.pid && (g.sc?.[p] || 0) >= mine + 3) tgt = PADS[s];
          mem.raid = tgt;
          if (tgt) { if (onPad(me.x, me.z, 0, tgt)) { mem.raid = null; return { mx: 0, mz: 0, b: A }; } return stickTo(me, tgt.x, tgt.z, sk); }
        }
        const goldFirst = c.rng() < by(sk, [0.35, 0.5, 0.6]);
        const n = nearest(me, free, b => b, goldFirst && free.some(b => b.gold) ? b => b.gold : null);
        if (!n.item) return stickTo(me, 0, 0, sk);
        const reach = RULES.reach * by(sk, [1.08, 1.03, 1]);   // Family presses from too far away sometimes
        return { ...stickTo(me, n.item.x, n.item.z, sk, { arrive: 0.2 }), b: n.d < reach ? A : 0 };
      });
    },
  };
}
