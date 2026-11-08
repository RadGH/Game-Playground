// Laser Limbo CPU: watches the beams every phone draws and, for each one heading its way (the game's own `incoming`,
// the same thing the ▲ HOP / ▼ DUCK label shows), presses DODGE once inside the last second — earlier or later by
// skill, and now and then too early (it hops and lands before the beam) or not at all. Between beams it ambles about
// the stage, away from the hub and the rim, and stands still while a beam comes (walking moves the moment). When two
// beams are due together it may step to where they arrive apart (Tricky usually spots that, Family rarely).
import { by, slip, stickTo, thinker, A } from '../cpu-kit.js';
import { incoming, beamDist, RULES, SPIN, LOW } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = { plan: new Map(), a0: new Map() }, R = c.init?.r || 7;
  const walk = thinker(c, { every: 0.3 });
  const miss = by(sk, [0.19, 0.07, 0.035]), early = by(sk, [0.1, 0.05, 0.025]);
  const readsPairs = by(sk, [0.1, 0.45, 0.75]);
  /** The shortest gap (s) between two beams reaching (x, z) that one press cannot both clear (a hop then a duck, or two hops). */
  function clash(beams, x, z) {
    const at = beams.map(bm => [incoming([bm], x, z, 2.6), bm.h]).filter(([n]) => n).map(([n, h]) => [n.t, h]).sort((p, q) => p[0] - q[0]);
    let gap = 9; for (let i = 1; i < at.length; i++) if (at[i][1] !== at[i - 1][1] || at[i][1] === LOW) gap = Math.min(gap, at[i][0] - at[i - 1][0]);
    return gap;
  }
  const wander = v => {
    if (!mem.to || v.t >= mem.toAt || Math.hypot(mem.to.x - v.me.x, mem.to.z - v.me.z) < 0.4) {
      const a = c.rng() * Math.PI * 2, r = 2 + c.rng() * (R - 4.2);
      mem.to = { x: Math.cos(a) * r, z: Math.sin(a) * r }; mem.toAt = v.t + 1.5 + c.rng() * 2;
    }
    return mem.to;
  };
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me || (g.out || []).includes(c.pid)) return null;
      const beams = (g.bm || []).map(([id, k, h, a, s, vel, warn]) => {
        if (k === SPIN && !mem.a0.has(id)) mem.a0.set(id, a);
        return { id, k, h, a, s, v: vel, warn, left: k === SPIN ? RULES.spinTurn - Math.abs(a - mem.a0.get(id)) : 99 };
      });
      let b = 0;
      const nx = incoming(beams, me.x, me.z, RULES.press + 0.6);
      if (nx) {
        let p = mem.plan.get(nx.beam.id);
        if (!p) {
          const lead = slip(sk, c.rng, early / sk.slip) ? 1.15 + c.rng() * 0.3 : Math.max(0.22, by(sk, [0.55, 0.5, 0.45]) + (c.rng() - 0.5) * by(sk, [0.6, 0.45, 0.3]));
          p = { lead, miss: c.rng() < miss, done: false }; mem.plan.set(nx.beam.id, p);
        }
        if (!p.done && !p.miss && nx.t <= p.lead) { p.done = true; b = A; }
      }
      if (b) mem.still = v.t + 1;
      // two beams due at nearly the same moment (a hop cannot also duck): a sharp player steps to where they come apart
      if (!b && nx && nx.t > 0.7 && me.y <= 0) {
        if (mem.pairFor !== nx.beam.id) { mem.pairFor = nx.beam.id; mem.reads = c.rng() < readsPairs; mem.dodgeTo = null; }
        if (mem.reads && !mem.dodgeTo && clash(beams, me.x, me.z) < 0.85) {
          let best = null, bg = clash(beams, me.x, me.z) + 0.3;
          for (let k = 0; k < 8; k++) for (const r of [1.2, 2.2]) {
            const x = me.x + Math.cos(k * Math.PI / 4) * r, z = me.z + Math.sin(k * Math.PI / 4) * r, d = Math.hypot(x, z);
            if (d < 1.5 || d > R - 0.8) continue;
            const gp = clash(beams, x, z); if (gp > bg) { bg = gp; best = { x, z }; }
          }
          mem.dodgeTo = best;
        }
        if (mem.dodgeTo) return { ...stickTo(me, mem.dodgeTo.x, mem.dodgeTo.z, sk, { arrive: 0.2 }), b: 0 };
      }
      // a beam coming, just dodged, in the air, a spinner turning or a line close by: stand still (walking moves the moment)
      const near = beams.some(x => x.warn <= 0 && (x.k === SPIN || Math.abs(beamDist(x, me.x, me.z)) < 1.6));
      if ((nx || near || v.t < (mem.still || 0) || me.y > 0) && !slip(sk, c.rng, 0.05)) return { mx: 0, mz: 0, b };
      const s = walk(v, () => ({ ...stickTo(me, wander(v).x, wander(v).z, sk, { mag: 0.45 }) }));
      return { mx: s.mx, mz: s.mz, b };
    },
  };
}
