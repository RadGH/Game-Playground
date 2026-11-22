// Copycat Cha-Cha CPU: watches the Captain like a phone does (the routine is in the public state from the "Watch!"
// beat), then dances it back one move a beat, early or late by the skill's timing error, sending the song time it
// pressed at. Memory fades with length: each move past the third has a growing chance of coming out wrong. Family
// forgets more and wobbles on the beat; Tricky rarely slips.
import { by, gauss, slip } from '../cpu-kit.js';
import { phaseAt, copyBeat, LEAD, BEAT } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = { r: -1, j: 0, at: null, m: 0 }, form = 0.7 + c.rng() * 0.6;
  const forget = by(sk, [0.08, 0.045, 0.02]);
  return {
    tick(v) {
      const g = v.g, lens = v.init?.lens; if (!g || !lens || !g.seq) return null;
      const at = phaseAt(g.el, lens);
      if (at.r !== mem.r) { mem.r = at.r; mem.j = 0; mem.at = null; }
      if (mem.j >= lens[at.r]) return null;
      if (mem.at == null) {
        const L = lens[at.r], beatT = LEAD + copyBeat(at.r, mem.j, lens) * BEAT;
        mem.at = beatT + gauss(c.rng) * sk.tapMs / 1000 * form + 0.02;
        const wrong = c.rng() < Math.max(0, L - 3 + mem.j * 0.5) * forget || slip(sk, c.rng, 0.15);
        mem.m = wrong ? (g.seq[mem.j] + 1 + Math.floor(c.rng() * 3)) % 4 : g.seq[mem.j];
        mem.skip = slip(sk, c.rng, 0.1);
      }
      if (g.el >= mem.at) { if (!mem.skip) v.act('move', { t: Math.round(g.el * 1000) / 1000, m: mem.m }); mem.j++; mem.at = null; }
      return null;
    },
  };
}
