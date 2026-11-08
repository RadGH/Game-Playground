// Photo Booth CPU: reads the pose card, then taps its buttons one by one at a person's pace (a reaction, then a beat
// per button). Sometimes it hits a wrong button and, if it notices in time, fixes it. Family is slow (often only 2
// points, sometimes caught by the flash); Tricky is quick and rarely wrong.
import { by, gauss } from '../cpu-kit.js';

const bitsOf = m => [1, 2, 4, 8].filter(b => m & b);
export function createCpu(c) {
  const sk = c.skill, mem = {};
  const per = by(sk, [0.23, 0.2, 0.18]), wrong = by(sk, [0.14, 0.1, 0.08]), fix = by(sk, [0.4, 0.7, 0.85]);
  return {
    tick(v) {
      const g = v.g; if (!g || g.phase !== 'pose' || g.card == null) return;
      if (mem.r !== g.round) {                                    // plan this card's taps
        mem.r = g.round; mem.m = 0; mem.plan = [];
        let at = g.el + by(sk, [0.52, 0.45, 0.41]) * (0.8 + c.rng() * 0.5) + Math.abs(gauss(c.rng)) * 0.1;
        const want = bitsOf(g.card);
        for (const b of want) { at += per * (0.7 + c.rng() * 0.6); mem.plan.push([at, b]); }
        if (c.rng() < wrong) {                                     // a wrong button…
          const bad = [1, 2, 4, 8].filter(b => !(g.card & b)); at += per; const b = bad[Math.floor(c.rng() * bad.length)];
          mem.plan.push([at, b]); if (c.rng() < fix) mem.plan.push([at + sk.react, b]);   // …and maybe a fix
        }
      }
      while (mem.plan.length && g.el >= mem.plan[0][0]) { mem.m ^= mem.plan.shift()[1]; v.act('set', { m: mem.m, t: g.el }); }
    },
  };
}
