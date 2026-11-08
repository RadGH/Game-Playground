// Number Climb CPU: hunts for the next number in the grid like a person — each find takes a moment that grows with the
// grid's size (Family about 1.4 s a number on the big grid, Tricky about 0.75 s) — and now and then taps the wrong one
// and sits out the freeze. It keeps its place from the shared state, so a dropped tap is simply tried again.
import { by, gauss, slip } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  const base = by(sk, [0.34, 0.3, 0.28]), per = by(sk, [0.029, 0.025, 0.022]);
  return {
    tick(v) {
      const g = v.g; if (!g || g.phase !== 'climb' || !g.next) return;
      const N = g.n * g.n, nxt = g.next[c.pid];
      if (nxt > N || g.lock?.includes(c.pid)) { mem.at = null; return; }
      if (mem.r !== g.round || mem.n !== nxt || mem.at == null) {
        if (mem.r !== g.round) mem.at = null, mem.form = Math.max(0.7, 1 + gauss(c.rng) * 0.18);   // some rounds you are just quicker
        mem.r = g.round; mem.n = nxt;
        if (mem.at == null) mem.at = v.t + (mem.r === g.round && nxt === 1 ? sk.react : 0) + Math.max(0.15, (base + per * N) * mem.form * (1 + gauss(c.rng) * 0.3));
      }
      if (v.t < mem.at) return;
      mem.at = null;
      const wrong = nxt < N && slip(sk, c.rng, 0.25);
      v.act('tap', { r: g.round, n: wrong ? nxt + 1 : nxt });
      if (!wrong) mem.at = v.t + Math.max(0.15, (base + per * N) * mem.form * (1 + gauss(c.rng) * 0.3)), mem.n = nxt + 1;
    },
  };
}
