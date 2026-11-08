// Two Truths, One Goblin CPU: looks at the stall while it is shown (everyone sees it) and remembers it well or badly
// by skill. In the guess it checks each claim against what it remembers: a claim it remembers clearly is ruled in or
// out, the rest are a hunch. Takes a few seconds to read the cards. As the Goblin it plants one of the two lies.
import { by, later, readDelay, pick } from '../cpu-kit.js';
import { check } from './cards.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  const sure = by(sk, [0.42, 0.62, 0.78]);                // the chance it remembers enough to judge any one claim
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.phase === 'show' && g.stall && mem.r !== g.round) {
        mem.r = g.round; const counts = {};
        for (const shelf of g.stall) for (const id of shelf) if (id) counts[id] = (counts[id] || 0) + 1;
        mem.st = { slots: g.stall, counts };
      }
      if (g.phase === 'show' && g.teller === c.pid && v.priv?.lies) later(mem, v, 'plant' + g.round, () => v.act('plant', c.rng() < 0.5 ? 0 : 1), readDelay(sk, c.rng, 1.5));
      if (g.phase !== 'guess' || g.teller === c.pid || !g.cards) return;
      later(mem, v, 'guess' + g.round, () => {
        // each card: false (a lie it is sure of), true (a truth it is sure of) or null (cannot say)
        const seen = g.cards.map(t => (mem.st && mem.r === g.round && c.rng() < sure ? check(mem.st, t) : null));
        let i = seen.indexOf(false);
        if (i < 0) { const open = [0, 1, 2].filter(k => seen[k] !== true); i = pick(open.length ? open : [0, 1, 2], c.rng); }
        v.act('guess', i);
      }, readDelay(sk, c.rng, by(sk, [3.2, 2.4, 1.8])) + c.rng() * 2);
    },
  };
}
