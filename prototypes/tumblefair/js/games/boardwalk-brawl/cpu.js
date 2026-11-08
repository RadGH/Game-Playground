// Boardwalk Brawl CPU: walks up beside the nearest roughneck (level with it, an arm's length away), faces it and
// punches; jump-kicks into one a few steps off now and then, sidesteps a wind-up it notices, picks up a downed friend
// when the coast is clear, and walks right when the street is free. Family notices wind-ups late and lines up sloppily.
import { thinker, stickTo, by, slip, noisy, A, B } from '../cpu-kit.js';
import { ST, W, HD } from './sim.js';

const FROZEN = 8, OUT_OF_PLAY = new Set([ST.fly, ST.down, ST.dead]);
export function createCpu(c) {
  const sk = c.skill, think = thinker(c, { every: by(sk, [0.3, 0.2, 0.16]) * (0.85 + c.rng() * 0.3) }), mem = {};
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g || (me.flags & FROZEN) || me.y > 0.01) return null;
      return think(v, () => {
        const foes = (g.e || []).map(e => ({ id: e[0], x: e[2], z: e[3], st: e[6] })).filter(e => !OUT_OF_PLAY.has(e.st));
        const near = foes.map(e => ({ e, d: Math.hypot(e.x - me.x, e.z - me.z) })).sort((a, b) => a.d - b.d);
        // a friend down and nothing right on top of me: go pick them up
        const downed = Object.entries(g.hp || {}).filter(([p, h]) => +p !== c.pid && h <= 0).map(([p]) => v.bodies.get(+p)).filter(Boolean);
        if (downed.length && (!near.length || near[0].d > 2.5) && c.rng() < by(sk, [0.5, 0.8, 0.95])) return stickTo(me, downed[0].x, downed[0].z, sk, { arrive: 0.6 });
        if (!near.length) return stickTo(me, Math.min(g.w + W - 2, me.x + 6), 0, sk);
        const { e } = near[0];
        // dodge a wind-up I have noticed
        const winding = near.find(n => n.d < 2.6 && (n.e.st === ST.wind || n.e.st === ST.windSlam || n.e.st === ST.windCharge));
        if (winding && c.rng() < by(sk, [0.15, 0.4, 0.6])) {
          const away = me.z > winding.e.z ? 1 : -1, z = Math.abs(me.z + away * 1.6) < HD - 0.5 ? me.z + away * 1.6 : me.z - away * 1.6;
          return stickTo(me, me.x + Math.sign(me.x - winding.e.x) * 1.2, z, sk);
        }
        let side = Math.sign(me.x - e.x) || -1;                                         // take the side a friend is not already on
        const taken = sd => [...v.bodies].some(([p, b]) => p !== c.pid && !(b.flags & FROZEN) && Math.hypot(b.x - (e.x + sd), b.z - e.z) < 0.8);
        if (taken(side) && !taken(-side) && c.rng() < by(sk, [0.4, 0.7, 0.85])) side = -side;
        const dx = e.x - me.x, dz = e.z - me.z;
        if (Math.abs(dz) < by(sk, [0.75, 0.6, 0.55]) && Math.abs(dx) < 1.45 && Math.abs(dx) > 0.3) {
          if (slip(sk, c.rng, 0.6)) return null;                                      // stands there a moment
          return { mx: Math.sign(dx) * 0.2, mz: 0, b: A };                            // face it, punch
        }
        if (Math.abs(dz) < 0.6 && Math.abs(dx) > 2 && Math.abs(dx) < 3.4 && c.rng() < by(sk, [0.1, 0.2, 0.25]))
          return { mx: Math.sign(dx) * 0.4, mz: 0, b: B };                             // jump kick in
        return stickTo(me, noisy(e.x + side * 1.0, 0.3, sk, c.rng), noisy(e.z, 0.3, sk, c.rng), sk, { arrive: 0.25 });
      });
    },
  };
}
