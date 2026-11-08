// Dragon's Weak Spot CPU (co-op): steps out of fire rings once it notices them, hops when the sweeping flame is about
// to reach it, and strikes ONLY the steps of the secret order its own phone shows (the ones a person would call out) —
// it walks to its next step's pad while the order is shown and strikes when the team is on that step. Between moves it
// chips the dragon at a pad now and then. Family notices late, mistimes hops and sometimes strikes the wrong scale.
import { A, B, by, stickTo, stickFrom, gauss, slip, every } from '../cpu-kit.js';
import { RULES, padAt, sweepAngle, angleOf } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, seen = new Map();
  // true once `key` has been on screen for my reaction time (k scales it)
  const noticed = (key, t, k = 1) => { if (!seen.has(key)) seen.set(key, t + sk.react * k * (0.75 + c.rng() * 0.5)); return t >= seen.get(key); };
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me || me.flags & 2) return null;
      let b = 0;
      // the sweep: hop as the flame reaches my angle
      if (g.sw) {
        const [id, dir, t] = g.sw, my = angleOf(me.x, me.z);
        const reach = (dir * my + RULES.sweepArc) / (2 * RULES.sweepArc) * RULES.sweepDur;   // when the beam gets to me
        if (mem.sw !== id) { mem.sw = id; mem.hopAt = reach - 0.25 + gauss(c.rng) * sk.tapMs / 1000 * by(sk, [1.4, 1, 1]); }
        if (noticed('sw' + id, v.t) && t >= mem.hopAt && mem.hopAt > -9) { b |= B; mem.hopAt = -99; }
      }
      // fire rings: out of any ring I have noticed
      for (const r of g.rg || []) {
        const d = Math.hypot(me.x - r[1], me.z - r[2]);
        if (d < RULES.ringR + 0.6 && noticed('rg' + r[0], v.t, 0.8) && !slip(sk, c.rng, 0.15)) return { ...stickFrom(me, r[1], r[2], sk), b };
      }
      const pv = v.priv || {}, mine = pv.pat || [];
      const want = mine.find(([i]) => i >= (g.st ?? pv.step ?? 0));          // my next step of the order
      if (g.ph === 'window' && want && want[0] === g.st) {
        if (mem.wrongFor !== g.cyc + ':' + g.st) { mem.wrongFor = g.cyc + ':' + g.st; mem.wrong = slip(sk, c.rng, 0.25) ? (want[1] + 1 + Math.floor(c.rng() * 3)) % 4 : null; }
        const pad = padAt(mem.wrong ?? want[1]), d = Math.hypot(me.x - pad.x, me.z - pad.z);
        if (d < RULES.reach - 0.3 && noticed('hit' + g.cyc + ':' + g.st, v.t, 0.6)) { mem.wrong = null; return { mx: 0, mz: 0, b: b | A }; }
        return { ...stickTo(me, pad.x, pad.z, sk), b };
      }
      if (want) { const pad = padAt(want[1]); return { ...stickTo(me, pad.x, pad.z + 1.4, sk), b }; }   // wait just off my pad
      if (g.ph === 'window') return { ...stickTo(me, me.x * 0.9, -1.5, sk, { mag: 0.4 }), b };      // stay out of the way
      // between moves: chip the dragon at a pad of my own
      const n = c.players.length, i = c.players.findIndex(p => p.pid === c.pid), pad = padAt(n === 1 ? 1 : i % 4);
      if (!g.rg?.length && !g.sw && g.ph === 'attack' && (mem.chipCyc === g.cyc ? mem.chip : (mem.chipCyc = g.cyc, mem.chip = c.rng() < 0.4 + sk.q))) {
        if (Math.hypot(me.x - pad.x, me.z - pad.z) < RULES.reach - 0.3) return { mx: 0, mz: 0, b: b | (every(mem, 'chip', v.t, by(sk, [1.2, 0.8, 0.6])) ? A : 0) };
        return { ...stickTo(me, pad.x, pad.z, sk), b };
      }
      return { ...stickTo(me, pad.x, 0, sk, { mag: 0.5 }), b };
    },
  };
}
