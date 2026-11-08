// Rope Bridge Panic CPU (co-op): keeps walking up the course, hops the holes in the planks just before reaching
// them, leans against the bridge's tilt and the wind warning, and keeps off a team-mate's plank. Family hops with
// sloppier timing, leans late and sometimes dawdles; Tricky times hops well and reads the wind arrows early.
import { thinker, by, gauss, slip } from '../cpu-kit.js';

const GHOST = 32, FROZEN = 8, AIR = 16;
export function createCpu(c) {
  const sk = c.skill, rng = c.rng, think = thinker(c), mem = {};
  const course = c.init.course, PL = c.init.R?.PL ?? 0.75;
  const spans = course.segs.filter(s => s.k === 'span');
  const lean = by(sk, [0.7, 1.1, 1.3]), windRead = by(sk, [0.3, 0.7, 0.9]), hopErr = by(sk, [0.14, 0.09, 0.06]);
  const home = (c.seat % 2 ? 1 : -1) * 0.35 * (c.players.length > 1 ? 1 : 0);
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g?.sp || (me.flags & (GHOST | FROZEN)) || g.pr?.[c.pid]?.[1]) return null;
      const span = spans.find(s => me.z <= s.z0 + 0.6 && me.z > s.z1);        // the bridge I am on (or about to step on)
      const out = think(v, () => {
        let push = sk.speed, x = home;
        if (span) {
          const [T, dir] = g.sp[span.i], planks = g.sp[span.i][3];
          // lean: stand on the side that pulls the tilt back, more with a gust on its way
          const want = T + (dir && rng() < windRead ? dir * 0.9 : 0);
          x = Math.max(-1, Math.min(1, home - want * lean));
          // a team-mate on the plank just ahead: step round them
          for (const [p, o] of v.bodies) if (p !== c.pid && Math.abs(o.z - me.z) < 0.9 && Math.abs(o.x - x) < 0.6) x = Math.max(-1, Math.min(1, o.x + (x >= o.x ? 0.7 : -0.7)));
          if (slip(sk, rng, 0.15)) push *= 0.5;                                  // a nervous step
        }
        const mx = Math.max(-0.7, Math.min(0.7, (x - me.x) * 1.6));
        return { mx, mz: -Math.sqrt(Math.max(0.1, push * push - mx * mx)) };
      });
      // a hole ahead: watched all the time (like a person staring at the planks); hop just before it, timing from skill
      const fresh = !mem.pressed; mem.pressed = false;                         // a press needs a release between
      if (span && !(me.flags & AIR) && fresh) {
        const planks = g.sp[span.i][3], j = Math.floor((span.z0 - me.z) / PL);
        for (let k = Math.max(0, j); k <= j + 2 && k < planks.length; k++) {
          if (planks[k] !== '-') continue;
          const toHole = me.z - (span.z0 - k * PL);                            // metres until I reach its near edge
          mem.hopAt ??= 0.35 + gauss(rng) * hopErr;
          if (toHole <= mem.hopAt) { mem.hopAt = null; mem.pressed = true; mem.hopT = v.t; return { mx: out.mx * 0.5, mz: -sk.speed, b: 1 }; }
          break;
        }
      }
      if (me.flags & AIR) return { mx: out.mx * 0.5, mz: -sk.speed, b: 0 };     // mid-hop: keep going forward
      if (v.t < (mem.hopT ?? -9) + 0.62) return { mx: out.mx, mz: -0.15, b: 0 };   // just landed: shuffle until I can hop again
      return out;
    },
  };
}
