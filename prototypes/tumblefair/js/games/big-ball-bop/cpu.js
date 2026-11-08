// Big Ball Bop CPU: whoever on its team is nearer the ball goes for it — it runs round to the far side of the ball
// (the side away from the goal it shoots at), then runs THROUGH it toward that goal and belly-bumps (A) when the ball is
// right in front; the other one hangs back between the ball and its own goal. Now and then it lunges at an opponent
// standing next to it. Family reacts late, lines up sloppily and bumps at the wrong moment; Tricky leads the rolling
// ball. It sees only the ball, the bodies and the score, like a phone.
import { thinker, stickTo, by, noisy, slip, A } from '../cpu-kit.js';
import { RULES, goalX } from './sim.js';

const FROZEN = 8, STUN = 2;
export function createCpu(c) {
  const sk = c.skill, rng = c.rng, think = thinker(c), mem = {};
  const myTeam = c.init?.teams?.[c.pid] ?? c.seat % 2, gx = goalX(myTeam), own = -gx;
  const R = RULES.R, reach = R + 0.45 + RULES.kickR - 0.25;
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g || g.ph !== 'play' || (me.flags & (FROZEN | STUN))) return null;
      return think(v, () => {
        const [bx0, bz0, bh, bvx, bvz] = g.b, lead = bh > 1.5 ? 0.5 : by(sk, [0.05, 0.25, 0.4]);
        const bx = bx0 + bvx * lead, bz = bz0 + bvz * lead;
        // am I the one going for it? (the nearest of my team, with a little stickiness)
        const mates = [...(v.bodies || [])].filter(([p]) => p !== c.pid && (c.init?.teams?.[p] ?? -1) === myTeam);
        const myD = Math.hypot(me.x - bx, me.z - bz), mateD = Math.min(Infinity, ...mates.map(([, b]) => Math.hypot(b.x - bx, b.z - bz)));
        const chase = myD <= mateD + (mem.chasing ? 1.2 : -0.4); mem.chasing = chase;
        if (!chase) {                                   // hang back: between the ball and my own goal
          const x = own * 0.55 + bx * 0.45, z = bz * 0.6;
          return stickTo(me, noisy(x, 0.8, sk, rng), noisy(z, 0.8, sk, rng), sk, { arrive: 0.8 });
        }
        // line up behind the ball (the side away from the goal I shoot at)
        const tz = Math.max(-RULES.goalW + 0.8, Math.min(RULES.goalW - 0.8, bz * 0.3));
        let ux = gx - bx, uz = tz - bz; const L = Math.hypot(ux, uz) || 1; ux /= L; uz /= L;
        const behind = { x: bx - ux * (R + 0.8), z: bz - uz * (R + 0.8) };
        const along = (me.x - bx) * ux + (me.z - bz) * uz;          // > 0: I am on the goal side of the ball (wrong side)
        const side = (me.x - bx) * -uz + (me.z - bz) * ux;
        const err = by(sk, [0.7, 0.4, 0.25]);
        if (along > -0.4) {                                          // go round it, not through it the wrong way
          const s = side >= 0 ? 1 : -1, wx = bx - ux * 0.4 + -uz * s * (R + 1.2), wz = bz - uz * 0.4 + ux * s * (R + 1.2);
          return stickTo(me, Math.max(-9.4, Math.min(9.4, wx)), Math.max(-5.4, Math.min(5.4, wz)), sk, { arrive: 0 });
        }
        const lined = Math.abs(side) < 0.6 + err && myD < reach + 0.6;
        if (lined && bh < 1.6 && !slip(sk, rng, 0.35)) {             // bop it
          const st = stickTo(me, bx + ux * 2, bz + uz * 2, sk, { arrive: 0 });
          return { ...st, b: A };
        }
        // a quick lunge at an opponent right in front of me, now and then
        for (const [p, b] of v.bodies || []) {
          if (p === c.pid || (c.init?.teams?.[p] ?? myTeam) === myTeam) continue;
          const dx = b.x - me.x, dz = b.z - me.z, d = Math.hypot(dx, dz);
          if (d < 1.0 && rng() < by(sk, [0.03, 0.06, 0.08])) return { ...stickTo(me, b.x, b.z, sk, { arrive: 0 }), b: A };
        }
        if (Math.hypot(me.x - behind.x, me.z - behind.z) > 0.7) return stickTo(me, noisy(behind.x, 0.5, sk, rng), noisy(behind.z, 0.5, sk, rng), sk, { arrive: 0 });
        return stickTo(me, bx + ux * 2, bz + uz * 2, sk, { arrive: 0 });   // run through it toward the goal
      });
    },
  };
}
