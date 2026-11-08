// Tilt & Lance CPU: when riding it holds the button a little over a second before the crossing (the lance steadies)
// and lets go around the NOW mark, sending when it pressed and let go like a phone. A sharper player waits for the
// moment the dot drifts over the middle; every release is early or late by its timing error. Not riding, it cheers for
// a knight (the one ahead on points, or a hunch). Family holds too long or not at all and lets go late.
import { by, gauss, later, readDelay } from '../cpu-kit.js';
import { wobble, PASSES } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, I = c.init || {}, mem = { t0: null, lastEl: null };
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.el !== mem.lastEl) { if (mem.lastEl != null || mem.t0 == null) mem.t0 = v.t - g.el; mem.lastEl = g.el; }
      const t = v.t - mem.t0, side = g.rd ? g.rd.indexOf(c.pid) : -1;
      if (side < 0) {                                                   // cheer before the charge
        if (g.rd && (g.ph === 'intro' || (g.ph === 'ready' && g.k === 0)) && g.ch?.[c.pid] == null)
          later(mem, v, 'cheer' + g.b, () => v.act('cheer', g.bp && g.bp[0] !== g.bp[1] && c.rng() < sk.q ? (g.bp[0] > g.bp[1] ? 0 : 1) : (c.rng() < 0.5 ? 0 : 1)), readDelay(sk, c.rng, 0.6));
        return;
      }
      if ((g.ph !== 'ready' && g.ph !== 'charge') || (g.sn || []).includes(c.pid)) return;
      const key = g.b + ':' + g.k;
      if (mem.key !== key) {
        mem.key = key;
        const L = I.level, w = I.wob?.[(g.b * PASSES + g.k) * 2 + side], t0 = g.t0, cross = g.cr;
        const h = c.rng() < by(sk, [0.12, 0.06, 0.03]) ? null : cross - by(sk, [1.9, 1.25, 1.15]) + gauss(c.rng) * by(sk, [0.35, 0.2, 0.12]);
        let rel = cross;
        const look = by(sk, [0, 0.07, 0.11]);                           // watching the dot: let go as it crosses the middle
        if (w && L && look) { let bd = 9; for (let s = cross - look; s <= cross + look + 1e-9; s += 0.01) { const p = wobble(w, s - t0, h == null ? null : h - t0, L); const d = Math.hypot(p.x, p.y) + Math.abs(s - cross) * 2; if (d < bd) { bd = d; rel = s; } } }
        mem.h = h == null ? null : Math.max(t0 - 0.5, h);
        mem.rel = rel + gauss(c.rng) * sk.tapMs / 1000 + by(sk, [0.04, 0.02, 0]);
      }
      if (t >= mem.rel) { v.act('lance', { h: mem.h == null ? null : Math.round(mem.h * 100) / 100, t: Math.round(t * 1000) / 1000 }); mem.rel = Infinity; }
    },
  };
}
