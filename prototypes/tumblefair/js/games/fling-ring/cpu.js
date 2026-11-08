// Fling Ring CPU: walks up to the nearest person (or Bumble when alone), grabs, turns toward the nearest bit of water
// and lets go after a wind-up; shoves anyone standing close to the edge; steps back from the edge and from gaps; mashes
// to wriggle free when carried. Family mashes slowly, winds up too short or too long and wanders near the edge;
// Tricky picks targets near the water, winds up fully and keeps to the middle.
import { A, B, by, stickTo, noisy, slip, gauss, reacted } from '../cpu-kit.js';
import { RULES } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, me$ = 'p' + c.pid, arena = c.init?.arena || { shape: 'circle', r: 8 };
  // how far (x, z) is from the water, and the way out to it
  function edge(g, x, z) {
    let d, ox, oz;
    if (arena.shape === 'circle') { const R = g.r ?? arena.r, r = Math.hypot(x, z) || 1e-3; d = R - r; ox = x / r; oz = z / r; }
    else { const dx = arena.hw - Math.abs(x), dz = arena.hd - Math.abs(z); if (dx < dz) { d = dx; ox = Math.sign(x) || 1; oz = 0; } else { d = dz; ox = 0; oz = Math.sign(z) || 1; } }
    for (const h of arena.holes || []) {
      const hx = Math.max(Math.abs(x - h.x) - h.hw, 0), hz = Math.max(Math.abs(z - h.z) - h.hd, 0), hd = Math.hypot(hx, hz);
      if (hd < d) { d = hd; const l = Math.hypot(h.x - x, h.z - z) || 1; ox = (h.x - x) / l; oz = (h.z - z) / l; }
    }
    return { d, ox, oz };
  }
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me || me.flags & 1) return null;
      const carry = (g.c || []).find(r => r[0] === me$), held = (g.c || []).find(r => r[1] === me$);
      if (held) {                                                       // wriggle: mash at a human rate
        mem.mash = !mem.mash && c.rng() < by(sk, [0.3, 0.5, 0.75]);
        return { mx: 0, mz: 0, b: mem.mash ? (c.rng() < 0.5 ? A : B) : 0 };
      }
      const e = edge(g, me.x, me.z);
      if (carry) {                                                      // face the water and wind up just enough
        if (mem.hold == null) {
          const p = Math.min(1, Math.max(0.3, (e.d + 1.2) / 8)), want = p * RULES.fullHold;      // a person's feel for "far enough"
          mem.hold = Math.max(RULES.minHold + 0.05, noisy(want, 0.35, sk, c.rng));
        }
        mem.held = (mem.held || 0) + v.dt;
        const out = { mx: e.ox, mz: e.oz };
        if (mem.held >= mem.hold) { mem.hold = null; mem.held = 0; return { ...out, b: 0 }; }
        return { ...out, b: A };
      }
      mem.hold = null; mem.held = 0;
      if (me.flags & 2) return null;                                    // stunned
      const safe = by(sk, [1.1, 1.6, 2.3]);
      if (e.d < safe && !slip(sk, c.rng, 0.4)) return stickTo(me, me.x - e.ox * 3, me.z - e.oz * 3, sk, { arrive: 0 });
      const targets = [];
      for (const [p, b] of v.bodies) if (p !== c.pid && !(b.flags & (1 | 32)) && !(b.flags & 16)) targets.push(b);
      for (const d of g.d || []) if (!(d[5] & (1 | 32 | 16))) targets.push({ x: d[1], z: d[2] });
      if (!targets.length) return stickTo(me, 0, 0, sk, { mag: 0.4 });
      let t = null, ts = Infinity;
      for (const b of targets) { const s = Math.hypot(b.x - me.x, b.z - me.z) + edge(g, b.x, b.z).d * by(sk, [0, 0.4, 0.8]); if (s < ts) { ts = s; t = b; } }
      const d = Math.hypot(t.x - me.x, t.z - me.z), st = stickTo(me, t.x, t.z, sk, { arrive: 0 });
      if (d < RULES.shoveR - 0.05 && d > RULES.grabR - 0.1 && (t.flags != null) && !(t.flags & 2) && c.rng() < by(sk, [0, 0.05, 0.12]) && !mem.pb) { mem.pb = true; return { ...st, b: B }; }
      mem.pb = false;
      if (d < RULES.grabR - 0.15 && reacted(mem, 'act' + Math.round(v.t * 2), v.t, sk, c.rng, 0.4)) {
        const te = edge(g, t.x, t.z);
        mem.pa = !mem.pa; if (!mem.pa) return st;                     // a press, then let go (so the next one counts)
        if (te.d < 1.6 && c.rng() < by(sk, [0.2, 0.4, 0.6])) return { ...st, b: B };   // a shove does it from here
        return { ...st, b: A };
      }
      mem.wob = (mem.wob || 0) * 0.8 + gauss(c.rng) * 0.2 * sk.aim;
      return { mx: st.mx + mem.wob, mz: st.mz - mem.wob };
    },
  };
}
