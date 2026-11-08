// Floor Is Lava CPU: while the floor is cool it walks to a fresh, uncrowded cushion or rock; when the floor glows it
// gets up on one; while it is hot it stays in the middle and, when its perch is wearing thin, walks to the edge and
// hops (a long jump for a wide gap) to the healthiest one in reach. Family moves late, waits too long to hop and
// sometimes misjudges a long jump; Tricky moves at the warning and hops early. Shoves a close rival now and then.
import { stickTo, by, slip, noisy, A, B } from '../cpu-kit.js';

const AIR = 16, STUN = 2;
const inside = (p, k, x, z, m = 0) => k.r ? Math.hypot(x - p.x, z - p.z) <= k.r + m : Math.abs(x - p.x) <= k.hw + m && Math.abs(z - p.z) <= k.hd + m;
const reach = k => k.r || Math.max(k.hw, k.hd);

export function createCpu(c) {
  const sk = c.skill, mem = {};
  return {
    tick(v) {
      const me = v.me, g = v.g; if (!me || !g || !g.pl || (g.o || []).includes(c.pid) || (me.flags & (1 | 8))) return null;
      const K = v.init.kinds, plats = g.pl.map(r => ({ id: r[0], k: K[r[1]], x: r[2], z: r[3], wear: r[4], up: r[5] > -0.01 }));
      const on = plats.find(p => p.up && inside(p, p.k, me.x, me.z, 0.1));
      const rivals = [...v.bodies].filter(([p, b]) => p !== c.pid && !(b.flags & 1)).map(([, b]) => b);
      const score = p => p.wear * 0.5 + (p.k.life > 5 ? 1 : 0) - Math.hypot(p.x - me.x, p.z - me.z) * 0.3 - (rivals.some(b => inside(p, p.k, b.x, b.z, 0.3)) ? by(sk, [1, 2, 3.5]) : 0);
      if (me.flags & AIR) {                                              // in the air: steer for the middle of the landing
        const t = plats.find(p => p.id === mem.aim) || on; if (!t) return { mx: 0, mz: 0, b: mem.long ? A : 0 };
        return { ...stickTo(me, t.x, t.z, sk, { arrive: 0.4, mag: 1 }), b: mem.long ? A : 0 };
      }
      if (me.flags & STUN) return null;
      const danger = g.lv === 'lava' || g.lv === 'warn';
      const ready = reacted(mem, g.lv + g.w, v.t, sk, c.rng, by(sk, [1.6, 1, 0.7]));
      if (!on) {                                                          // on the floor: get up on something (late when it is calm)
        if (!danger && !mem.pick && v.t < (mem.idleUntil ??= v.t + 0.6 + c.rng())) return null;
        if (danger && !ready) return null;
        const best = plats.filter(p => p.up && p.wear >= 3).sort((a, b) => score(b) - score(a))[slip(sk, c.rng, 0.3) ? 1 : 0] || plats.find(p => p.up);
        if (!best) return null;
        if (!mem.pick || !plats.some(p => p.id === mem.pick && p.up) || danger) mem.pick = best.id;
        const t = plats.find(p => p.id === mem.pick);
        return stickTo(me, t.x, t.z, sk, { arrive: 0.3 });
      }
      mem.pick = on.id;
      // a shove: someone sharing my perch, while it is hot
      const close = rivals.find(b => Math.hypot(b.x - me.x, b.z - me.z) < 1.2 && b.y > 0.1);
      if (close && g.lv === 'lava' && c.rng() < by(sk, [0.002, 0.008, 0.03])) return { ...stickTo(me, close.x, close.z, sk), b: B };
      const thin = on.wear <= by(sk, [1, 3, 5]);
      if (g.lv !== 'lava' && g.lv !== 'warn' && on.wear < 6) {            // cool: go find a fresher one on foot
        const better = plats.filter(p => p.up && p.id !== on.id && p.wear >= 7).sort((a, b) => score(b) - score(a))[0];
        if (better && g.nx > 1.5) { mem.pick = better.id; return stickTo(me, better.x, better.z, sk, { arrive: 0.3 }); }
      }
      if (!(g.lv === 'lava' && thin) || !ready) return stickTo(me, on.x, on.z, sk, { arrive: 0.5, mag: 0.6 });
      const hopTo = plats.filter(p => p.up && p.id !== on.id && p.wear >= 3 && Math.hypot(p.x - me.x, p.z - me.z) - reach(p.k) < by(sk, [2.4, 3.8, 4.4])).sort((a, b) => score(b) - score(a))[0];
      if (!hopTo) return stickTo(me, on.x, on.z, sk, { arrive: 0.5, mag: 0.6 });
      const dx = hopTo.x - me.x, dz = hopTo.z - me.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d, gap = d - reach(hopTo.k);
      const edge = by(sk, [0.25, 0.45, 0.55]);
      if (inside(on, on.k, me.x + ux * edge, me.z + uz * edge, 0) && gap > 0.5) return { mx: ux * 0.7, mz: uz * 0.7, b: 0 };   // to the edge
      mem.aim = hopTo.id; mem.long = gap > noisy(1.5, 0.6, sk, c.rng);
      return { mx: ux, mz: uz, b: A };
    },
  };
}
function reacted(mem, key, t, sk, rng, k) {
  if (mem.rk !== key) { mem.rk = key; mem.ra = t + sk.react * k * (0.75 + rng() * 0.5); }
  return t >= mem.ra;
}
