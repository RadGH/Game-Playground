// Size Up CPU: reads the question and the things, and answers from everyday knowledge: an easy call (a whale against
// a mouse) is almost always right, a close one (2.5x apart) is a coin flip more often. Family takes a few seconds and
// gets the close ones wrong more; Tricky answers in a second or two and is usually right.
import { by, gauss } from '../cpu-kit.js';
import { ITEMS, QUESTIONS, answerOf } from './sim.js';

const byId = new Map(ITEMS.map(t => [t.id, t]));
export function createCpu(c) {
  const sk = c.skill, mem = {};
  const sure = by(sk, [0.62, 0.78, 0.88]), slow = by(sk, [2.6, 1.8, 1.25]);
  return {
    tick(v) {
      const g = v.g; if (!g || g.phase !== 'q' || !g.ids || v.priv?.pick != null) return;
      if (mem.r !== g.round) {
        mem.r = g.round; const st = QUESTIONS[g.q].stat, vals = g.ids.map(id => byId.get(id)[st]);
        const ratio = Math.max(...vals) / Math.min(...vals), ease = Math.min(1, Math.log(ratio / 2.5) / Math.log(20));
        const right = sure + (1 - sure) * ease * 0.85;
        const ans = answerOf(g.ids, g.q);
        mem.pick = c.rng() < right ? ans : (ans + 1 + Math.floor(c.rng() * (g.ids.length - 1))) % g.ids.length;
        mem.wait = Math.max(0.6, slow * (1.15 - ease * 0.4) + gauss(c.rng) * 0.35 + (g.ids.length > 2 ? 0.5 : 0));
        mem.t0 = v.t;
      }
      if (v.t - mem.t0 < mem.wait) return;
      v.act('pick', { i: mem.pick, ms: Math.round((v.t - mem.t0) * 1000) + 50 });
    },
  };
}
