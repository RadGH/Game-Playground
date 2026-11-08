// Coinstorm CPU: reads the forecast (a sunny forecast is worth a bet on the cloud) and puts a modest pile on the
// windmill — smaller than what the others have been piling there in earlier reveals, so it is not the biggest — and
// the rest in the piggy bank. Family splits on a whim; Tricky watches the others' windmill piles closely.
import { by, later, readDelay, slip, clamp, gauss } from '../cpu-kit.js';
import { COINS } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = { seen: [] };
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.phase === 'reveal' && g.reveal && mem.r !== g.round) {      // remember the others' windmill piles
        mem.r = g.round;
        for (const [p, a] of Object.entries(g.reveal.alloc)) if (+p !== c.pid) mem.seen.push(a[1]);
        if (g.reveal.gust != null) mem.seen.push(g.reveal.gust);
      }
      if (g.phase !== 'pick') return;
      later(mem, v, 'r' + g.round, () => {
        let cloud, mill;
        if (slip(sk, c.rng, 1.5)) { cloud = Math.floor(c.rng() * 7); mill = Math.floor(c.rng() * (COINS - cloud + 1)); }
        else {
          const f = g.f / 100, edge = 3 * f - 1;                                        // what a coin on the cloud is worth over the bank
          cloud = clamp(Math.round(edge > 0 ? edge * by(sk, [6, 8, 10]) + gauss(c.rng) * 1.2 * sk.aim : 0), 0, COINS);
          const low = mem.seen.length ? Math.min(...mem.seen.slice(-by(sk, [2, 4, 8]))) : (c.players.length === 1 ? 2 : 3);
          mill = clamp(Math.round(low - by(sk, [0, 1, 1]) + gauss(c.rng) * 1.5 * sk.aim), 0, COINS - cloud);
        }
        v.act('set', [COINS - cloud - mill, mill, cloud]);
        v.act('lock', true);
      }, readDelay(sk, c.rng, 2));
    },
  };
}
