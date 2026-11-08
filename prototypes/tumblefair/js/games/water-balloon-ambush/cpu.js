// Water Balloon Ambush CPU: fills up at the fullest nearby bucket (or a puddle), walks to a throwing spot with a clear
// line to the nearest dry rival (or scarecrow), faces them and holds A just long enough to land on where they will be.
// It steps out of the ring where a balloon is coming down. Family leads nobody, holds sloppily and dodges late; Tricky
// leads its target, picks clear lines and dashes out of a splash.
import { thinker, stickTo, stickFrom, by, gauss, reacted, A, B } from '../cpu-kit.js';
import { RULES, baleHit } from './sim.js';

const STUN = 2, FROZEN = 8;
export function createCpu(c) {
  const sk = c.skill, think = thinker(c), mem = {}, blocks = c.init?.arena?.blocks || [], buckets = c.init?.buckets || [];
  const want = by(sk, [6, 6, 5.5]);                                     // throwing distance it likes
  let shot = null;                                                       // { pid|crow, held, hold, until }
  const clear = (a, b) => baleHit(blocks, a.x, a.z, b.x, b.z) == null;
  return {
    tick(v) {
      const me = v.me, g = v.g; if (!me || !g || (me.flags & FROZEN)) { shot = null; return null; }
      const mine = g.h?.[c.pid] || [0, -1, 0], have = mine[0];
      const marks = g.cr ? g.cr.filter(r => !r[3]).map(r => ({ id: 'c' + r[0], x: r[1], z: r[2], vx: 0, vz: 0 }))
        : [...v.bodies].filter(([p]) => p !== c.pid && !(g.h?.[p]?.[2])).map(([p, b]) => ({ id: p, ...b }));
      // a balloon coming down on me? (its landing ring is on the ground for all to see)
      const inc = (g.f || []).find(f => f[6] !== c.pid && Math.hypot(f[3] - me.x, f[4] - me.z) < RULES.splash + 0.6);
      if (inc && reacted(mem, 'f' + inc[0], v.t, sk, c.rng, by(sk, [0.34, 0.5, 0.6])) && !(me.flags & STUN)) {
        shot = null; const out = stickFrom(me, inc[3], inc[4], sk);
        return { ...out, b: c.rng() < by(sk, [0.04, 0.08, 0.12]) ? B : 0 };
      }
      // a throw in progress: keep facing the mark and let go at the planned wind-up
      if (shot) {
        const m = marks.find(x => x.id === shot.id);
        if (!m || have <= 0) shot = null;
        else {
          shot.held += v.dt;
          const fly = RULES.flyBase + RULES.flyPer * shot.d, p = { x: m.x + (m.vx || 0) * fly * shot.lead, z: m.z + (m.vz || 0) * fly * shot.lead };
          const dx = p.x - me.x, dz = p.z - me.z, d = Math.hypot(dx, dz) || 1;
          shot.d = d; shot.hold = Math.max(0, (d - RULES.minRange) / (RULES.maxRange - RULES.minRange)) * RULES.wind * (1 + shot.err);
          const face = { mx: dx / d * 0.3, mz: dz / d * 0.3 };
          if (shot.held < shot.hold + 0.05) return { ...face, b: A };
          shot = null; return { ...face, b: 0 };
        }
      }
      if (me.flags & STUN) return null;
      return think(v, () => {
        if (have <= 0 || (have < 2 && !marks.length)) {
          const opts = buckets.map((k, i) => ({ x: k.x, z: k.z, ok: (g.bk?.[i] || 0) > 0 })).filter(o => o.ok);
          for (const p of g.pd || []) opts.push({ x: p[1], z: p[2], pud: true });
          let best = null, bd = 99;
          for (const o of opts) { const d = Math.hypot(o.x - me.x, o.z - me.z) + (o.pud ? 3 : 0); if (d < bd) { bd = d; best = o; } }
          return best ? stickTo(me, best.x, best.z, sk, { arrive: best.pud ? 0.5 : 0 }) : null;
        }
        let tgt = null, td = 99;
        for (const m of marks) { const d = Math.hypot(m.x - me.x, m.z - me.z); if (d < td) { td = d; tgt = m; } }
        if (!tgt) return null;
        if (td < RULES.maxRange * 0.85 && td > RULES.minRange - 0.5 && clear(me, tgt) && c.rng() > sk.slip * 0.5) {
          shot = { id: tgt.id, held: 0, d: td, lead: by(sk, [0.4, 0.7, 1]), err: gauss(c.rng) * by(sk, [0.2, 0.13, 0.08]) };
          return { mx: 0, mz: 0, b: A };
        }
        // get to a spot about `want` away from it with a clear line
        let best = null, bs = -99;
        for (let k = 0; k < 12; k++) {
          const a = k * Math.PI / 6, x = tgt.x + Math.sin(a) * want, z = tgt.z + Math.cos(a) * want;
          if (Math.abs(x) > 8.4 || Math.abs(z) > 6.4) continue;
          const s = -Math.hypot(x - me.x, z - me.z) + (clear({ x, z }, tgt) ? 4 : 0);
          if (s > bs) { bs = s; best = { x, z }; }
        }
        return best ? stickTo(me, best.x, best.z, sk) : stickTo(me, tgt.x, tgt.z, sk);
      });
    },
  };
}
