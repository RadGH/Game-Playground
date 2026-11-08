// Balloon Stampede CPU: heads for the best balloon of its own colour (or a golden one) that it can reach without
// brushing other colours, steering round the wrong ones, and sometimes dashes a rival standing close. Family picks
// sloppily, steers round wrong balloons late and rarely dashes; Tricky plans cleaner paths and barges more often.
import { thinker, stickTo, by, noisy, slip, pickBest, A } from '../cpu-kit.js';

const STUN = 2, GOLD = 4;
export function createCpu(c) {
  const sk = c.skill, think = thinker(c, { every: by(sk, [0.24, 0.2, 0.18]) }), rng = c.rng, mem = { dashAt: 0 };
  const seat = (c.init?.seats || []).find(s => s[0] === c.pid)?.[1] ?? c.seat;
  const care = by(sk, [0.8, 0.8, 0.75]);                      // how hard it steers round wrong colours
  const mag = by(sk, [0.88, 0.9, 0.92]);                      // a race to the balloons: the push matters most
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g?.bl || (me.flags & STUN)) return null;
      return think(v, () => {
        const good = [], bad = [];
        for (const [id, x, z, col] of g.bl) (col === seat || col === GOLD ? good : bad).push({ id, x, z, col });
        // a rival close by: barge them (into whatever is behind them)
        const riv = [...v.bodies].filter(([p, b]) => p !== c.pid && !(b.flags & STUN)).map(([, b]) => b)
          .find(b => Math.hypot(b.x - me.x, b.z - me.z) < 1.6);
        if (riv && v.t >= mem.dashAt && rng() < by(sk, [0.08, 0.2, 0.3])) { mem.dashAt = v.t + 2; return { ...stickTo(me, riv.x, riv.z, sk), b: A }; }
        // the target: worth / distance, less if wrong balloons sit near the way there
        const blocked = t => bad.filter(b => segD(b.x, b.z, me.x, me.z, t.x, t.z) < 0.9).length;
        const tgt = slip(sk, rng, 0.4) && mem.tgt ? mem.tgt : pickBest(good, t => (t.col === GOLD ? 3 : 1) / (Math.hypot(t.x - me.x, t.z - me.z) + 1) / (1 + blocked(t) * care * 1.5), sk, rng);
        mem.tgt = tgt;
        const to = tgt ? stickTo(me, noisy(tgt.x, 0.25, sk, rng), noisy(tgt.z, 0.25, sk, rng), sk, { arrive: 0, mag }) : { mx: -me.x * 0.1, mz: -me.z * 0.1 };
        // push away from wrong balloons that are close
        const away = { mx: 0, mz: 0 };
        for (const b of bad) {
          const dx = me.x - b.x, dz = me.z - b.z, d = Math.hypot(dx, dz);
          if (d < 1.9 && d > 1e-3) { const w = (1.9 - d) / 1.9 * 2.2; away.mx += dx / d * w; away.mz += dz / d * w; }
        }
        const mx = to.mx + away.mx * care, mz = to.mz + away.mz * care, m = Math.hypot(mx, mz), k = m > mag ? mag / m : 1;
        return { mx: mx * k, mz: mz * k };
      });
    },
  };
}
/** Distance from (px, pz) to the segment (ax, az)-(bx, bz). */
function segD(px, pz, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az, L = ex * ex + ez * ez || 1e-9, t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / L));
  return Math.hypot(px - ax - ex * t, pz - az - ez * t);
}
