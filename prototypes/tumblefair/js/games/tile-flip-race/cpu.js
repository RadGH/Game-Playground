// Tile Flip Race CPU: after each flip it looks at the board for a moment and picks a tile next to its land: the most
// valuable, with a steal and a tile that opens more free ground counting extra (Tricky also likes tiles that keep its
// land in one patch). Family often settles for a so-so tile or dithers past the flip; Tricky usually takes the best.
import { by, pickBest, slip } from '../cpu-kit.js';
import { neighbours } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, joinW = by(sk, [0, 0.3, 0.5]);
  return {
    tick(v) {
      const g = v.g, init = v.init; if (!g || g.phase !== 'play' || !init) return;
      if (mem.f === g.flip) return;
      if (mem.seen !== g.flip) { mem.seen = g.flip; mem.at = v.t + sk.react * (0.8 + c.rng() * 0.6) + (slip(sk, c.rng, 0.5) ? 1.6 : 0); }
      if (v.t < mem.at) return;
      mem.f = g.flip;
      const me = init.who.findIndex(w => w.pid === c.pid), homes = init.who.map(w => w.home), vals = init.values;
      const own = [...g.o].map(ch => ch === '.' ? -1 : +ch), opts = [];
      for (let i = 0; i < own.length; i++) {
        if (vals[i] < 0 || own[i] === me || homes.includes(i)) continue;
        const nb = neighbours(i), mine = nb.filter(j => own[j] === me).length; if (!mine) continue;
        opts.push({ i, s: vals[i] + (own[i] >= 0 ? 0.6 : 0) + nb.filter(j => own[j] < 0 && vals[j] >= 0).length * 0.15 + (mine - 1) * joinW });
      }
      if (!opts.length) return;
      const best = pickBest(opts, o => o.s + c.rng() * 0.4, sk, c.rng);
      if (best.i !== v.priv?.pick) v.act('pick', best.i);
    },
  };
}
