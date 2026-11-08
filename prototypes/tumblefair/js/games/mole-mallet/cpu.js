// Mole Mallet CPU: notices a mole a reaction time after it pops up, runs for the best one it can reach (near, gold
// counts extra, one it has watched for a while is probably about to duck), and bonks when the swing's aim help would
// catch it. Never aims at a bomb; Family now and then swings at the wrong moment or wanders off after a lost mole.
import { A, by, stickTo, slip, noisy } from '../cpu-kit.js';
import { aimAt, KIND, HOLES, RULES } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, react = by(sk, [0.44, 0.42, 0.36]), pickT = by(sk, [0.26, 0.2, 0.17]), holes = c.init?.holes || HOLES, mem = { seen: new Map(), cool: 0, target: null, wait: 0 };
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me) return null;
      const ml = g.ml || [];
      for (const m of ml) if (!mem.seen.has(m[0])) mem.seen.set(m[0], v.t);
      if (mem.seen.size > 80) for (const id of mem.seen.keys()) if (!ml.some(m => m[0] === id)) mem.seen.delete(id);
      if (me.flags & 2) { mem.target = null; return null; }                              // dizzy
      const live = ml.filter(m => !m[4] && m[2] !== KIND.BOMB && m[3] > 0.6 && v.t - mem.seen.get(m[0]) >= react);
      const up = ml.filter(m => !m[4] && m[3] > 0.3).map(m => ({ hole: m[1], kind: m[2], id: m[0] }));
      if (v.t < mem.wait) return null;
      // bonk when the mallet's aim help would land on a real mole
      const aim = aimAt(me.x, me.z, me.yaw, up);
      if (aim && aim.m.kind !== KIND.BOMB && v.t >= mem.cool) {
        mem.cool = v.t + RULES.cool + by(sk, [0.22, 0.2, 0.17]) * (0.6 + c.rng() * 0.8);
        mem.target = null; return { mx: 0, mz: 0, b: A };
      }
      if (!mem.target || !live.some(m => m[0] === mem.target.id)) {
        if (mem.target && slip(sk, c.rng, 0.35)) { mem.wait = v.t + 0.3 + c.rng() * 0.5; mem.target = null; return null; }   // dawdles
        let best = null, bs = -1e9;
        for (const m of live) {
          const H = holes[m[1]], d = Math.hypot(H.x - me.x, H.z - me.z), age = v.t - mem.seen.get(m[0]);
          const s = -d + (m[2] === KIND.GOLD ? by(sk, [1.5, 2, 2.5]) : 0) - (age > 1.6 ? 2 : 0) + noisy(0, 1.5, sk, c.rng);
          if (s > bs) { bs = s; best = m; }
        }
        mem.target = best ? { id: best[0], hole: best[1] } : null;
        if (!best) return null;
        mem.wait = v.t + pickT * (0.5 + c.rng() * 1.5);               // a moment to pick which one
      }
      const H = holes[mem.target.hole];
      return { ...stickTo(me, H.x, H.z, sk, { arrive: 0.6, mag: by(sk, [0.75, 0.76, 0.78]) }), b: 0 };
    },
  };
}
