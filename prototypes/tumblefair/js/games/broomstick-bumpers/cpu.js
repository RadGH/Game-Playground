// Broomstick Bumpers CPU: flies at the best thing in reach — a broom it can hit from behind or the side (a spinning or
// blinking one is left alone), or a pumpkin closer than any broom — and steers round open and glowing graves. A broom
// sitting near an open grave is rammed from the far side to knock it in. Family steers at where a broom IS and drifts
// near graves; Tricky leads its target, goes for the rear, boosts when lined up and sets up grave drops.
import { thinker, stickTo, nearest, lead, by, noisy, slip, A } from '../cpu-kit.js';
import { RULES } from './sim.js';

const STUN = 2, FROZEN = 8, GHOST = 32;
export function createCpu(c) {
  const think = thinker(c), sk = c.skill, mem = {}, graves = c.init?.graves || RULES.graves;
  const care = by(sk, [0.7, 0.88, 0.95]);                       // how reliably it minds the graves
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g || g.cd || (me.flags & (STUN | FROZEN))) return null;
      return think(v, () => {
        const holes = graves.filter((_, i) => (g.gv?.[i] || 0) > 0);       // glowing or open: keep off
        const cars = [...v.bodies].filter(([p, b]) => p !== c.pid && !(b.flags & (STUN | FROZEN | GHOST))).map(([, b]) => b);
        for (const t of g.tg || []) if (!(t[4] & (STUN | FROZEN | GHOST))) cars.push({ x: t[1], z: t[2], yaw: t[3], vx: 0, vz: 0 });
        const pk = nearest(me, (g.pk || []).map(p => ({ x: p[1], z: p[2] })));
        const car = nearest(me, cars);
        let to;
        if (slip(sk, c.rng, 0.6) || (!car.item && !pk.item)) { mem.to = mem.to && c.rng() < 0.7 ? mem.to : { x: noisy(0, 5, sk, c.rng), z: noisy(0, 5, sk, c.rng) }; to = mem.to; }
        else if (pk.item && pk.d < car.d * by(sk, [0.6, 0.8, 1])) to = pk.item;
        else {
          const t = car.item, p = lead(t, by(sk, [0, 0.25, 0.45]));
          // near an open grave? come at it from the far side so the bump sends it in
          const og = graves.find((G, i) => g.gv?.[i] === 2 && Math.hypot(G.x - t.x, G.z - t.z) < 2.4);
          if (og && c.rng() < by(sk, [0.1, 0.5, 0.85])) { const dx = t.x - og.x, dz = t.z - og.z, d = Math.hypot(dx, dz) || 1; to = { x: p.x + dx / d * 0.6, z: p.z + dz / d * 0.6 }; }
          else { const back = by(sk, [0, 0.5, 1]); to = { x: p.x - Math.sin(t.yaw || 0) * back, z: p.z - Math.cos(t.yaw || 0) * back }; }
          to = { x: noisy(to.x, 1.2, sk, c.rng), z: noisy(to.z, 1.2, sk, c.rng) };
        }
        // a grave on the way (or right under me): bend round it
        let st = stickTo(me, to.x, to.z, sk, { arrive: 0, mag: by(sk, [0.86, 0.92, 0.95]) });
        if (c.rng() < care) for (const G of holes) {
          const dx = G.x - me.x, dz = G.z - me.z, d = Math.hypot(dx, dz), m = Math.hypot(st.mx, st.mz) || 1;
          const along = (dx * st.mx + dz * st.mz) / m, side = Math.abs(dx * st.mz - dz * st.mx) / m;
          if (d < 2.2 || (along > 0 && along < 3.5 && side < 1.6)) {
            const away = stickTo(me, me.x - dx, me.z - dz, sk);       // turn away from the grave, keep some of the heading
            st = { mx: st.mx * 0.4 + away.mx, mz: st.mz * 0.4 + away.mz };
          }
        }
        const da = Math.atan2(car.item?.x - me.x, car.item?.z - me.z) - me.yaw, lined = car.item && car.d < 3.2 && Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) < 0.35;
        const boost = lined && !g.bc?.[c.pid] && c.rng() < by(sk, [0.2, 0.5, 0.75]);
        return { ...st, b: boost ? A : 0 };
      });
    },
  };
}
