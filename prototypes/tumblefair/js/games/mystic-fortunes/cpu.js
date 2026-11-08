// Mystic Fortunes CPU: fills its fortune a blank at a time at a person's pace. It reads its own hand (as a phone does)
// and leans to the cards that suit Mabel's printed mood — a sharper CPU more often, a Family one often just grabs
// whatever made it giggle — then presses Done. In the vote it picks someone else's fortune, leaning to the one with
// the most ★ cards (it can see them all on screen).
import { by, readDelay, later, pickBest, voteFor } from '../cpu-kit.js';
import { CARDS, blanksOf, moodCount } from './cards.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, per = by(sk, [3.2, 2.4, 1.8]);
  return {
    tick(v) {
      const g = v.g, p = v.priv, init = v.init; if (!g || !p || !init) return;
      if (g.phase === 'fill' && p.hand) {
        mem.next ??= v.t + readDelay(sk, c.rng, 2.5);
        if (v.t < mem.next || p.done) return;
        mem.next = v.t + per * (0.7 + c.rng() * 0.6);
        const ks = blanksOf(p.t), b = p.pick.findIndex(x => x < 0);
        if (b < 0) { v.act('done', true); return; }
        const k = ks[b];
        v.act('pick', { b, c: pickBest(p.hand[b], i => (CARDS[k][i].tags.includes(init.mood) ? 1 : 0) + c.rng() * 0.5, sk, c.rng) });
        return;
      }
      if (g.phase === 'vote' && p.vote == null && p.mine != null) later(mem, v, 'vote', () => {
        const opts = (g.list || []).map((_, i) => i);
        const pick = voteFor(opts, i => i === p.mine, c.rng, i => moodCount(g.list[i].t, g.list[i].c, init.mood) + c.rng() * 2, sk);
        if (pick != null) v.act('vote', pick);
      }, readDelay(sk, c.rng, 3));
    },
  };
}
