// Balloon Baron CPU (co-op): keeps darts in its pocket (walks into the nearer bucket when it runs out, or tops up when
// it is passing), walks to a few steps from the Baron, turns to the nearest crown balloon and throws. When he is flat
// it runs onto him and keeps jumping. It steps out of landing rings, confetti rings and the puff wedge once it has
// noticed them. Family notices late, throws wide now and then and walks off for darts at odd moments.
import { thinker, stickTo, stickFrom, by, slip, noticed, nearest, A, B } from '../cpu-kit.js';
import { RULES, inPuff } from './sim.js';

const STUN = 2, AIR = 16;
export function createCpu(c) {
  const sk = c.skill, rng = c.rng, think = thinker(c), mem = { throwAt: 0 };
  const gap = by(sk, [0.75, 0.5, 0.4]), side = c.seat * 1.57 + 0.6;
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g || g.ph === 'end' || g.ph === 'ready' || (me.flags & STUN)) return null;
      const darts = g.am?.[c.pid] ?? 0;
      // flat: on him and jumping (watched every tick: a person keeps tapping)
      if (g.ph === 'flat') {
        const d = Math.hypot(me.x - g.bx, me.z - g.bz);
        if (d < RULES.flatR - 0.5 && !(me.flags & AIR) && noticed(mem, 'flat' + g.cyc, v.t, sk, rng, 0.8) && v.t >= mem.throwAt && !slip(sk, rng, 0.2)) { mem.throwAt = v.t + by(sk, [0.35, 0.15, 0.08]); return { ...stickTo(me, g.bx, g.bz, sk, { arrive: 1 }), b: B }; }
        return stickTo(me, g.bx, g.bz, sk, { arrive: 1 });
      }
      // in danger from something I have noticed: get out
      const flee = danger(g, me, mem, v, sk, rng);
      if (flee) return flee;
      // facing a balloon close enough, with a dart: throw
      const bal = nearest(me, g.cr || [], r => [r[1], r[2]]).item;
      if (bal && darts > 0 && v.t >= mem.throwAt) {
        const dx = bal[1] - me.x, dz = bal[2] - me.z, d = Math.hypot(dx, dz), off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - me.yaw), Math.cos(Math.atan2(dx, dz) - me.yaw)));
        if (d < 8.5 && off < RULES.aimCone * by(sk, [1.2, 0.8, 0.6]) && noticed(mem, 'b' + bal[0], v.t, sk, rng, 0.5)) { mem.throwAt = v.t + gap * (0.8 + rng() * 0.5); return { mx: 0, mz: 0, b: slip(sk, rng, 0.2) ? 0 : A }; }
      }
      return think(v, () => {
        if (!darts || (darts < RULES.dartsMax && nearest(me, RULES.buckets).d < 2.5)) { const k = nearest(me, RULES.buckets).item; return stickTo(me, k.x, k.z, sk, { arrive: 0.1 }); }
        if (!bal) return stickTo(me, g.bx + Math.sin(side) * 4.5, g.bz + Math.cos(side) * 4.5, sk);
        // stand 4-5 m from the Baron on my side and turn to the nearest balloon (a gentle push sets the facing)
        const d = Math.hypot(bal[1] - me.x, bal[2] - me.z);
        if (d > 6) { const a = Math.atan2(me.x - g.bx, me.z - g.bz); return stickTo(me, Math.max(-7.8, Math.min(7.8, g.bx + Math.sin(a) * 4.5)), Math.max(-5.3, Math.min(5.3, g.bz + Math.cos(a) * 4.5)), sk); }
        const m = 0.25; const dx = bal[1] - me.x, dz = bal[2] - me.z, L = Math.hypot(dx, dz) || 1;
        return { mx: dx / L * m, mz: dz / L * m };
      });
    },
  };
}
/** The best way out of a ring at (x, z) radius r: the nearest point outside it that is still in the yard. */
function escape(me, x, z, r, sk) {
  let best = null, bd = Infinity;
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6, px = Math.max(-7.9, Math.min(7.9, x + Math.sin(a) * (r + 1))), pz = Math.max(-5.4, Math.min(5.4, z + Math.cos(a) * (r + 1)));
    if (Math.hypot(px - x, pz - z) < r + 0.6) continue;
    const d = Math.hypot(px - me.x, pz - me.z); if (d < bd) { bd = d; best = { x: px, z: pz }; }
  }
  return best ? stickTo(me, best.x, best.z, sk, { arrive: 0 }) : stickFrom(me, x, z, sk);
}
/** A stick away from the nearest noticed threat I am inside, or null. */
function danger(g, me, mem, v, sk, rng) {
  for (const r of g.rg || []) {
    if (Math.hypot(me.x - r[1], me.z - r[2]) < r[3] + 0.7 && noticed(mem, 'r' + r[0], v.t, sk, rng)) { if (slip(sk, rng, 0.08)) return null; return escape(me, r[1], r[2], r[3], sk); }
  }
  if (g.pf && inPuff(me.x, me.z, g.bx, g.bz, g.pf[1]) && noticed(mem, 'p' + g.pf[0], v.t, sk, rng)) {
    const a = g.pf[1] + (Math.sin(g.pf[1]) * (me.z - g.bz) - Math.cos(g.pf[1]) * (me.x - g.bx) > 0 ? -1 : 1) * Math.PI / 2;   // sideways, out of the wedge
    return { mx: Math.sin(a) * sk.speed, mz: Math.cos(a) * sk.speed };
  }
  return null;
}
