// Pier Pressure CPU: casts after a moment, then watches its bobber like a person — it taps once it SEES the bite
// (after its reaction time), now and then gets fooled by a nibble, taps a drifting piece of junk away once it notices
// it, and mashes to untangle a snag. It keeps its own game clock like a phone and sends the time it pressed.
// Family reacts slowly and falls for nibbles; Tricky is quick and rarely fooled. It only knows what a phone knows: the
// server sends a nibble once it twitched and the bite once it bit (never ahead), so it reacts to those as they come.
import { by, gauss } from '../cpu-kit.js';
import { BY_ID } from '../fish-species.js';

export function createCpu(c) {
  const sk = c.skill, mem = { t0: null, lastEl: null, plan: null };
  const react = () => Math.max(0.17, by(sk, [0.45, 0.33, 0.27]) + gauss(c.rng) * by(sk, [0.1, 0.07, 0.05]));
  return {
    tick(v) {
      const g = v.g; if (!g || g.phase !== 'play') return;
      if (g.el !== mem.lastEl) { if (mem.lastEl != null || mem.t0 == null) mem.t0 = v.t - g.el; mem.lastEl = g.el; }   // the clock just ticked over: line mine up
      const t = v.t - mem.t0, L = g.l?.[c.pid]; if (!L) return;
      const [st, , , , , until, vis] = L;
      const tap = () => v.act('tap', { t: Math.round(t * 1000) / 1000 });
      const key = st + ':' + (vis ? vis[0] : '') + ':' + until;
      if (mem.key !== key) { mem.key = key; mem.plan = null; mem.seen = null; mem.nib = 0; mem.bit = false; if (st === 0) mem.plan = t + 0.3 + react(); }   // something new on my line
      if (st === 1 && vis) {
        const [, sp, from, arrive, fakes, bite] = vis;
        if (sp && mem.seen == null) {                                  // the shape just started up
          mem.seen = sp;
          if (BY_ID[sp]?.junk) mem.plan = c.rng() < by(sk, [0.45, 0.7, 0.85]) ? Math.min(arrive - 0.05, from + react() + 0.25) : null;   // a boot drifting up: tap it away
        }
        if (sp && !BY_ID[sp]?.junk) {
          if ((fakes || []).length > mem.nib) { if (mem.nib === 0 && mem.plan == null && c.rng() < by(sk, [0.2, 0.09, 0.04])) mem.plan = fakes[0] + react() * 0.5; mem.nib = fakes.length; }   // fooled by a nibble
          if (bite != null && !mem.bit) { mem.bit = true; if (mem.plan == null) mem.plan = bite + react(); }
        }
      }
      if (st === 2) { if (v.t >= (mem.mashAt ?? 0)) { mem.mashAt = v.t + by(sk, [0.22, 0.16, 0.13]) * (0.8 + c.rng() * 0.4); tap(); } return; }
      if (mem.plan != null && t >= mem.plan) { mem.plan = null; tap(); }
    },
  };
}
