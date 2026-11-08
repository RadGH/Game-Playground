// Hilltop Hold CPU: runs to the glowing hill (or the warned next one once the hop is close), stands near its middle and
// shoves anyone who walks into the zone with it. Family notices the dashed ring late, stands off-centre and often forgets
// to shove; Tricky heads for the next hill early and clears the hill quickly.
import { thinker, stickTo, by, gauss, slip, reacted, A } from '../cpu-kit.js';
import { HILLS } from './sim.js';

const STUN = 2, FROZEN = 8;
export function createCpu(c) {
  const sk = c.skill, think = thinker(c, { every: by(c.skill, [0.22, 0.2, 0.18]) }), mem = {}, zoneR = c.init?.zoneR ?? 1.9;
  const early = by(sk, [0.5, 0.65, 0.95]);          // seconds before a hop it starts for the next hill
  const shoveGap = by(sk, [1.25, 1.2, 1.15]);       // seconds between shove tries
  const run = by(sk, [0.89, 0.9, 0.91]);          // stick push (a hop is a race, so the gap is kept small)
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g || (me.flags & (STUN | FROZEN))) return null;
      return think(v, () => {
        let hill = g.z;
        if (g.nx >= 0 && mem.warned !== g.nx) { mem.warned = g.nx; const spr = by(sk, [0.8, 0.6, 0.3]); mem.early = early * (1 - spr + c.rng() * 2 * spr); }   // some hops you notice sooner
        if (g.nx >= 0 && g.w <= mem.early) hill = g.nx;
        if (hill < 0) hill = g.nx >= 0 ? g.nx : 0;
        if (!reacted(mem, 'hill' + hill, v.t, sk, c.rng, 0.45) && mem.hill != null) hill = mem.hill;   // noticing takes a moment
        if (mem.hill !== hill) { mem.hill = hill; const sp = zoneR * by(sk, [0.22, 0.17, 0.14]); mem.off = { x: gauss(c.rng) * sp, z: gauss(c.rng) * sp }; }
        // a crowded hill (two others already fighting on it): wait where the next zone is quickest to reach
        const crowd = [...v.bodies].filter(([p, b]) => p !== c.pid && Math.hypot(b.x - HILLS[hill][0], b.z - HILLS[hill][1]) < zoneR).length;
        if (crowd >= 2 && hill === g.z && Math.hypot(me.x - HILLS[hill][0], me.z - HILLS[hill][1]) > zoneR) {
          if (mem.crowdKey !== g.z) { mem.crowdKey = g.z; mem.wait = c.rng() < sk.best * 0.7; }
          if (mem.wait) { const to = g.nx >= 0 ? HILLS[g.nx] : hill === 0 ? HILLS[1 + (c.pid % 5)] : HILLS[0]; return stickTo(me, to[0], to[1], sk, { arrive: 0.5, mag: run }); }
        }
        const [hx, hz] = HILLS[hill];
        // a rival in or near the zone with me, close enough to shove?
        if (Math.hypot(me.x - hx, me.z - hz) < zoneR + 0.6) {
          let foe = null, fd = 99;
          for (const [p, b] of v.bodies) {
            if (p === c.pid || (b.flags & 1)) continue;
            const d = Math.hypot(b.x - me.x, b.z - me.z);
            if (d < fd && Math.hypot(b.x - hx, b.z - hz) < zoneR + 0.8) { fd = d; foe = b; }
          }
          let da = Math.atan2(foe?.x - me.x, foe?.z - me.z) - me.yaw; da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
          if (foe && fd < 1.6 && da > 1.3 && c.rng() < by(sk, [0, 0.5, 0.9])) return stickTo(me, foe.x, foe.z, sk, { arrive: 0, mag: run });   // turn to face first
          if (foe && fd < 1.6 && v.t >= (mem.shoveAt ?? 0) && !slip(sk, c.rng, 0.35)) {
            mem.shoveAt = v.t + shoveGap * (0.8 + c.rng() * 0.5);
            return { ...stickTo(me, foe.x, foe.z, sk, { arrive: 0, mag: run }), b: A };
          }
        }
        return stickTo(me, hx + mem.off.x, hz + mem.off.z, sk, { arrive: 0.5, mag: run });
      });
    },
  };
}
