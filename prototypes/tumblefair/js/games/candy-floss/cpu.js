// Candy Floss Frenzy CPU: goes for the best puff in reach (gold counts triple, near counts most), banks once its cloud
// is big (Family lets it grow too big and gets bonked; Tricky banks early and often), and bonks a fat cloud that walks
// right past it. It never sees anything a phone does not: the puffs, the clouds and the tubs are all on screen.
import { thinker, stickTo, by, noisy, slip, A } from '../cpu-kit.js';
import { RULES, tubAt } from './sim.js';

const STUN = 2;
export function createCpu(c) {
  const think = thinker(c), sk = c.skill, slot = Math.max(0, c.players.findIndex(p => p.pid === c.pid)), tub = tubAt(slot);
  const bankAt = by(sk, [11, 7, 5]);
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g || g.cd || (me.flags & STUN)) return null;
      return think(v, () => {
        const held = g.fl?.[c.pid] || 0;
        // a big cloud right in front of me: bonk it
        for (const [p, b] of v.bodies || []) {
          if (p === c.pid || (b.flags & STUN)) continue;
          const theirs = g.fl?.[p] || 0, d = Math.hypot(b.x - me.x, b.z - me.z);
          if (theirs >= by(sk, [6, 4, 3]) && d < RULES.bonk.reach + theirs * RULES.bonk.perFloss - 0.2 && c.rng() < by(sk, [0.35, 0.6, 0.8])) return { ...stickTo(me, b.x, b.z, sk), b: A };
        }
        if (held >= bankAt || (held > 0 && g.left <= 4 && held >= 3 && !slip(sk, c.rng))) return stickTo(me, tub.x, tub.z, sk, { arrive: 0 });
        const puffs = (g.pf || []).map(([, x, z, val]) => ({ x, z, val }));
        if (!puffs.length) return stickTo(me, tub.x * 0.4, tub.z * 0.4, sk, { mag: 0.5 });
        const pick = puffs.map(p => [p, p.val / (0.8 + Math.hypot(p.x - me.x, p.z - me.z))]).sort((a, b) => b[1] - a[1]);
        const P = (slip(sk, c.rng, 0.6) && pick.length > 1 ? pick[1] : pick[0])[0];
        return stickTo(me, noisy(P.x, 0.4, sk, c.rng), noisy(P.z, 0.4, sk, c.rng), sk, { arrive: 0 });
      });
    },
  };
}
