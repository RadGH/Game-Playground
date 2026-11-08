// Patchwork Pal CPU: memorises where the parts sit while the finished face is shown (each spot remembered a few
// units off, more for a weak memory), then pins each part as it comes back — on the face as it is hung now, after a
// moment to find the spot. A slip forgets the part and pins it where that part usually goes. Family remembers loosely.
import { by, noisy, slip, clamp, later, readDelay, gauss } from '../cpu-kit.js';
import { moved, PARTS, HEAD, BW, BH } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.phase === 'show' && g.parts && mem.r !== g.round) {
        mem.r = g.round;
        mem.spots = Object.fromEntries(g.parts.map(p => [p.k, slip(sk, c.rng, 0.4) ? null : [p.x + gauss(c.rng) * by(sk, [7.5, 5.5, 4.6]), p.y + gauss(c.rng) * by(sk, [7.5, 5.5, 4.6])]]));
      }
      if (g.phase !== 'place' || mem.r !== g.round || g.placed?.includes(c.pid)) return;
      later(mem, v, 'pin' + g.round + ':' + g.n, () => {
        const P = PARTS[g.cur], seen = mem.spots?.[g.cur];
        const at = seen || [HEAD[0] + (P?.at[0] || 0) * (g.cf ? -1 : 1) + noisy(0, 8, sk, c.rng), HEAD[1] + (P?.at[1] || 0)];
        const p = moved(at, g.hang);
        v.act('pin', { n: g.n, p: [clamp(Math.round(p[0] * 10) / 10, 0, BW), clamp(Math.round(p[1] * 10) / 10, 0, BH)] });
      }, readDelay(sk, c.rng, by(sk, [1.1, 0.8, 0.6])));
    },
  };
}
