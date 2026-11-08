// Goblin King's Crown CPU: stands beside the King and bonks him, swats a sneak that comes for it, and steps out of a
// red ring once it has noticed it. Family bonks slowly, notices rings late and trails the King after a hop; Tricky
// bonks near the cooldown, reacts fast and waits by his landing ring.
import { thinker, stickTo, stickFrom, blend, nearest, by, noisy, slip, A } from '../cpu-kit.js';

const STUN = 2, REACH = 1.75, SNEAK = 1.4;
export function createCpu(c) {
  const think = thinker(c), sk = c.skill, rng = c.rng, mem = { bonkAt: 0, seen: new Map() };
  const gap = by(sk, [0.62, 0.46, 0.4]);                     // seconds between bonks (the game's cooldown is 0.38)
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g?.k || (me.flags & STUN)) return null;
      return think(v, () => {
        const [kx, kz, , , ph] = g.k;
        // red rings: noticed after a reaction time (each ring), then get out of them
        let flee = null;
        for (const r of g.rg || []) {
          if (!mem.seen.has(r[0])) mem.seen.set(r[0], v.t + sk.react * (0.7 + rng() * 0.6));
          if (v.t < mem.seen.get(r[0])) continue;
          const d = Math.hypot(me.x - r[1], me.z - r[2]);
          if (d < r[3] + 0.7) flee = blend(sk, [flee], [stickFrom(me, r[1], r[2], sk), 1]);
        }
        if (flee && !slip(sk, rng, 0.5)) return flee;
        // a sneak coming for me: bonk it when it is close
        const sn = nearest(me, (g.mn || []).filter(m => !m[4]).map(m => ({ x: m[1], z: m[2] })));
        if (sn.item && sn.d < SNEAK + 0.6 && rng() < by(sk, [0.4, 0.7, 0.9])) {
          const out = stickTo(me, sn.item.x, sn.item.z, sk, { arrive: 0.6 });
          if (sn.d < SNEAK && v.t >= mem.bonkAt) { mem.bonkAt = v.t + gap; return { ...out, b: A }; }
          return out;
        }
        // the King: in the air, wait by where he lands (Tricky) or follow him; else stand beside him and bonk
        const land = (g.rg || []).find(r => r[6]);
        let tx = kx, tz = kz;
        if (ph === 'air' || ph === 'crouch') {
          if (land && rng() < by(sk, [0.2, 0.6, 0.9])) { tx = land[1]; tz = land[2]; }
          const d = Math.hypot(me.x - tx, me.z - tz), rr = land ? land[3] + 0.9 : 2;
          if (d < rr) return null;
          return stickTo(me, tx + (me.x - tx) / (d || 1) * rr, tz + (me.z - tz) / (d || 1) * rr, sk);
        }
        const d = Math.hypot(me.x - kx, me.z - kz);
        if (d <= REACH - 0.05) return v.t >= mem.bonkAt && !slip(sk, rng, 0.4) ? (mem.bonkAt = v.t + gap * (0.85 + rng() * 0.3), { mx: 0, mz: 0, b: A }) : null;
        return stickTo(me, noisy(kx, 0.3, sk, rng), noisy(kz, 0.3, sk, rng), sk, { arrive: 0 });
      });
    },
  };
}
