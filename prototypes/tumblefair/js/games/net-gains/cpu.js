// Net Gains CPU: one wader of a net. The LEADER (a CPU whose partner is the deckhand or another CPU with a higher seat)
// steers the net's middle through the thickest shoal; a FOLLOWER (a CPU teamed with a person, or the higher seat of two
// CPUs) keeps the other end level and a net's width to the side, like the deckhand does. A full or heavy net, or the clock
// running low, sends it home to the dock to bank. Family picks shoals loosely and cuts it fine on time; Tricky banks smartly.
import { thinker, stickTo, by, noisy } from '../cpu-kit.js';
import { NET, DOCK, SPECIES_LIST, teamOf, meta } from './sim.js';

const FROZEN = 8, GILBERT = SPECIES_LIST.indexOf('old-gilbert'), { hw, hd } = meta.arena;
export function createCpu(c) {
  const sk = c.skill, think = thinker(c), mem = { side: 1 };
  // which net I hold comes from the game (init.teams), not my seat: with the room's Teams off the partners are mixed
  const team = c.init?.teams?.find(T => T.pids.includes(c.pid))?.t ?? teamOf(c.seat), home = team ? 1 : -1;
  const mates = (c.init?.teams?.find(T => T.t === team)?.pids || []).filter(p => p !== c.pid);
  const mate = mates[0] ?? null, mateSeat = c.players.find(p => p.pid === mate)?.seat ?? 99;
  const leader = mate == null || c.seat < mateSeat;                     // the lower seat steers, the other keeps level
  const bankAt = by(sk, [7, 6, 5]), margin = by(sk, [2, 3, 4.5]);       // full-net size / spare seconds it heads home with
  return {
    tick(v) {
      const me = v.me, g = v.g; if (!me || !g || (me.flags & FROZEN)) return null;
      return think(v, () => {
        const [, load, count] = g.t?.[team] || [0, 0, 0];
        const deck = (g.d || []).find(r => r[0] === team);
        const p = mate != null ? v.bodies.get(mate) : deck ? { x: deck[1], z: deck[2], yaw: deck[3] } : null;
        // follower: keep the far end level with the partner, a net's width to their side
        if (!leader && p) {
          const fx = Math.sin(p.yaw || 0), fz = Math.cos(p.yaw || 0), rx = fz, rz = -fx;
          const cur = (me.x - p.x) * rx + (me.z - p.z) * rz; if (Math.abs(cur) > 0.6) mem.side = Math.sign(cur);
          const gap = (g.f || []).some(f => f[4] === GILBERT) ? NET.wide + 0.5 : 3.4;
          let tx = p.x + rx * mem.side * gap, tz = p.z + rz * mem.side * gap;
          if (Math.abs(tx) > hw - 0.5 || Math.abs(tz) > hd - 0.5) { mem.side = -mem.side; tx = p.x + rx * mem.side * gap; tz = p.z + rz * mem.side * gap; }
          return stickTo(me, noisy(tx, 0.4, sk, c.rng), noisy(tz, 0.4, sk, c.rng), sk, { arrive: 0.6 });
        }
        // home to bank?
        const toDock = Math.abs(home * (DOCK.x + 0.6) - me.x), secs = toDock / (meta.move.speed * sk.speed * (count >= NET.heavy ? meta.move.carryMul : 1));
        if (count > 0 && (count >= bankAt || g.left < secs + margin)) return stickTo(me, home * (DOCK.x + 0.8), noisy(0, 0.8, sk, c.rng), sk, { arrive: 0 });
        if (g.left < 2) return null;
        // fishing: steer the middle of the net through the best shoal (points nearby, not too far away)
        const mid = p ? { x: (me.x + p.x) / 2, z: (me.z + p.z) / 2 } : me;
        if (!mem.to || v.t > mem.until || Math.hypot(mem.to.x - mid.x, mem.to.z - mid.z) < 0.8) {
          let best = null, bs = -1;
          for (const f of g.f || []) {
            let s = 0; for (const o of g.f) if (Math.hypot(o[1] - f[1], o[2] - f[2]) < 2.2) s += 1;
            if (f[4] === GILBERT) s += 3;
            s /= 1 + Math.hypot(f[1] - mid.x, f[2] - mid.z) * 0.25;
            s *= 1 + (c.rng() - 0.5) * (1 - sk.q);
            if (s > bs) { bs = s; best = f; }
          }
          if (!best) return null;
          mem.to = { x: best[1], z: best[2] }; mem.until = v.t + by(sk, [3, 2.2, 1.6]);
        }
        // walk past the shoal so the net sweeps through it (the net hangs beside me, its middle half a net away)
        const dx = mem.to.x - mid.x, dz = mem.to.z - mid.z, d = Math.hypot(dx, dz) || 1;
        const tx = me.x + dx / d * (d + 1.5), tz = me.z + dz / d * (d + 1.5);
        return stickTo(me, Math.max(-hw + 0.6, Math.min(hw - 0.6, tx)), Math.max(-hd + 0.6, Math.min(hd - 0.6, tz)), sk, { arrive: 0 });
      });
    },
  };
}
