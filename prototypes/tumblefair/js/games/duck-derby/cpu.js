// Duck Derby CPU: paddles left-right on its own beat (aiming at the sweet gap, off by its timing error — Family drifts
// into mashing and dawdling, Tricky keeps a tight beat), steers with a second stroke on one side once a rapid has pushed
// it far enough to notice, and now and then splashes the duck just ahead when its splash is ready (Tricky more often).
import { by, gauss, clamp } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = { side: 'L', next: null };
  const beat = by(sk, [0.385, 0.37, 0.358]) * (1 + gauss(c.rng) * 0.03), wob = sk.tapMs / 1000 * by(sk, [0.45, 0.7, 0.7]);
  const notice = by(sk, [0.34, 0.3, 0.26]), splashP = by(sk, [0.15, 0.35, 0.55]);
  return {
    tick(v) {
      const g = v.g; if (!g || g.phase !== 'play') { mem.t0 = null; return; }
      if (mem.t0 == null) { mem.t0 = v.t - (g.el || 0); mem.next = (g.el || 0) + sk.react * (0.6 + c.rng() * 0.6); }
      const el = v.t - mem.t0, me = g.d?.[c.pid]; if (!me || me[5] != null) return;
      if (el < mem.next) return;
      const t = Math.round(mem.next * 100) / 100, x = me[1];
      // splash: a duck a little ahead and the splash ready
      const ahead = Object.entries(g.d).some(([p, d]) => +p !== c.pid && d[5] == null && d[0] - me[0] > 0 && d[0] - me[0] < 4);
      if (ahead && !me[6] && c.rng() < splashP * 0.08) { v.act('p', { s: 'L', t }); v.act('p', { s: 'R', t: t + 0.05 }); mem.side = 'L'; }
      else {
        let side = mem.side;
        if (Math.abs(x) > notice) side = x > 0 ? 'L' : 'R';                     // steer away from the bank / rocks
        else mem.side = side === 'L' ? 'R' : 'L';
        v.act('p', { s: side, t });
      }
      mem.next = t + clamp(beat + gauss(c.rng) * wob, 0.12, 0.9);
    },
  };
}
