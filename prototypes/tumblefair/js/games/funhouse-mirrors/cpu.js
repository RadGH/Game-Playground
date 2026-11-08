// Funhouse Mirrors CPU: warps the face it was handed a control at a time, at a person's pace — a few big stretches,
// sometimes a wobble, a tint and a prop (a sloppier CPU leaves more of the mirror plain), then presses Done. In the vote
// it picks someone else's mirror, leaning to the most warped one it can see (the warps are on screen in the show).
import { by, readDelay, later, voteFor } from '../cpu-kit.js';
import { KEYS, WARPS, plain, silliness } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, per = by(sk, [2.4, 1.7, 1.2]);
  return {
    tick(v) {
      const g = v.g, p = v.priv; if (!g || !p) return;
      if (g.phase === 'warp') {
        if (!mem.plan) {
          // which controls to touch, and how far: more (and bolder) for a sharper CPU
          const n = by(sk, [3, 4, 5]) + Math.floor(c.rng() * 2), keys = KEYS.slice().sort(() => c.rng() - 0.5).slice(0, n);
          mem.plan = keys.map(k => { const [lo, hi] = WARPS[k]; let val = lo + Math.floor(c.rng() * (hi - lo + 1)); if (val === 0) val = hi; if (lo < 0 && c.rng() < 0.4) val = -Math.max(1, Math.abs(val)); return [k, val]; });
          mem.w = plain(); mem.next = v.t + readDelay(sk, c.rng, 2);
        }
        if (v.t < mem.next || p.done) return;
        mem.next = v.t + per * (0.7 + c.rng() * 0.6);
        const step = mem.plan.shift();
        if (step) { mem.w[step[0]] = step[1]; v.act('warp', { ...mem.w }); }
        else v.act('done', true);
        return;
      }
      if (g.phase === 'vote' && p.vote == null && p.mine != null) later(mem, v, 'vote', () => {
        const opts = (g.show || []).map((_, i) => i);
        const pick = voteFor(opts, i => i === p.mine, c.rng, i => silliness(g.show[i].w) + c.rng() * 4, sk);
        if (pick != null) v.act('vote', pick);
      }, readDelay(sk, c.rng, 2.5));
    },
  };
}
