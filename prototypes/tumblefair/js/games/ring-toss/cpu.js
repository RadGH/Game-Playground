// Ring Toss CPU: picks a bottle (the back rows and the gold one are worth the risk to a better player), works out
// where that neck will be when the ring lands (the table slides; later the wind pushes), and taps the two meters —
// each tap a little off, so the aim and the throw length wobble by a skill-sized amount. One ring every couple of
// seconds, like a person working two meters. Family wobbles a lot and goes for the front row.
import { by, gauss, pickBest } from '../cpu-kit.js';
import { shift, TW, AIM_X, RINGS } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, I = c.init || {}, mem = { t0: null, lastEl: null, next: 0 };
  return {
    tick(v) {
      const g = v.g; if (g?.phase !== 'play' || !I.bottles) return;
      if (g.el !== mem.lastEl) { if (mem.lastEl != null || mem.t0 == null) mem.t0 = v.t - g.el; mem.lastEl = g.el; }   // my own clock, lined up with the game's
      const t = v.t - mem.t0, n = g.n?.[c.pid] ?? 0;
      if (n >= RINGS || v.t < mem.next) return;
      if (mem.n === n && v.t < mem.sentAt + 3) return;                 // waiting for my last ring to count
      const flight = I.flight ?? 0.8, wind = I.winds?.[n] || 0;
      const b = pickBest(I.bottles, x => x.pts * (x.row === 2 ? by(sk, [0.25, 0.6, 0.75]) : x.row === 1 ? by(sk, [0.55, 0.8, 0.85]) : 1), sk, c.rng);
      const p = Math.max(0, Math.min(1, (b.d + 8) / 72 + gauss(c.rng) * by(sk, [0.07, 0.055, 0.047])));
      const x = b.x + shift(I.table, t + flight) - wind * (0.4 + 0.6 * p) * by(sk, [0.4, 0.85, 1]) + gauss(c.rng) * by(sk, [5.6, 4.2, 3.6]);
      v.act('toss', { aim: Math.max(-1, Math.min(1, (x - TW / 2) / AIM_X)), p, t: Math.round(t * 1000) / 1000 });
      mem.n = n; mem.sentAt = v.t;
      mem.next = v.t + flight + 0.4 + by(sk, [2.4, 1.8, 1.4]) * (0.8 + c.rng() * 0.4);   // the next ring: two more meter taps
    },
  };
}
