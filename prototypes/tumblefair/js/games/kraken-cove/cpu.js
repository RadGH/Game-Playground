// Kraken Cove CPU (co-op): once it has noticed a tentacle's red warning (after its reaction time) it steps clear —
// sideways off a slam strip, in toward the middle out of a sweep band — and otherwise runs to the nearest resting
// tentacle that is not inside a warning and whacks it. Family notices late and sometimes freezes; Tricky is quick.
import { thinker, stickTo, by, slip, noisy, A } from '../cpu-kit.js';
import { segDist, angDiff } from '../boss-kit.js';
import { strip, RULES } from './sim.js';

const R = 7.2, STUN = 2;
export function createCpu(c) {
  const sk = c.skill, think = thinker(c), seen = new Map();
  // is (x, z) inside the area a winding-up / striking tentacle t will hit? (margin m)
  const inDanger = (t, x, z, m = 0.5) => {
    if (t.kind === 'slam') { const s = strip(t.a); return segDist(x, z, s.ax, s.az, s.bx, s.bz) < RULES.halfW + 0.3 + m; }
    if (Math.hypot(x, z) < R - RULES.bandIn - 0.3 - m) return false;
    const ang = Math.atan2(x, z), lo = Math.min(t.a0, t.a1) - 0.15 - m / R, hi = Math.max(t.a0, t.a1) + 0.15 + m / R, rel = t.a0 + angDiff(ang, t.a0);
    return rel >= lo && rel <= hi;
  };
  return {
    tick(v) {
      const me = v.me, g = v.g; if (!me || !g || (me.flags & STUN)) return null;
      return think(v, () => {
        const tn = (g.tn || []).map(r => ({ id: r[0], a: r[1], kind: r[2] ? 'sweep' : 'slam', ph: r[3], at: r[6], a0: r[9], a1: r[10] }));
        // threats I have noticed (a warning shows for a reaction time before I move)
        const threats = tn.filter(t => (t.ph === 'wind' || t.ph === 'strike') && (seen.has(t.id) ? v.t >= seen.get(t.id) : (seen.set(t.id, v.t + sk.react * (0.7 + c.rng() * 0.6) * by(sk, [1.3, 1, 0.8])), false)));
        const danger = threats.find(t => inDanger(t, me.x, me.z));
        if (danger) {
          if (slip(sk, c.rng, 0.5)) return null;                                   // froze
          if (danger.kind === 'sweep') return stickTo(me, 0, 0, sk, { arrive: 0 });
          const s = strip(danger.a), ex = s.bx - s.ax, ez = s.bz - s.az, L = Math.hypot(ex, ez), side = ((me.x - s.ax) * ez - (me.z - s.az) * ex) >= 0 ? 1 : -1;
          return stickTo(me, me.x + ez / L * side * 3, me.z - ex / L * side * 3, sk, { arrive: 0 });
        }
        const rest = tn.filter(t => t.ph === 'rest').map(t => {
          const s = strip(t.at), k = 0.45, px = s.ax + (s.bx - s.ax) * k, pz = s.az + (s.bz - s.az) * k;
          const ex = s.bx - s.ax, ez = s.bz - s.az, L = Math.hypot(ex, ez), side = ((me.x - s.ax) * ez - (me.z - s.az) * ex) >= 0 ? 1 : -1;
          return { t, x: px + ez / L * side * 0.8, z: pz - ex / L * side * 0.8, s };
        }).filter(o => !threats.some(t => inDanger(t, o.x, o.z, 0.2)));
        if (rest.length) {
          rest.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
          const o = rest[0], d = segDist(me.x, me.z, o.s.ax, o.s.az, o.s.bx, o.s.bz);
          if (d < RULES.reach * by(sk, [0.95, 0.9, 0.85])) return { ...stickTo(me, o.x, o.z, sk, { arrive: 0.5 }), b: c.rng() < by(sk, [0.45, 0.6, 0.85]) ? A : 0 };   // mashing, at a person's pace
          return stickTo(me, noisy(o.x, 0.3, sk, c.rng), noisy(o.z, 0.3, sk, c.rng), sk, { arrive: 0.3 });
        }
        return stickTo(me, noisy(0, 1.2, sk, c.rng), noisy(0, 1.2, sk, c.rng), sk, { arrive: 1 });   // wait in the middle
      });
    },
  };
}
