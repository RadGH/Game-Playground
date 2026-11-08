// Castle Defense CPU (co-op): takes whichever job is open — mans a free cannon and shoots the creature closest to
// the wall, fetches a crate for a cannon running dry, carries a plank to a broken stretch, or bonks creatures at the
// wall — and leaves a job a team-mate is already nearer to. Family aims loosely, fires and decides slowly; Tricky
// leads its shots and keeps the supplies coming.
import { thinker, stickTo, by, noisy, slip, A, B } from '../cpu-kit.js';

const FROZEN = 8, SEAT_Z = -2.05, WALL_Z = -1.9, MUZZLE_Z = -3.3, BALL = 16;
export function createCpu(c) {
  const sk = c.skill, rng = c.rng, think = thinker(c), mem = { fireAt: 0 };
  const I = c.init, piles = I.piles, cannons = I.cannons, segW = I.segW, kinds = I.kinds;
  const tol = by(sk, [0.15, 0.11, 0.07]), fireGap = by(sk, [0.9, 0.75, 0.6]), lead = by(sk, [0, 0.7, 1]);
  const segX = s => -7 + segW * (s + 0.5);
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g?.c) return null;
      return think(v, () => {
        const ci = g.c.findIndex(x => x[2] === c.pid), carry = g.carry?.[c.pid] || '';
        const foes = (g.f || []).map(f => ({ id: f[0], k: f[1], x: f[2], z: f[3], hp: f[4], at: f[5] }));
        const others = [...v.bodies].filter(([p]) => p !== c.pid);
        const nearer = (x, z) => others.some(([p, b]) => !(g.c.some(q => q[2] === p)) && Math.hypot(b.x - x, b.z - z) + 0.5 < Math.hypot(me.x - x, me.z - z));
        // at a cannon: aim at the creature nearest the wall (leading it), fire when lined up; empty with nobody bringing ammo = step off
        if (ci >= 0) {
          const [ammo, aim] = g.c[ci], cx = cannons[ci];
          if (ammo <= 0 && !Object.values(g.carry || {}).includes('ammo') && (rng() < 0.5 || others.length === 0)) return { mx: 0, mz: 0, b: B };
          const t = foes.filter(f => Math.abs(Math.atan2(f.x - cx, MUZZLE_Z - f.z)) < 1.2).sort((a, b) => b.z - a.z)[0];
          if (!t) return null;
          const tz = t.at ? t.z : t.z + kinds[t.k].speed * (Math.hypot(t.x - cx, t.z - MUZZLE_Z) / BALL) * lead;
          const want = Math.max(-1.15, Math.min(1.15, noisy(Math.atan2(t.x - cx, MUZZLE_Z - tz), 0.12, sk, rng)));
          const stick = { mx: Math.sin(want), mz: -Math.cos(want) };
          if (Math.abs(want - aim) < tol + 0.04 && ammo > 0 && v.t >= mem.fireAt) { mem.fireAt = v.t + fireGap * (0.8 + rng() * 0.4); return { ...stick, b: A }; }
          return stick;
        }
        if (slip(sk, rng, 0.3)) return null;                                   // a moment looking round
        const use = (x, z, r) => { const d = Math.hypot(me.x - x, me.z - z); return d < r ? { mx: 0, mz: 0, b: A } : stickTo(me, x, z, sk, { arrive: 0.2 }); };
        // carrying: ammo to the emptier cannon, a plank to the weakest stretch
        if (carry === 'ammo') { const k = g.c[0][0] <= g.c[1][0] ? 0 : 1; return use(cannons[k], SEAT_Z, 0.9); }
        if (carry === 'plank') { const s = [0, 1, 2].sort((a, b) => g.segs[a] - g.segs[b])[0]; return g.segs[s] >= 100 ? { mx: 0, mz: 0, b: B } : use(segX(s), WALL_Z, 0.25); }
        const carrying = Object.values(g.carry || {});
        // a free cannon with balls in it (one a team-mate is not already closer to)
        const free = [0, 1].filter(k => g.c[k][2] < 0 && g.c[k][0] > 0 && !nearer(cannons[k], SEAT_Z)).sort((a, b) => Math.abs(cannons[a] - me.x) - Math.abs(cannons[b] - me.x))[0];
        const weak = [0, 1, 2].sort((a, b) => g.segs[a] - g.segs[b])[0];
        const dry = [0, 1].some(k => g.c[k][0] <= 2);
        const atWall = foes.filter(f => f.at);
        if (free != null && foes.length) return use(cannons[free], SEAT_Z, 0.8);
        if (g.segs[weak] < 55 && !carrying.includes('plank') && !nearer(piles.plank.x, piles.plank.z)) return use(piles.plank.x, piles.plank.z, 1.3);
        if (dry && !carrying.includes('ammo') && !nearer(piles.ammo.x, piles.ammo.z)) return use(piles.ammo.x, piles.ammo.z, 1.3);
        if (atWall.length) { const f = atWall.sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x))[0]; return Math.abs(f.x - me.x) < 1.2 && me.z < -1.7 ? { mx: 0, mz: 0, b: A } : stickTo(me, f.x, WALL_Z, sk, { arrive: 0.2 }); }
        if (g.segs[weak] < 100 && !carrying.includes('plank') && !nearer(piles.plank.x, piles.plank.z)) return use(piles.plank.x, piles.plank.z, 1.3);
        return stickTo(me, 0, 0.5, sk, { arrive: 0.6 });
      });
    },
  };
}
