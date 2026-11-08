// Slippery Delivery CPU: rolls to the bakery counter, brakes to a stop there, waits for a stack (Family leaves with two
// or three, Tricky usually waits for the full five), then steers for a door — the RUSH door when it is not much further
// — braking before crates and easing off when a barrel is about to cross its line. Family steers late and wobbles.
import { thinker, by, noisy, slip, A } from '../cpu-kit.js';
import { RULES, meta, barrelX } from './sim.js';

const HD = meta.arena.hd;
export function createCpu(c) {
  const sk = c.skill, think = thinker(c), mem = { want: 0 };
  return {
    tick(v) {
      const me = v.me, g = v.g; if (!me || !g || !v.init) return null;
      return think(v, () => {
        const pies = g.pies?.[c.pid] || 0, speed = Math.hypot(me.vx, me.vz), arena = v.init.arena;
        if (!mem.want) mem.want = Math.min(RULES.maxPies, Math.round(noisy(by(sk, [3, 4, 5]), 1, sk, c.rng)));
        let tx, tz, brake = false;
        const atCounter = Math.abs(me.x) <= RULES.counterW && me.z >= HD - RULES.counterD;
        if (pies < mem.want && !(pies > 0 && me.z < 0)) {                       // go and load up
          tx = mem.cx ??= noisy(0, 1.2, sk, c.rng); tz = HD - 1.0;
          if (atCounter) { brake = true; tx = me.x + Math.sin(me.yaw); tz = me.z + Math.cos(me.yaw); }
          else if (Math.hypot(tx - me.x, tz - me.z) < 3 + speed * 0.5) brake = speed > RULES.loadSpeed * 0.8;
        } else {
          mem.cx = null;
          if (mem.door == null || mem.doorT < v.t) {
            const near = RULES.doors.map((x, i) => [i, Math.abs(x - me.x)]).sort((a, b) => a[1] - b[1])[0][0];
            mem.door = (c.rng() < by(sk, [0.2, 0.55, 0.8]) && Math.abs(RULES.doors[g.rush] - me.x) < 9) ? g.rush : near;
            mem.doorT = v.t + 3;
          }
          tx = RULES.doors[mem.door]; tz = -HD;
        }
        if (pies >= mem.want || (pies > 0 && me.z < 0)) { if (pies === 0) mem.want = 0; }
        // a crate in the way: aim beside it
        const dx = tx - me.x, dz = tz - me.z, d = Math.hypot(dx, dz) || 1;
        // a crate or a spinning sign in the way: aim round it (signs are the big circles they sweep)
        const obst = [...(arena.blocks || []).map(o => ({ x: o.x, z: o.z, r: 1.1 })), ...v.init.arms.map(a => ({ x: a.x, z: a.z, r: a.L + 0.7 }))];
        for (const o of obst) {
          const ox = o.x - me.x, oz = o.z - me.z, along = (ox * dx + oz * dz) / d, side = (ox * dz - oz * dx) / d;
          if (along > 0 && along < o.r + 3 && along < d && Math.abs(side) < o.r + 0.3 && c.rng() < by(sk, [0.4, 0.75, 0.95])) { const s = side > 0 ? -1 : 1; tx = o.x + (dz / d) * s * (o.r + 0.6); tz = o.z - (dx / d) * s * (o.r + 0.6); break; }
        }
        // a barrel about to cross in front: ease off
        let mag = sk.speed;
        for (const br of v.init.barrels) {
          const ahead = (br.z - me.z) * Math.sign(dz);
          if (ahead > 0 && ahead < 2.5 && Math.abs(barrelX(br, (g.t || 0) + 0.4) - me.x) < 1.8 && c.rng() < by(sk, [0.2, 0.5, 0.75])) { mag = 0.35; if (speed > 3) brake = true; }
        }
        if (slip(sk, c.rng, 0.4)) { tx = noisy(tx, 4, sk, c.rng); }
        const hx = tx - me.x, hz = tz - me.z, h = Math.hypot(hx, hz) || 1;
        return { mx: hx / h * mag, mz: hz / h * mag, b: brake ? A : 0, hold: true };
      });
    },
  };
}
