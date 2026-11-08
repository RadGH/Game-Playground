// Shape Sorter CPU: looks at each toy as it drops and taps the matching bin after a person's reading time. Family
// takes about a second a toy and picks the wrong bin fairly often (breaking its combo); Tricky sorts in about half a
// second and rarely slips.
import { by, gauss } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = { next: 0, due: null };
  const look = () => by(sk, [0.95, 0.68, 0.6]) + Math.abs(gauss(c.rng)) * by(sk, [0.3, 0.18, 0.12]);
  return {
    tick(v) {
      const g = v.g, init = v.init; if (!g || g.phase !== 'play' || !init) return;
      const k = Math.max(g.at[c.pid] ?? 0, mem.next); if (k >= init.toys.length) return;
      if (mem.for !== k) { mem.for = k; mem.due = v.t + look(); }
      if (v.t < mem.due) return;
      let b = init.toys[k];
      if (c.rng() < by(sk, [0.16, 0.08, 0.06])) b = (b + 1 + Math.floor(c.rng() * (init.bins.length - 1))) % init.bins.length;
      v.act('sort', { k, b }); mem.next = k + 1;
    },
  };
}
