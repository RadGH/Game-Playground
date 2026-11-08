// Pin the Tail CPU: watches the star while the picture is shown and follows the trick the way a person does (it sees
// where the picture trots / swaps to, and the paddock turning over), then pins from memory — off by a few paddock units
// (Family about 13, Tricky about 4), and a slip now and then puts the pin where the picture STARTED.
import { noisy, slip, clamp, later, readDelay } from '../cpu-kit.js';
import { tailOf, BW, BH } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.phase === 'show' && g.star) { mem.r = g.round; mem.start = g.star; mem.to = null; mem.rot = 0; }
      if (g.phase === 'trick' && g.to && mem.r === g.round) { mem.to = tailOf(g.to[0]); mem.rot = g.rot || 0; }
      if (g.phase !== 'guess' || mem.r !== g.round) return;
      later(mem, v, 'pin' + g.round, () => {
        let p = mem.to || mem.start;
        if (mem.rot) p = [BW - p[0], BH - p[1]];
        if (mem.to && slip(sk, c.rng, 0.7)) p = mem.start;          // forgot the trick
        const x = clamp(noisy(p[0], 13, sk, c.rng), 1, BW - 1), y = clamp(noisy(p[1], 13, sk, c.rng), 1, BH - 1);
        v.act('pin', [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
        v.act('done');
      }, readDelay(sk, c.rng, 1.2));
    },
  };
}
