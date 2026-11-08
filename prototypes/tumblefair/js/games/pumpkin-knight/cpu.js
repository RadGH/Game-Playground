// Pumpkin Knight CPU (co-op): chases the loose head (or where a lobbed one will land), gets round behind it and kicks
// it toward the cauldron; when the knight kneels it runs over and bonks; it steps out of a sword wedge it has noticed.
// Family lines up loosely (kicks go wide), notices the wedge late and bonks slowly; Tricky is tidy and quick.
import { thinker, stickTo, by, slip, noisy, A } from '../cpu-kit.js';
import { angDiff } from '../boss-kit.js';
import { POT, RULES } from './sim.js';

const STUN = 2;
export function createCpu(c) {
  const sk = c.skill, think = thinker(c), mem = {};
  return {
    tick(v) {
      const me = v.me, g = v.g; if (!me || !g?.kn || (me.flags & STUN)) return null;
      return think(v, () => {
        const [kx, kz, , ph] = g.kn, [hx, hz] = g.hd;
        // a sword wedge filling up with me in it: step out (once noticed)
        if (g.sw) {
          const d = Math.hypot(me.x - kx, me.z - kz), a = Math.atan2(me.x - kx, me.z - kz);
          const key = 'sw' + Math.round(g.sw[0] * 100);
          if (d < RULES.swingR + 0.8 && Math.abs(angDiff(a, g.sw[0])) < RULES.swingArc + 0.35 && (mem.sw === key ? v.t >= mem.swAt : (mem.sw = key, mem.swAt = v.t + sk.react * by(sk, [1.2, 0.9, 0.7]), false))) {
            const side = angDiff(a, g.sw[0]) >= 0 ? 1 : -1, out = g.sw[0] + side * (RULES.swingArc + 0.8);
            return stickTo(me, kx + Math.sin(out) * 3.2, kz + Math.cos(out) * 3.2, sk, { arrive: 0 });
          }
        }
        if (ph === 'kneel') {
          const d = Math.hypot(me.x - kx, me.z - kz);
          if (d < RULES.reach * 0.95) return { ...stickTo(me, kx, kz, sk, { arrive: 2 }), b: c.rng() < by(sk, [0.45, 0.65, 0.85]) ? A : 0 };
          return stickTo(me, kx, kz, sk, { arrive: 0 });
        }
        if (g.lob) return stickTo(me, g.lob[0], g.lob[1], sk, { arrive: 0.6 });
        if (g.hd[3]) return stickTo(me, noisy(kx, 2, sk, c.rng), noisy(kz + 2.5, 1, sk, c.rng), sk, { arrive: 1 });   // knight holds it: wait near
        // get behind the head (on the far side from the pot) and kick it toward the pot
        let dx = POT.x - hx, dz = POT.z - hz; const dp = Math.hypot(dx, dz) || 1; dx /= dp; dz /= dp;
        const bx = hx - dx * 0.8, bz = hz - dz * 0.8, dh = Math.hypot(me.x - hx, me.z - hz);
        const behind = ((me.x - hx) * dx + (me.z - hz) * dz) < -0.2;
        if (dh < RULES.kickR * 0.95 && (behind || slip(sk, c.rng, 0.6))) {
          const aim = Math.atan2(dx, dz) + (c.rng() * 2 - 1) * by(sk, [0.7, 0.4, 0.25]);
          return { mx: Math.sin(aim) * 0.3, mz: Math.cos(aim) * 0.3, b: A };
        }
        if (!behind && dh < 2) {                                      // walk round it, not through it
          const side = ((me.x - hx) * dz - (me.z - hz) * dx) >= 0 ? 1 : -1;
          return stickTo(me, hx + dz * side * 1.3 - dx * 0.6, hz - dx * side * 1.3 - dz * 0.6, sk, { arrive: 0 });
        }
        return stickTo(me, noisy(bx, 0.3, sk, c.rng), noisy(bz, 0.3, sk, c.rng), sk, { arrive: 0.2 });
      });
    },
  };
}
