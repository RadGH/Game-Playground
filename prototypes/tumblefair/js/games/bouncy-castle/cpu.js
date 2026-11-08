// Bouncy Castle CPU: stays away from the edges, walks up to whoever is nearest the edge (a fling there sends them off),
// and BOUNCES once it is close; belly-bumps someone right in front of it. When another bouncer is coming down next to
// it, it hops to stay safe (Tricky nearly always notices, Family rarely). Bop-bag clowns count as targets.
import { thinker, stickTo, by, noisy, slip, A, B } from '../cpu-kit.js';
import { RULES, meta } from './sim.js';

const STUN = 2, OUT = 1, AIR = 16;
export function createCpu(c) {
  const think = thinker(c), sk = c.skill, mem = {}, AR = meta.arena;
  const edgeGap = p => Math.min(AR.hw - Math.abs(p.x), AR.hd - Math.abs(p.z));
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g || g.cd || (me.flags & (STUN | OUT))) return null;
      // someone in the air near me: hop as they come down
      const fall = [...(v.bodies || [])].find(([p, b]) => p !== c.pid && (b.flags & AIR) && b.y > 0.2 && Math.hypot(b.x - me.x, b.z - me.z) < RULES.waveR + 0.5);
      if (fall && !(me.flags & AIR)) {
        const key = 'dodge' + fall[0];
        if (mem.seen !== key) { mem.seen = key; mem.dodge = c.rng() < by(sk, [0.25, 0.55, 0.8]); }
        if (mem.dodge && fall[1].y < 1.3) { mem.dodge = false; return { mx: 0, mz: 0, b: A }; }
      }
      return think(v, () => {
        if (edgeGap(me) < 1.1) return stickTo(me, 0, 0, sk);                // too close to the edge: back to the middle
        const targets = [...(v.bodies || [])].filter(([p, b]) => p !== c.pid && !(b.flags & OUT)).map(([, b]) => b);
        for (const t of g.tg || []) if (!(t[4] & OUT)) targets.push({ x: t[1], z: t[2] });
        if (!targets.length) return stickTo(me, 0, 0, sk, { mag: 0.4 });
        // the best target: near me AND near an edge
        const scored = targets.map(t => [t, Math.hypot(t.x - me.x, t.z - me.z) + edgeGap(t) * by(sk, [0, 0.8, 1.4])]).sort((a, b) => a[1] - b[1]);
        const t = (slip(sk, c.rng, 0.5) ? scored[scored.length - 1] : scored[0])[0], d = Math.hypot(t.x - me.x, t.z - me.z);
        // stand on the middle side of it, so the fling goes outward
        const cx = t.x * 0.75, cz = t.z * 0.75, inner = Math.hypot(t.x - cx, t.z - cz) || 1;
        const sx = t.x - (t.x - cx) / inner * 1.1, sz = t.z - (t.z - cz) / inner * 1.1;
        if (d < by(sk, [1.3, 1.7, 1.9]) && c.rng() < by(sk, [0.45, 0.7, 0.85])) return { ...stickTo(me, t.x, t.z, sk), b: d < 1.2 && c.rng() < 0.4 ? B : A };
        return stickTo(me, noisy(sx, 0.8, sk, c.rng), noisy(sz, 0.8, sk, c.rng), sk);
      });
    },
  };
}
