// Bumper Boats CPU: keeps clear of the whirlpool, paddles round to the far side of a rival boat (so the middle is
// behind it) and squirts it toward the drain or a bubbling fountain, and grabs ducks that float close. Family lines
// shots up loosely and squirts at anything in range; Tricky waits for a good line and plays the fountains too.
import { thinker, stickTo, blend, by, noisy, slip, nearest, A } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, think = thinker(c), mem = {};
  return {
    tick(v) {
      const me = v.me, g = v.g; if (!me || !g || g.cd || (me.flags & (1 | 2 | 8 | 16))) return null;
      const R = v.init.rules;
      return think(v, () => {
        const dc = Math.hypot(me.x, me.z) || 1;
        // the whirlpool first: paddle out (against the swirl) when it has us
        if (dc < R.range + by(sk, [0.2, 0.7, 1.0])) return blend(sk, [{ mx: me.x / dc, mz: me.z / dc }, 1], [{ mx: -me.z / dc, mz: me.x / dc }, 0.35]);
        const fts = v.init.fountains.map((a0, i) => { const a = a0 + R.spin * g.el; return { x: Math.sin(a) * R.ring, z: Math.cos(a) * R.ring, st: g.fs[i] }; });
        const targets = [...v.bodies].filter(([p, b]) => p !== c.pid && !(b.flags & (1 | 16))).map(([, b]) => b);
        for (const r of g.cpu || []) if (!(r[4] & (1 | 16))) targets.push({ x: r[1], z: r[2] });
        // a shot: how well would squirting t push it into trouble?
        const shot = t => {
          const dx = t.x - me.x, dz = t.z - me.z, d = Math.hypot(dx, dz); if (d > R.squirt * 0.95 || d < 0.3) return -9;
          const td = Math.hypot(t.x, t.z) || 1;
          let s = (-(t.x * dx + t.z * dz) / (td * d)) * (1 - Math.min(1, (td - R.core) / 6));         // toward the drain
          if (sk.level > 0) for (const f of fts) if (f.st === 1) { const fx = f.x - t.x, fz = f.z - t.z, fd = Math.hypot(fx, fz) || 1; if (fd < 3) s = Math.max(s, (fx * dx + fz * dz) / (fd * d) * 0.9); }
          return s;
        };
        let best = null, bs = by(sk, [-0.3, 0.05, 0.1]);
        for (const t of targets) { const s = shot(t); if (s > bs) { bs = s; best = t; } }
        if (best && !slip(sk, c.rng, 0.5)) {
          const yaw = noisy(Math.atan2(best.x - me.x, best.z - me.z), 0.25, sk, c.rng);
          return { mx: Math.sin(yaw), mz: Math.cos(yaw), b: A };
        }
        const dk = nearest(me, (g.dk || []).map(d => ({ x: d[1], z: d[2] })));
        if (dk.item && dk.d < by(sk, [2, 3, 3.5])) return stickTo(me, dk.item.x, dk.item.z, sk, { arrive: 0 });
        // line up: the far side of the nearest rival, out from the middle
        const t = nearest(me, targets).item;
        if (!t) return stickTo(me, -me.z * 0.5, me.x * 0.5, sk);
        const td = Math.hypot(t.x, t.z) || 1, k = Math.min(7.6, td + 2.4);
        if (!mem.spot || v.t > mem.until) { mem.spot = { x: noisy(t.x / td * k, 1, sk, c.rng), z: noisy(t.z / td * k, 1, sk, c.rng) }; mem.until = v.t + 0.8; }
        return stickTo(me, mem.spot.x, mem.spot.z, sk, { arrive: 0.8 });
      });
    },
  };
}
