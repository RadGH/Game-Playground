// Jellybean Jar CPU: eyeballs the pile like a person. It sees exactly what a phone sees — the guessing picture, with
// a label across the middle (the count itself is never sent before the reveal) — so it counts what shows, adds the
// label's height at the density of the rows around it (jar-art.js eyeEstimate), then misses by a random share (about
// a third at Family, a sixth at Normal, a tenth at Tricky). It types for a while, then presses OK.
import { by, gauss, clamp } from '../cpu-kit.js';
import { eyeEstimate } from './jar-art.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, spread = by(sk, [0.3, 0.17, 0.11]);
  return {
    tick(v) {
      const g = v.g; if (!g || g.phase !== 'guess' || !g.pic) return;
      if (mem.r !== g.round) { mem.r = g.round; mem.at = v.t + 4 + c.rng() * by(sk, [12, 9, 7]); mem.done = false; }
      if (mem.done || v.t < mem.at) return;
      mem.done = true;
      const guess = Math.round(clamp(eyeEstimate(g.pic) * Math.exp(gauss(c.rng) * spread), 1, 9999));
      v.act('guess', { n: guess, ok: true });
    },
  };
}
