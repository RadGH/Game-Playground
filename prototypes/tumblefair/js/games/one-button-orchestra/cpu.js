// One Button Orchestra CPU: follows the falling notes on its own clock and taps each one with a timing error the size
// of its skill (judged with the game's own windows, like a phone does); busier sections make it wobblier, and now and
// then it loses the beat and misses a note or taps on nothing, which breaks its combo. Tricky lands most as perfects.
import { by, gauss } from '../cpu-kit.js';
import { WINDOW, stepSec } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = { n: 0, plan: null };
  const chart = c.init?.chart, ss = chart ? stepSec(chart.bpm) : 0.3;
  const sd = by(sk, [0.1, 0.085, 0.076]), miss = by(sk, [0.065, 0.05, 0.04]);
  return {
    tick(v) {
      const g = v.g; if (!g || !chart) return;
      if (g.phase !== 'play') { mem.t0 = null; return; }
      if (mem.t0 == null) mem.t0 = v.t;
      const el = v.t - mem.t0 + 0.05;                       // the state a tick behind: play began just before we saw it
      while (mem.n < chart.steps.length) {
        const n = mem.n, at = chart.steps[n] * ss, sec = Math.max(0, (g.sec ?? 0));
        if (!mem.plan || mem.plan.n !== n) {
          const err = gauss(c.rng) * sd * (1 + sec * 0.15);
          mem.plan = { n, err, skip: c.rng() < miss * (1 + sec * 0.4) };
        }
        const P = mem.plan, tap = at + P.err;
        if (el < Math.max(at, tap)) break;                  // the judgement can never come before the note's time
        mem.n++;
        if (P.skip) { if (c.rng() < 0.5) v.act('stray', n); continue; }
        const e = Math.abs(P.err);
        if (e <= WINDOW.perfect) v.act('hit', { n, q: 0 });
        else if (e <= WINDOW.good) v.act('hit', { n, q: 1 });
        else if (c.rng() < 0.5) v.act('stray', n);         // tapped well off the note: a stray (combo broken)
      }
    },
  };
}
