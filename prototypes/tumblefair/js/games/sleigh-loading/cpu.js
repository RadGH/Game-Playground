// Sleigh Loading CPU: walks to a present that has landed (the best value for the walk, a gold one tempts it more),
// presses A on it, then carries it home to its own sleigh's loading ring. With its hands empty it tackles a carrier
// who comes close (Tricky goes out of its way for one that is near its path). Family wanders off now and then and is
// slower to notice a present has landed.
import { A, B, by, thinker, stickTo, pickBest, slip, noisy, reacted } from '../cpu-kit.js';
import { RULES } from './sim.js';

const STUN = 2, FROZEN = 8;
export function createCpu(c) {
  const sk = c.skill, mem = {}, think = thinker(c);
  const si = c.init?.seats?.[c.pid], S = c.init?.sleighs?.[si];
  return {
    tick(v) {
      const g = v.g, me = v.me;
      if (!g || !me || !S || g.cd || g.left <= 0 || (me.flags & (STUN | FROZEN))) return null;
      return think(v, () => {
        const gifts = (g.gf || []).map(([id, x, z, kind, held, fall]) => ({ id, x, z, kind, held, fall }));
        const mine = gifts.find(x => x.held === c.pid);
        if (mine) return stickTo(me, S.mx, S.mz, sk, { arrive: 0.5 });
        // tackle a carrier close by
        const carriers = [...v.bodies].filter(([p, b]) => p !== c.pid && gifts.some(x => x.held === p) && !(b.flags & STUN)).map(([, b]) => b);
        if (g.elf && g.elf[3] & 4) carriers.push({ x: g.elf[0], z: g.elf[1] });
        for (const t of carriers) {
          const d = Math.hypot(t.x - me.x, t.z - me.z);
          if (d < by(sk, [1.1, 1.4, 2.2]) && v.t - (mem.tackle ?? -9) > RULES.tackleCool + 0.1 && c.rng() < sk.q) { mem.tackle = v.t; return { ...stickTo(me, t.x, t.z, sk, { mag: 1 }), b: B }; }
        }
        if (slip(sk, c.rng, 0.4)) { mem.to = { x: noisy(me.x, 3, sk, c.rng), z: noisy(me.z, 3, sk, c.rng) }; return stickTo(me, mem.to.x, mem.to.z, sk); }
        const free = gifts.filter(x => !x.held && x.fall < by(sk, [0.05, 0.3, 0.5]));
        if (!free.length) return stickTo(me, S.mx * 0.4, S.mz * 0.4, sk, { arrive: 1 });     // wait near the middle of my side
        const pts = [1, 2, 3];
        const tg = pickBest(free, x => (pts[x.kind] || 1) * by(sk, [0.6, 0.9, 1.2]) - Math.hypot(x.x - me.x, x.z - me.z) * 0.5 - Math.hypot(x.x - S.mx, x.z - S.mz) * 0.15, sk, c.rng);
        const d = Math.hypot(tg.x - me.x, tg.z - me.z);
        if (d < RULES.grabR - 0.15 && tg.fall <= 0 && reacted(mem, tg.id, v.t, sk, c.rng, 0.4)) return { mx: 0, mz: 0, b: A };
        return stickTo(me, tg.x, tg.z, sk, { arrive: 0.4 });
      });
    },
  };
}
