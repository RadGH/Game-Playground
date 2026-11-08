// Witch's Tower CPU (co-op): runs to the falling bottle it is closest to among the team, presses A when the shadow
// says NOW (early or late by its timing error — an early press does nothing, so it tries again), then walks toward
// the witch's spot and throws when she is in front of it or overhead. Family notices bottles late and mistimes the
// catch; Tricky leaves bottles a teammate is nearer to and throws as soon as she is in reach.
import { A, by, stickTo, gauss } from '../cpu-kit.js';
import { RULES } from './sim.js';
import { angDiff } from '../boss-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, seen = new Map();
  const noticed = (key, t, k = 1) => { if (!seen.has(key)) seen.set(key, t + sk.react * k * (0.75 + c.rng() * 0.5)); return t >= seen.get(key); };
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me || g.end || (me.flags & (2 | 8))) return null;
      const holding = (g.ho || []).some(h => h[0] === c.pid);
      if (holding) {                                                   // throw it back up at her
        const [wx, wz] = g.wt, d = Math.hypot(wx - me.x, wz - me.z), face = Math.atan2(wx - me.x, wz - me.z);
        const st = stickTo(me, wx, wz, sk, { arrive: 0.5 });
        const ok = d <= RULES.overhead - 0.3 || Math.abs(angDiff(me.yaw, face)) < RULES.cone * 0.7;
        if (ok && noticed('throw' + mem.caught, v.t, 0.5)) { mem.pa = !mem.pa; return { ...st, b: mem.pa ? A : 0 }; }
        return st;
      }
      const team = [...v.bodies].filter(([p]) => p !== c.pid).map(([, b]) => b);
      let best = null, bs = Infinity;
      for (const b of g.bt || []) {
        if (!noticed('b' + b[0], v.t)) continue;
        if (!seen.has('go' + b[0])) seen.set('go' + b[0], c.rng() > by(sk, [0.4, 0.15, 0.05]));   // some bottles go unnoticed
        if (!seen.get('go' + b[0])) continue;
        const d = Math.hypot(b[1] - me.x, b[2] - me.z), tl = b[3];
        if (d / (6 * sk.speed) > tl + 0.2) continue;                       // cannot get there in time
        const closer = team.some(t => Math.hypot(t.x - b[1], t.z - b[2]) < d - 0.3);
        const s = tl + (closer ? by(sk, [0, 1, 3]) : 0) - b[5];
        if (s < bs) { bs = s; best = b; }
      }
      if (!best) { const [wx, wz] = g.wt; return stickTo(me, wx * 0.5, wz * 0.5, sk, { mag: 0.4 }); }
      const [id, x, z, tl] = best, d = Math.hypot(x - me.x, z - me.z);
      const st = stickTo(me, x, z, sk, { arrive: 0.25 });
      if (mem.id !== id) { mem.id = id; mem.at = RULES.catchWin * (0.55 + c.rng() * 0.2) + gauss(c.rng) * sk.tapMs / 1000; }
      if (d < RULES.catchR - 0.2 && tl <= mem.at) { mem.at = tl - 0.25; mem.caught = id; return { ...st, b: A }; }   // a miss: try again a moment later
      return st;
    },
  };
}
