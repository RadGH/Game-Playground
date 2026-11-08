// Apple Bobbing CPU: counts its own clock from the start like a phone, watches its apple and picks the next moment it
// will pass under its face, then presses BITE then — early or late by its timing error — sending the time it pressed.
// It leaves rubber spiders alone (Family bites one now and then). Family's timing is loose, so it splashes more.
import { by, gauss, slip } from '../cpu-kit.js';
import { appleX } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, init = c.init || {}, apples = init.apples || [], zone = init.zone || { red: 0.2, gold: 0.15, spider: 0.2 };
  const mem = { t0: null, plan: null };
  return {
    tick(v) {
      const g = v.g; if (!g || g.phase !== 'play') return;
      if (mem.t0 == null) mem.t0 = v.t - g.el;
      const t = v.t - mem.t0, L = g.l?.[c.pid]; if (!L) return;
      const [k, from, stun] = L, ap = apples[k]; if (!ap) return;
      if (!mem.plan || mem.plan.k !== k || mem.plan.from !== from) {
        mem.plan = null;
        if (ap.kind === 'spider' && !slip(sk, c.rng, 0.3)) { mem.plan = { k, from, at: Infinity }; return; }   // leave it be
        // the next pass through the middle that I can still react to
        const start = Math.max(t + by(sk, [0.35, 0.25, 0.18]), from, stun);
        for (let s = start; s < start + 3; s += 0.02) if (Math.abs(appleX(ap, s - from)) < zone[ap.kind] * 0.35) {
          mem.plan = { k, from, at: s + gauss(c.rng) * sk.tapMs / 1000 * by(sk, [0.6, 0.85, 1]) }; break;
        }
        if (!mem.plan) return;
      }
      if (t >= mem.plan.at && t >= stun) { v.act('bite', { k, t: Math.round(t * 1000) / 1000 }); mem.plan = null; }
    },
  };
}
