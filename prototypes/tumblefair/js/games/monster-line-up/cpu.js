// Monster Line-Up CPU: counts the asked-for feature on each monster in the line (a moment per monster, longer for big
// counts), miscounting now and then (a size judged by eye is wobblier still), then taps the one that comes out on top.
// Skill sets how fast it counts and how often it miscounts; its reported tap time is the real time it took.
import { by, gauss } from '../cpu-kit.js';
import { QUESTIONS } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  const per = by(sk, [0.66, 0.55, 0.48]), off = by(sk, [0.8, 0.55, 0.42]);
  return {
    tick(v) {
      const g = v.g; if (!g || g.phase !== 'q' || !g.ms) return;
      if (mem.r !== g.round) {
        const Q = QUESTIONS[g.q], seen = g.ms.map(m => m[Q.f] + gauss(c.rng) * (Q.f === 6 ? 0.12 * off : off * (0.3 + m[Q.f] / 10)));
        const val = seen.map(x => Q.most ? x : -x), pick = val.indexOf(Math.max(...val));
        const busy = g.ms.reduce((s, m) => s + (Q.f === 6 ? 1 : 1 + m[Q.f] / 6), 0);
        mem.r = g.round; mem.t0 = v.t - 0.05; mem.pick = pick; mem.done = false;
        mem.at = v.t + sk.react * 0.8 + per * busy * (0.6 + c.rng() * 0.8);
      }
      if (mem.done || v.t < mem.at) return;
      mem.done = true; v.act('pick', { i: mem.pick, ms: Math.round((v.t - mem.t0) * 1000) });
    },
  };
}
