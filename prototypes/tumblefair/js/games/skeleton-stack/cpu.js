// Skeleton Stack CPU: walks to the nearest bone of the piece its headstone asks for, grabs it, carries it home, and
// drops a wrong one it picked up by mistake. Bonks a rival carrying a bone who is right in front of it. Family
// picks the nearer bone of any kind sometimes and wanders off; Tricky goes for the closest right bone and bonks more.
import { thinker, stickTo, by, noisy, slip, nearest, A, B } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, think = thinker(c, { every: by(sk, [0.26, 0.2, 0.15]) }), mem = {}, mag = by(sk, [0.89, 0.9, 0.92]);
  const go = (me, x, z, o) => stickTo(me, x, z, sk, { mag, ...o });
  return {
    tick(v) {
      const me = v.me, g = v.g; if (!me || !g || !g.st || (me.flags & 2)) return null;
      return think(v, () => {
        const [px, pz] = v.init.plots[v.init.owners[c.pid]], [stage] = g.st[c.pid], carry = g.ca[c.pid];
        // bonk someone carrying, close and roughly in front
        for (const [p, b] of v.bodies) {
          if (p === c.pid || g.ca[p] < 0) continue;
          const d = Math.hypot(b.x - me.x, b.z - me.z);
          if (d < 1.3 && c.rng() < by(sk, [0.15, 0.3, 0.35])) return { ...stickTo(me, b.x, b.z, sk), b: B };
        }
        if (carry >= 0 && carry !== stage) return { ...stickTo(me, me.x, me.z, sk), b: A };      // wrong piece: drop it
        if (carry === stage) return go(me, px, pz, { arrive: 0 });
        if (mem.lost && v.t < mem.lost) return go(me, mem.to.x, mem.to.z);
        if (slip(sk, c.rng, 0.12)) { mem.lost = v.t + sk.react; mem.to = { x: noisy(me.x, 4, sk, c.rng), z: noisy(me.z, 4, sk, c.rng) }; }
        const bones = (g.b || []).map(b => ({ id: b[0], kind: b[1], x: b[2], z: b[3] }));
        const pickAny = c.rng() < by(sk, [0.03, 0.02, 0]);
        const nb = nearest(me, bones, b => b, b => pickAny || b.kind === stage);
        if (!nb.item) return go(me, px, pz);
        if (nb.d < 1.0) return { mx: 0, mz: 0, b: A };
        return go(me, nb.item.x, nb.item.z, { arrive: 0 });
      });
    },
  };
}
