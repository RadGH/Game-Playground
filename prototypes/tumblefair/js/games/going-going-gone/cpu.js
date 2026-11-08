// Going, Going, Gone! CPU: rummages for energy at a person's tapping speed for a moment, then bids a share of its
// energy that matches how much of the remaining worth this lot is (the mystery lot as an average 5, the cursed lot a
// small "not the lowest" bid), and locks in. Tricky never bids more than the richest rival could pay plus one and
// spends more on the cursed lot when it can; Family bids on a hunch.
import { by, gauss, slip, clamp } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, me = String(c.pid), mem = {};
  return {
    tick(v) {
      const g = v.g; if (g?.phase !== 'bid') return;
      if (mem.r !== g.round) { mem.r = g.round; mem.start = v.t; mem.mashFor = by(sk, [1.2, 2.2, 2.6]) * (0.6 + c.rng() * 0.6); mem.done = false; mem.tapAt = 0; }
      const t = v.t - mem.start;
      if (t < mem.mashFor) {                                            // rummage: a tap every ~0.12-0.2 s
        if (v.t >= mem.tapAt) { mem.tapAt = v.t + by(sk, [0.22, 0.15, 0.12]) * (0.8 + c.rng() * 0.4); v.act('mash'); }
        return;
      }
      if (mem.done || t < mem.mashFor + 0.4 + sk.react) return;
      mem.done = true;
      const lots = g.lots || [], lot = lots[g.round], e = g.energy?.[me] ?? 0;
      const worth = l => (l.kind === 'mystery' ? (l.v ?? 5) : l.kind === 'cursed' ? 0 : l.v);
      const rest = lots.slice(g.round).reduce((s, l) => s + worth(l), 0) || 1;
      const rivals = Object.entries(g.energy || {}).filter(([k]) => k !== me).map(([, x]) => x);
      let bid;
      if (lot.kind === 'cursed') bid = by(sk, [1, 2, 3]) + Math.floor(c.rng() * 2);
      else bid = Math.round(worth(lot) / rest * e * by(sk, [1.2, 1.25, 1.3]) + gauss(c.rng) * 2.5 * sk.aim);
      if (slip(sk, c.rng)) bid = Math.floor(c.rng() * Math.min(e, 10) + 1);
      if (sk.level >= 2 && lot.kind !== 'cursed' && rivals.length) bid = Math.min(bid, Math.max(...rivals) + 1);
      v.act('bid', clamp(bid, 0, e));
      v.act('lock', true);
    },
  };
}
