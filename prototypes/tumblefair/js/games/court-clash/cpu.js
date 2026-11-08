// Court Clash CPU: plays like the court's own fill-in CPU but only from what a phone shows — with the ball it walks to
// a spot it likes, then holds A and lets go when the meter reaches the power it judged (or taps a pass when crowded);
// without it, the nearer teammate chases a loose ball, defenders stand between the ball and their hoop, reach in now
// and then and jump at a shooter. Family misjudges the meter and rarely steals; Tricky shoots cleaner and defends more.
import { A, B, by, stickTo, gauss } from '../cpu-kit.js';
import { hoopFor, LAYUP_R, STEAL_R, BLOCK_R, WINDUP_SAFE, LEVELS } from './sim.js';
import { idealPower, tolFor, hoopDist, meterAt } from '../hoops-kit.js';

export function createCpu(c) {
  const sk = c.skill, who = c.init?.who || [], L = c.init?.level || LEVELS.normal, mem = { held: 0 };
  const meI = who.findIndex(w => w.pid === c.pid), team = who[meI]?.team ?? 0, H = hoopFor(team), O = hoopFor(1 - team);
  const aim = by(sk, [1.7, 1.15, 0.8]), grab = by(sk, [0.15, 0.35, 0.55]), block = by(sk, [0.15, 0.3, 0.45]);
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me || !g.go || (me.flags & 2)) { mem.held = 0; return null; }
      const pos = i => { const w = who[i]; if (!w) return null; if (w.pid != null) return v.bodies.get(w.pid); const r = (g.c || []).find(x => x[0] === i); return r && { x: r[1], z: r[2], yaw: r[3], vx: 0, vz: 0 }; };
      const [bx, , bz, hi, bvx, , bvz] = g.b, mate = who.findIndex((w, i) => i !== meI && w.team === team);
      const foes = who.map((w, i) => i).filter(i => who[i].team !== team).map(pos).filter(Boolean);
      if (hi === meI) {                                                  // my ball
        if (mem.got !== true) { mem.got = true; mem.since = v.t; mem.plan = { want: 3.2 + c.rng() * 1.8, z: (c.rng() * 2 - 1) * 2.4, p: null }; }
        const d = hoopDist(me.x, me.z, H), P = mem.plan, carry = v.t - mem.since;
        const def = foes.reduce((m, o) => Math.min(m, Math.hypot(o.x - me.x, o.z - me.z)), 9);
        if (mem.held > 0) {
          if (meterAt(mem.held, L.period) >= P.p - 0.035 || mem.held > L.period * 0.5) { mem.held = 0; mem.got = false; return { mx: 0, mz: 0, b: 0 }; }
          mem.held += 0.05; return { mx: 0, mz: 0, b: A };
        }
        if (mate >= 0 && def < 1.0 && carry > 0.8 && c.rng() < 0.05) { mem.tap = true; mem.got = false; return { mx: 0, mz: 0, b: A }; }   // a quick pass
        if (d < LAYUP_R * 0.9 || (d < P.want && (def > 1.2 || carry > 1.6)) || carry > 3.5) {
          P.p = Math.max(0.02, Math.min(0.98, idealPower(d) + gauss(c.rng) * 0.6 * aim * tolFor(d, L.tol)));
          mem.held = 0.05; return { mx: 0, mz: 0, b: A };
        }
        return stickTo(me, H.x - Math.sign(H.x) * Math.min(P.want - 0.4, 3.4), P.z * (d > 4 ? 1 : 0.4), sk, { arrive: 0.4 });
      }
      mem.got = false; mem.held = 0;
      if (mem.tap) { mem.tap = false; return null; }                     // let go of the pass tap
      if (hi < 0) {                                                      // loose ball
        const m = pos(mate), myD = Math.hypot(me.x - bx, me.z - bz);
        if (!m || myD <= Math.hypot(m.x - bx, m.z - bz) + 0.3) return stickTo(me, bx + bvx * 0.25, bz + bvz * 0.25, sk, { arrive: 0 });
        return stickTo(me, O.x * 0.55, bz * 0.5, sk);
      }
      const h = pos(hi); if (!h) return null;
      if (who[hi].team === team) return stickTo(me, H.x - Math.sign(H.x) * 3.6, h.z > 0 ? -2.3 : 2.3, sk);
      // defend
      const dx = O.x - h.x, dz = O.z - h.z, dd = Math.hypot(dx, dz) || 1, st = stickTo(me, h.x + dx / dd * 0.95, h.z + dz / dd * 0.95, sk, { arrive: 0.3 });
      const dist = Math.hypot(h.x - me.x, h.z - me.z);
      mem.near = dist < STEAL_R ? (mem.near || 0) + 0.05 : 0;
      if (mem.nearB) { mem.nearB = false; return st; }
      const winding = g.h > 0 && g.h < WINDUP_SAFE;
      if (dist < STEAL_R && mem.near >= sk.react && !winding && c.rng() < grab * 0.04) { mem.nearB = true; return { ...st, b: B }; }
      if (dist < BLOCK_R && g.h > 0.12 && c.rng() < block * 0.25) { mem.nearB = true; return { ...st, b: B }; }
      return st;
    },
  };
}
