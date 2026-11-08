// Thin Ice CPU: skates in long smooth curves like a person on ice — it looks along a few headings from where its
// slide will carry it, avoids cracks, holes and the rim, and keeps its speed up so no tile takes much strain. Now and
// then it slide-dashes into a rival close by. Family looks less far ahead, turns late and dashes at random; Tricky
// looks further, reads more of the pond and bumps rivals who stand nearer the rim than it does.
import { thinker, by, slip, A, others } from '../cpu-kit.js';
import { pond } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, think = thinker(c), mem = {};
  let PD = null;
  const look = by(sk, [1.8, 2.4, 3.0]), carry = 0.1;
  function headingScore(t, me, ang) {
    const dx = Math.sin(ang), dz = Math.cos(ang), ox = me.x + me.vx * carry, oz = me.z + me.vz * carry;
    let s = 0;
    for (let k = 1; k <= 6; k++) {
      const d = look * k / 6, x = ox + dx * d, z = oz + dz * d, j = PD.at(x, z), w = 1.4 - k * 0.12;
      if (j < 0 || t[j] === 'x') { s -= 4 * w; break; }
      if (t[j] !== '0' && t[j] !== 's') s -= 1.5 * w; else if (t[j] === 's') s -= 0.4 * w;
    }
    const sp = Math.hypot(me.vx, me.vz);
    if (sp > 0.4) s += (dx * me.vx + dz * me.vz) / sp * 0.6;                 // turning on ice is slow: keep the line
    const r = Math.hypot(ox, oz), R = PD.radius * 0.5;                          // a ring round the middle has the most room
    if (r > 0.1) s -= Math.max(0, ((ox * dx + oz * dz) / r) * (r - R) / PD.radius) * 2;
    return s;
  }
  return {
    tick(v) {
      const me = v.me, g = v.g; if (!me || !g || !g.t || (me.flags & 3)) return null;
      PD ||= pond(v.init.rings);
      return think(v, () => {
        const opts = [];
        for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; opts.push([a, headingScore(g.t, me, a) + (c.rng() - 0.5) * sk.aim * 1.5]); }
        opts.sort((a, b) => b[1] - a[1]);
        const a = slip(sk, c.rng, 0.4) ? opts[Math.min(opts.length - 1, 1 + Math.floor(c.rng() * 3))][0] : opts[0][0];
        const out = { mx: Math.sin(a) * sk.speed, mz: Math.cos(a) * sk.speed };
        const near = others(v, c.pid, 1 | 2).map(([, b]) => b).find(b => Math.hypot(b.x - me.x, b.z - me.z) < 1.8);
        if (near && c.rng() < by(sk, [0.05, 0.08, 0.12]) && (sk.level < 1 || headingScore(g.t, me, Math.atan2(near.x - me.x, near.z - me.z)) > -0.5)) {
          const d = Math.hypot(near.x - me.x, near.z - me.z) || 1;
          return { mx: (near.x - me.x) / d, mz: (near.z - me.z) / d, b: A };
        }
        return out;
      });
    },
  };
}
