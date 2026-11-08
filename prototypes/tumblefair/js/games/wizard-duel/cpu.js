// Wizard Duel CPU: keeps a few metres from the nearest rival and away from the edge, picks a spell that suits the
// range and is off cool-down (cycling to it with B like a person), turns to face the rival and casts; it throws up a
// Bubble Ward when a spell is about to hit it. Family casts whatever it has and drifts toward the edge; Tricky picks
// the right spell, wards in time and keeps to the middle.
import { A, B, by, stickTo, gauss, slip } from '../cpu-kit.js';

const SPARK = 0, EMBER = 1, FROST = 2, WARD = 3, HOP = 4, WISP = 5;
export function createCpu(c) {
  const sk = c.skill, teams = c.init?.teams, mem = { step: 0 };
  const foe = p => (teams ? teams[p] !== teams[c.pid] : true);
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me || (me.flags & (1 | 8)) || !(g.lv?.[c.pid] > 0)) return null;
      if (me.flags & 2) return null;
      const marks = [];
      for (const [p, b] of v.bodies) if (p !== c.pid && foe(p) && g.lv[p] > 0 && !(b.flags & (1 | 32))) marks.push(b);
      for (const d of g.dm || []) if (d[3] >= 0) marks.push({ x: d[1], z: d[2] });
      const cur = g.sp?.[c.pid] ?? 0, cd = g.cd?.[c.pid] || [];
      if (mem.pressed) { mem.pressed = false; return { mx: mem.mx || 0, mz: mem.mz || 0, b: 0 }; }   // let go between presses
      if (mem.fire) { const f = mem.fire; mem.fire = null; mem.pressed = true; mem.mx = f.mx; mem.mz = f.mz; return { ...f, b: A }; }   // facing it now: cast
      const press = (b, mx = 0, mz = 0) => { mem.pressed = true; mem.mx = mx; mem.mz = mz; return { mx, mz, b }; };
      // a spell about to hit me: ward (if that is what I am holding or can reach in time)
      const danger = (g.s || []).some(s => Math.hypot(s[2] - me.x, s[3] - me.z) < 2.2);
      if (danger && !cd[WARD] && c.rng() < by(sk, [0.1, 0.35, 0.6])) mem.want = WARD;
      if (!marks.length) return stickTo(me, 0, 0, sk, { mag: 0.4 });
      let t = marks[0], td = Infinity; for (const m of marks) { const d = Math.hypot(m.x - me.x, m.z - me.z); if (d < td) { td = d; t = m; } }
      // the spell for this range (Family takes whatever is in hand)
      if (mem.want == null || cd[mem.want] > 0) {
        const ok = i => !(cd[i] > 0);
        mem.want = slip(sk, c.rng, 1.5) ? cur
          : td < 3.2 && ok(FROST) ? FROST : td < 8 && ok(EMBER) ? EMBER : ok(WISP) && td > 4 ? WISP : SPARK;
      }
      if (cur !== mem.want && v.t > (mem.bAt ?? 0)) { mem.bAt = v.t + by(sk, [0.45, 0.25, 0.15]); return press(B); }
      // move: keep my distance and keep off the edge
      const r = Math.hypot(me.x, me.z), want = by(sk, [3.5, 4.5, 4.5]), safe = by(sk, [7, 5.5, 4.5]);
      let ax = me.x - (t.x - me.x) / (td || 1) * (want - td) * 0.6, az = me.z - (t.z - me.z) / (td || 1) * (want - td) * 0.6;
      const ar = Math.hypot(ax, az); if (ar > safe) { ax *= safe / ar; az *= safe / ar; }        // never plan a spot near the edge
      if (r > safe + 0.5) { ax = me.x * 0.3; az = me.z * 0.3; }                                // too close to the edge: back in
      const st = stickTo(me, ax, az, sk, { arrive: 0.5 });
      // cast: face the rival (a light push toward it), then A
      if (!(cd[cur] > 0) && cur === mem.want && v.t > (mem.castAt ?? 0)) {
        const a = Math.atan2(t.x - me.x, t.z - me.z) + gauss(c.rng) * by(sk, [0.75, 0.35, 0.25]);
        mem.castAt = v.t + by(sk, [1.5, 0.6, 0.35]) + c.rng() * 0.3; mem.want = null;
        const k = cur === HOP ? -0.3 : 0.3;                                 // a hop goes away from them
        mem.fire = { mx: Math.sin(a) * k, mz: Math.cos(a) * k };
        return { ...mem.fire, b: 0 };
      }
      return { ...st, b: 0 };
    },
  };
}
