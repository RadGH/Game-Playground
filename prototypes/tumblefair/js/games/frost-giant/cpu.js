// Frost Giant CPU (co-op, Winter Fair M6): keeps its snowballs topped up at the nearest pile, steps out of icicle rings
// once it notices them, hops as the freeze wave reaches it, and throws ONLY at the steps of the secret order its own
// phone shows — walking to its next crystal's pad while the order is up and throwing when the team is on that step.
// Family notices late, mistimes hops and sometimes throws at the wrong crystal.
import { A, B, by, stickTo, stickFrom, gauss, slip } from '../cpu-kit.js';
import { RULES, padAt, waveRadius, distFromGiant } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, seen = new Map();
  const noticed = (key, t, k = 1) => { if (!seen.has(key)) seen.set(key, t + sk.react * k * (0.75 + c.rng() * 0.5)); return t >= seen.get(key); };
  const pileFor = me => RULES.piles.slice().sort((p, q) => Math.hypot(me.x - p.x, me.z - p.z) - Math.hypot(me.x - q.x, me.z - q.z))[0];
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me || me.flags & 2) return null;
      let b = 0;
      const ammo = g.am?.[c.pid] ?? 0;
      // the freeze wave: hop as the ring reaches my distance from the giant
      if (g.wv) {
        const [id, t] = g.wv, d = distFromGiant(me.x, me.z);
        if (mem.wv !== id) { mem.wv = id; mem.err = gauss(c.rng) * sk.tapMs / 1000 * by(sk, [1.5, 1, 1]); }
        const when = t + 0.15 + mem.err;
        if (noticed('wv' + id, v.t) && when > 0 && Math.abs(d - waveRadius(when)) < 0.8) b |= B;
      }
      for (const r of g.rg || []) {
        const d = Math.hypot(me.x - r[1], me.z - r[2]);
        if (d < RULES.ringR + 0.6 && noticed('rg' + r[0], v.t, 0.8) && !slip(sk, c.rng, 0.15)) return { ...stickFrom(me, r[1], r[2], sk), b };
      }
      const pv = v.priv || {}, mine = pv.pat || [];
      const want = mine.find(([i]) => i >= (g.st ?? pv.step ?? 0));
      if (!ammo || (ammo < RULES.ammoMax && !(g.ph === 'window' && want && want[0] === g.st))) {     // fetch snow first
        const p = pileFor(me); return { ...stickTo(me, p.x, p.z, sk, { arrive: 0.1 }), b };
      }
      if (g.ph === 'window' && want && want[0] === g.st) {
        if (mem.wrongFor !== g.cyc + ':' + g.st) { mem.wrongFor = g.cyc + ':' + g.st; mem.wrong = slip(sk, c.rng, 0.25) ? (want[1] + 1 + Math.floor(c.rng() * 3)) % 4 : null; }
        const pad = padAt(mem.wrong ?? want[1]), d = Math.hypot(me.x - pad.x, me.z - pad.z);
        if (d < RULES.reach - 0.3 && noticed('hit' + g.cyc + ':' + g.st, v.t, 0.6)) { mem.wrong = null; return { mx: 0, mz: 0, b: b | A }; }
        return { ...stickTo(me, pad.x, pad.z, sk), b };
      }
      if (want) { const pad = padAt(want[1]); return { ...stickTo(me, pad.x, pad.z + 1.4, sk), b }; }
      return { ...stickTo(me, me.x * 0.8, 1.2, sk, { mag: 0.5 }), b };
    },
  };
}
