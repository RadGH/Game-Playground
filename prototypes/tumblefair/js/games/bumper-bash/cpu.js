// Bumper Bash CPU: drives at the best thing in reach — a car it can hit from behind or the side (a spun-out car is
// left alone: it cannot be scored on), a star or a bolt that is closer than any car. Family drives slower and steers at
// where a car IS; Tricky leads its target a little (where it is going) and goes for the rear.
import { thinker, stickTo, nearest, lead, by, noisy, slip } from '../cpu-kit.js';

const STUN = 2, FROZEN = 8;
export function createCpu(c) {
  const think = thinker(c), sk = c.skill, mem = {};
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g || (me.flags & (STUN | FROZEN))) return null;
      return think(v, () => {
        const cars = [...v.bodies].filter(([p, b]) => p !== c.pid && !(b.flags & STUN)).map(([, b]) => b);
        for (const t of g.tg || []) if (!(t[4] & STUN)) cars.push({ x: t[1], z: t[2], yaw: t[3], vx: 0, vz: 0 });
        const pk = nearest(me, (g.pk || []).map(p => ({ x: p[1], z: p[2] })));
        const car = nearest(me, cars);
        if (slip(sk, c.rng, 0.6) || (!car.item && !pk.item)) { mem.to = mem.to && c.rng() < 0.7 ? mem.to : { x: noisy(0, 5, sk, c.rng), z: noisy(0, 5, sk, c.rng) }; return stickTo(me, mem.to.x, mem.to.z, sk); }
        if (pk.item && pk.d < car.d * by(sk, [0.6, 0.8, 1])) return stickTo(me, pk.item.x, pk.item.z, sk);
        const t = car.item, ahead = by(sk, [0, 0.25, 0.45]);
        const p = lead(t, ahead), back = by(sk, [0, 0.5, 1]);    // aim behind it: the rear scores 3
        const tx = p.x - Math.sin(t.yaw || 0) * back, tz = p.z - Math.cos(t.yaw || 0) * back;
        return stickTo(me, noisy(tx, 1.2, sk, c.rng), noisy(tz, 1.2, sk, c.rng), sk, { arrive: 0 });
      });
    },
  };
}
