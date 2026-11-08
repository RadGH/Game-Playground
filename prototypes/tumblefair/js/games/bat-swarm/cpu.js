// Bat Swarm CPU: walks to the best sweet it can reach (lollipops count triple, nearer is better, skipping one a rival is
// far closer to) and keeps out of the purple stripes: once it has noticed a warning it works out when the flock will
// cross each spot and steps aside in time (into a wall's gap). Family notices late, keeps a thin margin and dawdles;
// Tricky reacts fast, keeps a safe margin and dashes out when the way out is long.
import { thinker, stickTo, by, slip, reacted, A } from '../cpu-kit.js';
import { meta, RULES } from './sim.js';

const STUN = 2, FROZEN = 8, { hw, hd } = meta.arena;
export function createCpu(c) {
  const sk = c.skill, think = thinker(c), mem = { waves: new Map() };
  const pad = by(sk, [0.2, 0.35, 0.45]), speed = (c.init?.batSpeed ?? 7.5) * 0.85, walk = meta.move.speed * sk.speed;
  // a stripe is dangerous at a spot from when the front of the flock reaches it until its tail has gone by
  function window(w, r, x, z) {
    const along = r[4] ? x * r[4] + hw : z * r[5] + hd;            // metres from the edge the bats come in from
    return [w.swoop + (along + 0.6) / (speed / 0.85), w.swoop + (along + 6.5) / speed];
  }
  function danger(x, z, t0, t1) {                                     // is (x, z) hit between t0 and t1?
    for (const w of mem.waves.values()) for (const r of w.rects) {
      if (Math.abs(x - r[0]) > r[2] + pad || Math.abs(z - r[1]) > r[3] + pad) continue;
      const [a, b] = window(w, r, x, z); if (a < t1 && b > t0) return true;
    }
    return false;
  }
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g || (me.flags & FROZEN)) return null;
      for (const [id, warn, rects] of g.w || []) if (!mem.waves.has(id) && reacted(mem, 'w' + id, v.t, sk, c.rng, 0.8)) mem.waves.set(id, { swoop: v.t + warn, rects });
      for (const [id, w] of mem.waves) if (v.t > w.swoop + 6) mem.waves.delete(id);
      if (me.flags & STUN) return null;
      return think(v, () => {
        if (danger(me.x, me.z, v.t, v.t + 1.3) && !slip(sk, c.rng, 0.5)) {
          let best = null, bd = 99;                                   // the nearest spot that will be clear when I get there
          for (let rr = 0.7; rr <= 10 && !best; rr += 0.7) for (let k = 0; k < 16; k++) {
            const a = k * Math.PI / 8, x = me.x + Math.sin(a) * rr, z = me.z + Math.cos(a) * rr;
            if (Math.abs(x) > hw - 0.5 || Math.abs(z) > hd - 0.5) continue;
            if (danger(x, z, v.t + rr / walk, v.t + rr / walk + 1.5)) continue;
            if (rr < bd) { bd = rr; best = { x, z }; }
          }
          if (best) return { ...stickTo(me, best.x, best.z, sk, { arrive: 0 }), b: bd > 2.5 && c.rng() < by(sk, [0, 0.3, 0.6]) ? A : 0 };
        }
        const rivals = [...v.bodies].filter(([p]) => p !== c.pid).map(([, b]) => b);
        let pick = null, ps = -1;                                     // sweets: value over distance
        for (const [, x, z, kind, wait] of g.c || []) {
          const d = Math.hypot(x - me.x, z - me.z), val = kind ? RULES.bigPts : 1;
          if (danger(x, z, v.t, v.t + d / walk + 0.8)) continue;
          if (c.rng() < sk.q * 0.7 && rivals.some(b => Math.hypot(b.x - x, b.z - z) < d * 0.6 - 0.5)) continue;
          const s = val / (d + 1.5) * (wait ? 0.7 : 1) * (1 + (c.rng() - 0.5) * (1 - sk.q));
          if (s > ps) { ps = s; pick = { x, z }; }
        }
        return pick ? stickTo(me, pick.x, pick.z, sk, { arrive: 0 }) : null;
      });
    },
  };
}
