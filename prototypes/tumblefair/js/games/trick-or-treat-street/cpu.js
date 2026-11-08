// Trick-or-Treat Street CPU: heads for the lit door it can reach first (giving up on one a rival is clearly closer
// to), knocks when on the step, scoops spilled candy that is close, and bumps a rival standing right in front of it now
// and then. Family picks doors by habit rather than distance and knocks from too far away; Tricky reads the race.
import { thinker, stickTo, by, slip, noisy, nearest, A, B } from '../cpu-kit.js';
import { RULES } from './sim.js';

const STUN = 2, FROZEN = 8;
export function createCpu(c) {
  const sk = c.skill, think = thinker(c), mem = {};
  return {
    tick(v) {
      const me = v.me, g = v.g, doors = v.init?.doors; if (!me || !g || !doors || (me.flags & (STUN | FROZEN))) return null;
      return think(v, () => {
        const st = g.d || '', rivals = [...v.bodies].filter(([p]) => p !== c.pid).map(([, b]) => b);
        // spilled candy right here: grab it
        const drop = nearest(me, (g.dr || []).map(d => ({ x: d[1], z: d[2] })));
        if (drop.item && drop.d < by(sk, [1.5, 2.5, 3.5])) return stickTo(me, drop.item.x, drop.item.z, sk, { arrive: 0 });
        // a rival right in front: bump
        for (const r of rivals) { const d = Math.hypot(r.x - me.x, r.z - me.z); if (d < 1.4 && !(r.flags & FROZEN) && c.rng() < by(sk, [0.05, 0.12, 0.2])) return { ...stickTo(me, r.x, r.z, sk), b: B }; }
        const lit = doors.map((d, i) => ({ i, x: d[0], z: d[1], face: d[2] })).filter(d => st[d.i] === '1');
        if (!lit.length) return stickTo(me, 0, 0, sk, { arrive: 1.5 });
        // the step in front of a door (a knocker stands on the pavement side)
        const step = d => ({ x: d.x + Math.sin(d.face) * 0.6, z: d.z + Math.cos(d.face) * 0.6 });
        const race = d => { const s = step(d), mine = Math.hypot(s.x - me.x, s.z - me.z), theirs = Math.min(99, ...rivals.map(r => Math.hypot(s.x - r.x, s.z - r.z))); return mine + (theirs < mine - 1 ? by(sk, [0, 3, 6]) : 0); };
        let tgt = lit.find(d => d.i === mem.door);
        if (!tgt || c.rng() < 0.15) { tgt = lit.slice().sort((a, b) => race(a) + noisy(0, 4, sk, c.rng) - race(b) - noisy(0, 4, sk, c.rng))[0]; mem.door = tgt.i; }
        const d = Math.hypot(tgt.x - me.x, tgt.z - me.z);
        if (d < RULES.reach * by(sk, [1.15, 1, 0.92]) && !slip(sk, c.rng, 0.5)) return { mx: 0, mz: 0, b: A };
        const s = step(tgt);
        return stickTo(me, s.x, s.z, sk, { arrive: 0.2 });
      });
    },
  };
}
