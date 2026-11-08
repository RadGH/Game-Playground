// Odd One Out CPU: scans each grid like a person — the time to spot the odd picture grows with the number of cells
// (Family ~1.3 s + 0.084 s a cell, Tricky ~1 s + 0.066 s a cell, with a spread and a form for the day) — then taps it.
// Now and then it taps a wrong look-alike first and sits out the freeze. The phone holds the list; the wait is the skill.
import { by, slip } from '../cpu-kit.js';
import { WRONG_S } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = { k: -1, at: 0, wrong: false };
  const form = 0.85 + c.rng() * 0.3;                              // some days you are sharper than others
  const base = by(sk, [1.3, 1.15, 1]) * form, per = by(sk, [0.084, 0.075, 0.066]) * form, jit = by(sk, [1.1, 1, 0.9]);
  return {
    tick(v) {
      const g = v.g, list = v.init?.puzzles; if (!g || g.phase !== 'play' || !list) return;
      const k = g.at?.[c.pid] ?? 0, P = list[k]; if (!P) return;
      if (mem.k !== k) {                                           // a new grid: how long until I see it
        mem.k = k; mem.at = v.t + base + P.n * P.n * per + c.rng() * jit;
        mem.wrong = slip(sk, c.rng, 0.6);
        if (mem.wrong) mem.wrongAt = v.t + (mem.at - v.t) * (0.3 + c.rng() * 0.5);
      }
      if ((g.lock || []).includes(c.pid)) return;
      if (mem.wrong && v.t >= mem.wrongAt) {                       // a wrong tap: a neighbour of the odd one, say
        mem.wrong = false; mem.at = Math.max(mem.at, v.t + WRONG_S + 0.2);
        const cells = P.n * P.n, i = (P.o + 1 + Math.floor(c.rng() * (cells - 1))) % cells;
        v.act('tap', { k, i }); return;
      }
      if (v.t >= mem.at) { mem.at = v.t + 1; v.act('tap', { k, i: P.o }); }   // (a retry a second later if it was lost)
    },
  };
}
