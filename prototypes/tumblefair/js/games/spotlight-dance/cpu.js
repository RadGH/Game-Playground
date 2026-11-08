// Spotlight Dance CPU: keeps to the middle of the spotlight nearest to it (following it as it glides) and presses
// DANCE once per beat, early or late by the skill's timing error, sending the song time it pressed at like a phone.
// Family drifts to the edge of the light, misses the beat often and forgets a beat now and then; Tricky stays centred.
import { by, stickTo, gauss, slip, noisy } from '../cpu-kit.js';
import { BEAT, LEAD } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = { k: 0, at: null, light: null }, form = 0.6 + c.rng() * 0.8;      // some days you have the rhythm
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me) return null;
      // the light I am dancing in (stay with it unless another is much closer)
      let l = (g.l || []).find(x => x[0] === mem.light), best = null, bd = Infinity;
      for (const x of g.l || []) { const d = Math.hypot(x[1] - me.x, x[2] - me.z); if (d < bd) { bd = d; best = x; } }
      if (!l || bd < Math.hypot(l[1] - me.x, l[2] - me.z) - 2) { l = best; mem.light = l?.[0]; }
      if (!l) return null;
      const inside = Math.hypot(l[1] - me.x, l[2] - me.z) <= l[3];
      // the next beat to dance on, with this press's timing error
      if (mem.at == null) {
        mem.k = Math.max(mem.k, Math.ceil((g.el + 0.15 - LEAD) / BEAT));
        mem.at = LEAD + mem.k * BEAT + gauss(c.rng) * sk.tapMs / 1000 * by(sk, [0.6, 0.9, 1.3]) * form + 0.02;
        mem.skip = slip(sk, c.rng, 0.25);
      }
      if (g.el >= mem.at) { if (inside && !mem.skip) v.act('step', { t: g.el }); mem.k++; mem.at = null; }
      if (v.t > (mem.offAt ?? 0)) { mem.off = [noisy(0, 0.9, sk, c.rng), noisy(0, 0.9, sk, c.rng)]; mem.offAt = v.t + 1.5; }
      return stickTo(me, l[1] + mem.off[0] * l[3] * 0.6, l[2] + mem.off[1] * l[3] * 0.6, sk, { arrive: 0.5 });
    },
  };
}
