// Monster Makeover CPU: reads the wish card, then taps one part a wish at a time at a person's pace (Family ~2 s a
// tap, Tricky ~1.25 s), now and then misreads a wish and picks a wrong part, sometimes dresses a free slot for fun, and
// presses DONE. In the mirror it votes for a look that is not its own, a well-starred one more often.
import { by, slip, pickBest } from '../cpu-kit.js';
import { SLOTS, NONE_OK, meets } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = { plan: null, at: 0, voted: false };
  const tap = by(sk, [2, 1.5, 1.25]);
  function makePlan(I) {
    const steps = [];
    for (const w of c.rng() < 0.5 ? I.req.wishes : [...I.req.wishes].reverse()) {
      const list = I.tray[w.s];
      let i = list.findIndex(v => meets({ [w.s]: v }, w));
      if (slip(sk, c.rng, 0.6)) i = list.findIndex(v => !meets({ [w.s]: v }, w));       // misread this wish
      if (i >= 0) steps.push({ s: w.s, i });
    }
    for (const s of SLOTS) if (!I.req.wishes.some(w => w.s === s) && c.rng() < 0.4) {    // a free slot, for fun
      const lo = NONE_OK.has(s) ? 1 : 0, n = I.tray[s].length; if (n > lo) steps.splice(Math.floor(c.rng() * (steps.length + 1)), 0, { s, i: lo + Math.floor(c.rng() * (n - lo)) });
    }
    return steps;
  }
  return {
    tick(v) {
      const g = v.g, I = v.init, me = v.priv; if (!g || !I?.req || !me) return;
      if (g.phase === 'dress') {
        if (!mem.plan) { mem.plan = makePlan(I); mem.at = v.t + by(sk, [3, 2.5, 2.1]) + c.rng() * 1.5; }   // reads the card
        if (me.done || v.t < mem.at) return;
        mem.at = v.t + tap * (0.7 + c.rng() * 0.6);
        const st = mem.plan.shift();
        if (st) v.act('wear', { s: st.s, i: st.i }); else v.act('done', true);
        return;
      }
      if (g.phase === 'vote' && !mem.voted && me.mine != null && g.show) {
        if (mem.voteAt == null) mem.voteAt = v.t + 1.5 + c.rng() * 3;
        if (v.t < mem.voteAt) return;
        mem.voted = true;
        const opts = g.show.map((_, i) => i).filter(i => i !== me.mine);
        const pick = pickBest(opts, i => g.show[i].stars + c.rng(), sk, c.rng);
        if (pick != null) v.act('vote', pick);
      }
    },
  };
}
