// Tip the Scales CPU: eyeballs the thing like a person who has a rough idea what things weigh — its guess is the real
// number of ducks off by a random RATIO (about ×/÷2 at Family, ×/÷1.55 at Normal, ×/÷1.35 at Tricky). It slides about
// for a while, then presses OK. (It reads the thing's weight from the public table as "general knowledge"; the
// answer itself is never in the state before the reveal.)
import { by, gauss, clamp } from '../cpu-kit.js';
import { THINGS, MAX_GUESS, ducksOf } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, spread = by(sk, [0.7, 0.44, 0.3]);
  return {
    tick(v) {
      const g = v.g; if (!g || g.phase !== 'guess' || !g.thing) return;
      if (mem.r !== g.round) { mem.r = g.round; mem.at = v.t + 3 + c.rng() * by(sk, [8, 6, 5]); mem.done = false; }
      if (mem.done || v.t < mem.at) return;
      mem.done = true;
      const t = THINGS.find(x => x.id === g.thing); if (!t) return;
      const guess = Math.round(clamp(ducksOf(t.kg) * Math.exp(gauss(c.rng) * spread), 1, MAX_GUESS));
      v.act('guess', { n: guess, ok: true });
    },
  };
}
