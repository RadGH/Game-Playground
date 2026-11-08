// Sheep Shuffle CPU: picks a free sheep (near its gate; golden ones first at Tricky), walks round to the far side of
// it and pushes it toward its own gate, BAA-ing it through when lined up; Tricky sometimes BAAs sheep out of a rival's
// pen when that rival is well ahead. Family picks far sheep, lines up loosely and BAAs at the wrong moment.
import { thinker, stickTo, by, noisy, slip, A } from '../cpu-kit.js';
import { penAt, RULES } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, think = thinker(c), mem = {};
  return {
    tick(v) {
      const me = v.me, g = v.g, pens = v.init?.pens; if (!me || !g || !pens) return null;
      const my = pens.find(p => p.pid === c.pid); if (!my) return null;
      return think(v, () => {
        const inner = { x: my.sx * (9.5 - RULES.P * 0.45), z: my.sz * (7 - RULES.P * 0.45) };   // deep in my pen
        const free = (g.sh || []).map(s => ({ id: s[0], x: s[1], z: s[2], gold: s[3] })).filter(s => penAt(pens, s.x, s.z, -0.2) < 0);
        // Tricky: empty a runaway leader's pen
        const lead = pens.filter(p => p.pid !== c.pid && (g.sc?.[p.pid] || 0) >= (g.sc?.[c.pid] || 0) + 4)[0];
        if (lead && (mem.raid || c.rng() < by(sk, [0, 0.01, 0.04]))) {
          mem.raid = (mem.raid || 0) + 1; if (mem.raid > 25) mem.raid = 0;
          const px = lead.sx * 8.5, pz = lead.sz * 6;                     // back corner of their pen, BAA toward their gate
          if (Math.hypot(px - me.x, pz - me.z) < 1.2) { mem.raid = 0; const dx = lead.gx - me.x, dz = lead.gz - me.z, d = Math.hypot(dx, dz); return { mx: dx / d * 0.3, mz: dz / d * 0.3, b: A }; }
          const via = Math.hypot(lead.gx - me.x, lead.gz - me.z) > 1 && penAt(pens, me.x, me.z, -0.3) < 0 ? { x: lead.gx, z: lead.gz } : { x: px, z: pz };
          return stickTo(me, via.x, via.z, sk);
        }
        if (!free.length) return stickTo(me, my.gx * 0.5, my.gz * 0.5, sk);
        let s = free.find(x => x.id === mem.sid);
        if (!s || c.rng() < 0.08) {
          const score = x => Math.hypot(x.x - my.gx, x.z - my.gz) + Math.hypot(x.x - me.x, x.z - me.z) * 0.5 - (x.gold ? by(sk, [0, 3, 6]) : 0) + noisy(0, 4, sk, c.rng);
          s = free.slice().sort((a, b) => score(a) - score(b))[0]; mem.sid = s.id;
        }
        // push toward the gate, and once at the gate, into the back of the pen
        const near = Math.hypot(s.x - my.gx, s.z - my.gz) < 1.5, gx = near ? inner.x : my.gx, gz = near ? inner.z : my.gz;
        let dx = gx - s.x, dz = gz - s.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
        const back = by(sk, [2.4, 1.9, 1.7]), bx = noisy(s.x - dx * back, 0.5, sk, c.rng), bz = noisy(s.z - dz * back, 0.5, sk, c.rng);
        const rx = me.x - s.x, rz = me.z - s.z, ahead = rx * dx + rz * dz;
        if (ahead > -0.5) {                                              // on the wrong side: walk round it wide
          const side = (rx * -dz + rz * dx) >= 0 ? 1 : -1, R = 4;
          return stickTo(me, s.x - dz * side * R - dx * 1.5, s.z + dx * side * R - dz * 1.5, sk);
        }
        const lined = Math.hypot(me.x - bx, me.z - bz) < by(sk, [1.6, 1.1, 0.8]);
        const baa = lined && d < 6 && (c.rng() < by(sk, [0.15, 0.25, 0.3]) || slip(sk, c.rng, 0.3));
        if (baa) { const fx = s.x - me.x, fz = s.z - me.z, fd = Math.hypot(fx, fz) || 1; return { mx: fx / fd * 0.3, mz: fz / fd * 0.3, b: A }; }
        return stickTo(me, bx, bz, sk, { arrive: 0.5, mag: lined ? sk.speed * 0.55 : null });
      });
    },
  };
}
