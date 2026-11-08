// Carousel Recall CPU: writes down each animal as it lights up, then taps the tune back at a person's pace. Its
// memory has a span: past it, every extra animal is a growing chance of a slip. Family remembers about 5 and taps
// slowly; Tricky about 8 and taps briskly.
import { by } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = { seen: [] };
  const span = by(sk, [5, 7, 8]), pace = by(sk, [0.6, 0.45, 0.43]), base = by(sk, [0.04, 0.02, 0.01]);
  return {
    tick(v) {
      const g = v.g, n = v.init?.animals || 6; if (!g) return;
      if (g.phase === 'show' && g.lit >= 0) mem.seen[g.k] = g.lit;
      if (g.phase !== 'go' || g.out.includes(c.pid) || g.done.includes(c.pid)) { mem.next = null; return; }
      if (mem.next == null) mem.next = v.t + sk.react * (0.8 + c.rng() * 0.5);
      if (v.t < mem.next) return;
      const i = g.prog[c.pid], miss = base + Math.max(0, i + 1 - span) * 0.12;
      let a = mem.seen[i] ?? Math.floor(c.rng() * n);
      if (c.rng() < miss) a = (a + 1 + Math.floor(c.rng() * (n - 1))) % n;
      v.act('tap', { r: g.round, i: a });
      mem.next = v.t + pace * (0.7 + c.rng() * 0.6);
    },
  };
}
