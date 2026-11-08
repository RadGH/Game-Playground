// Trapdoor Treasury CPU: weighs each chest by what it could win against the sack it would lose on a trapdoor, banks
// when its sack is big enough to be worth keeping (and always on the last round, when only the bank counts). Family
// chases the big hoard and forgets to bank; Tricky banks at the right moments. Picks after a reading pause.
import { by, later, readDelay, pickBest, slip, pick } from '../cpu-kit.js';
import { CHESTS } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  return {
    tick(v) {
      const g = v.g; if (g?.phase !== 'pick') return;
      later(mem, v, 'r' + g.round, () => {
        const sack = g.sack?.[c.pid] || 0, last = g.last;
        if (last) { v.act('pick', sack > 0 && !slip(sk, c.rng, 0.5) ? 'bank' : 0); return; }
        if (sack >= by(sk, [22, 14, 11]) * (0.8 + c.rng() * 0.4) && !slip(sk, c.rng)) { v.act('pick', 'bank'); return; }
        if (slip(sk, c.rng)) { v.act('pick', pick([0, 1, 2], c.rng)); return; }
        const ev = i => { const k = CHESTS[i]; return (1 - k.risk) * (k.lo + k.hi) / 2 - k.risk * sack * by(sk, [0.3, 0.8, 1]); };
        v.act('pick', pickBest([0, 1, 2], ev, sk, c.rng));
      }, readDelay(sk, c.rng, 1.2));
    },
  };
}
