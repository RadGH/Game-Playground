// Monster Rampage CPU: picks a building worth the walk (a better CPU weighs a big bonus against the hits left), walks
// to it, mashes punch, stomps when several buildings are close, punches a tank in reach and steps out of a helicopter's
// red ring once it has noticed it. Family punches slower, stomps less, is slow to dodge and goes for the nearest.
import { thinker, stickTo, stickFrom, by, slip, A, B } from '../cpu-kit.js';
import { edge } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, think = thinker(c, { every: by(c.skill, [0.32, 0.26, 0.24]) }), mem = { stompAt: -9 };
  return {
    tick(v) {
      const me = v.me, g = v.g; if (!me || !g || !g.bs || (me.flags & (2 | 8 | 16))) return null;
      const town = v.init.town, K = v.init.kinds, hp = g.bs.split(',').map(Number);
      return think(v, () => {
        for (const h of g.hl || []) if (h[2] && Math.hypot(me.x - h[3], me.z - h[4]) < v.init.heliR + 0.8) {
          if (reactedTo(mem, 'ring' + h[3] + h[4], v.t, sk, c.rng)) return stickFrom(me, h[3], h[4], sk);
        }
        const tank = (g.tk || []).find(t => !t[3] && Math.hypot(t[0] - me.x, t[1] - me.z) < 1.4);
        if (tank && !slip(sk, c.rng)) return { ...stickTo(me, tank[0], tank[1], sk), b: A };
        const live = town.map((o, i) => i).filter(i => hp[i] > 0);
        if (!live.length) return null;
        const near = live.filter(i => edge(town[i], me.x, me.z) <= v.init.stompR).length;
        if (near >= by(sk, [3, 3, 2]) && v.t - mem.stompAt > 2.3 && c.rng() < by(sk, [0.3, 0.5, 0.6])) { mem.stompAt = v.t; return { mx: 0, mz: 0, b: B }; }
        const val = i => (K[town[i].k].bonus + hp[i]) / Math.max(1, hp[i]) * by(sk, [0.3, 0.6, 0.75]) - edge(town[i], me.x, me.z) * 0.3;
        if (mem.tgt == null || hp[mem.tgt] <= 0) { const r = live.sort((a, b) => val(b) - val(a)); mem.tgt = r[slip(sk, c.rng) && r.length > 1 ? 1 : 0]; mem.from = { x: me.x, z: me.z, t: v.t }; }
        const o = town[mem.tgt], d = edge(o, me.x, me.z);
        if (d <= 0.9) { const s = stickTo(me, o.x, o.z, sk); return { mx: s.mx * 0.2, mz: s.mz * 0.2, b: c.rng() < by(sk, [0.75, 0.85, 0.9]) ? A : 0 }; }
        // stuck behind another building: slide sideways for a moment
        if (v.t - mem.from.t > 1.2) { if (Math.hypot(me.x - mem.from.x, me.z - mem.from.z) < 0.5) mem.side = { until: v.t + 0.6, s: c.rng() < 0.5 ? 1 : -1 }; mem.from = { x: me.x, z: me.z, t: v.t }; }
        const s = stickTo(me, o.x, o.z, sk, { arrive: 0 });
        if (mem.side && v.t < mem.side.until) return { mx: -s.mz * mem.side.s, mz: s.mx * mem.side.s };
        return s;
      });
    },
  };
}
function reactedTo(mem, key, t, sk, rng) {
  mem.seen ||= {}; mem.seen[key] ??= t + sk.react * (0.7 + rng() * 0.6);
  return t >= mem.seen[key];
}
