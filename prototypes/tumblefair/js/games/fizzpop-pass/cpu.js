// Fizzpop Pass CPU: holding the pie it runs at the nearest picnicker it may pass to and taps PASS once in reach;
// otherwise it keeps away from the holder, picking open grass over the wall and the picnic props. Family notices
// the pie late, passes slowly and gets cornered; Tricky reacts fast, reads the space better and hurries as the fizz grows.
import { thinker, stickTo, by, slip, reacted, A } from '../cpu-kit.js';

const OUT_R = 6.6, PASS = 2.0;
const PROPS = [{ x: 0, z: 0.3, r: 1.1 }, { x: -3.2, z: -2.1, r: 1.4 }, { x: 3.2, z: 2.3, r: 1.4 }];
export function createCpu(c) {
  const sk = c.skill, rng = c.rng, think = thinker(c), mem = {};
  const look = by(sk, [1.6, 2.4, 2.2]), wallFear = by(sk, [0.4, 1, 1.1]);
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g || g.ph !== 'live' || (me.flags & 9)) return null;
      return think(v, () => {
        // everyone who can hold the pie: the other players, and the two picnickers when alone
        const ahead = by(sk, [0, 0.2, 0.4]);                     // Tricky runs at where they are going
        const folk = [...v.bodies].filter(([p, b]) => p !== c.pid && !(b.flags & 32)).map(([id, b]) => ({ id, x: b.x + b.vx * ahead, z: b.z + b.vz * ahead }));
        for (const r of g.cpu || []) folk.push({ id: r[0], x: r[1], z: r[2] });
        if (g.hold === c.pid) {
          if (!reacted(mem, 'hold', v.t, sk, rng, 0.6)) return null;
          let t = null, td = Infinity;
          for (const f of folk) { const d = Math.hypot(f.x - me.x, f.z - me.z) + (f.id === g.from ? 4 : 0); if (d < td) { td = d; t = f; } }
          if (!t) return null;                                   // (the giver only when nobody else is left: by then it may take it)
          const out = stickTo(me, t.x, t.z, sk, { arrive: 0 });
          return t.id !== g.from && td < PASS && !slip(sk, rng, 0.5) ? { ...out, b: A } : out;
        }
        mem.react = null;
        const h = g.hold === c.pid ? null : folk.find(f => f.id === g.hold);
        if (!h) return null;
        const hd = Math.hypot(h.x - me.x, h.z - me.z);
        if (hd > by(sk, [3.5, 4.5, 4.5]) + g.h) return null;                        // far enough: catch a breath
        // keep away: the open spot (a ring of steps round me) furthest from the holder
        let best = null, bs = -Infinity;
        for (let k = 0; k < 10; k++) {
          const a = k / 10 * Math.PI * 2, x = me.x + Math.sin(a) * look, z = me.z + Math.cos(a) * look, r = Math.hypot(x, z);
          let s = Math.hypot(x - h.x, z - h.z) - Math.max(0, r - (OUT_R - 1.8)) * 2.5 * wallFear;
          for (const p of PROPS) if (Math.hypot(x - p.x, z - p.z) < p.r) s -= 1.5 * wallFear;
          s += (rng() - 0.5) * (1 - sk.q) * 2;
          if (s > bs) { bs = s; best = { x, z }; }
        }
        return stickTo(me, best.x, best.z, sk, { arrive: 0 });
      });
    },
  };
}
