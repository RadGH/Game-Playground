// Cocoa Pour CPU (Winter Fair, M6): reads the pot and the line like a person, waits a moment, then pours for as long as
// it judges right — off by a random share of the mug (about 11% at Family, 5% at Normal, 3% at Tricky), so sometimes it
// spills. Uses only the public pot + line; never the other players' pours.
import { by, gauss, readDelay } from '../cpu-kit.js';
import { msFor } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, miss = by(sk, [11, 5, 3]);
  return {
    tick(v) {
      const g = v.g; if (!g || g.phase !== 'pour' || !g.pot) return;
      if (mem.r !== g.round) { mem.r = g.round; mem.at = v.t + readDelay(sk, c.rng, 0.8); mem.done = false; }
      if (mem.done || v.t < mem.at) return;
      mem.done = true;
      const [kind, rate, line] = g.pot;
      v.act('pour', msFor({ kind, rate }, Math.max(0, line + gauss(c.rng) * miss)));
    },
  };
}
