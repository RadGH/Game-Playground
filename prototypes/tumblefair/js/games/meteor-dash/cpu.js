// Meteor Dash CPU: keeps its own copy of the island from what every phone is sent (the tiles at the start, then each
// change), notices a red ring after a human moment (and Family misses some), and steers with the game's own fairgoer
// rule `steer` — out of the rings, away from holes and shaking tiles, toward the middle — hopping when a ring is about
// to land on it with nowhere to step. Decisions at the skill's pace, stick at the skill's push.
import { thinker, by, A } from '../cpu-kit.js';
import { steer, TILES, ISLAND_R, RULES } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, think = thinker(c, { every: by(c.skill, [0.26, 0.15, 0.11]) }), mem = { seen: new Map(), lastG: null };
  const hp = new Int8Array(TILES.length), doom = new Float32Array(TILES.length);
  (c.init?.tiles || []).forEach((v, i) => { hp[i] = v === 3 ? 1 : v; doom[i] = v === 3 ? 1 : 0; });
  const react = by(sk, [0.68, 0.42, 0.3]), sees = by(sk, [0.62, 0.88, 0.96]);
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me) return null;
      if (g !== mem.lastG) {                                       // apply this update's tile changes once
        mem.lastG = g;
        for (let k = 0; k + 1 < (g.d || []).length; k += 2) { const i = g.d[k], s = g.d[k + 1]; hp[i] = s === 3 ? 1 : s; doom[i] = s === 3 ? 1 : 0; }
      }
      if ((g.out || []).includes(c.pid)) return null;
      return think(v, () => {
        const meteors = [];
        for (const [id, x, z, left] of g.m || []) {
          if (!mem.seen.has(id)) mem.seen.set(id, c.rng() < sees);
          if (mem.seen.get(id)) meteors.push({ x, z, left });
        }
        const el = 60 - (g.left ?? 60), rim = el > RULES.crumbleFrom ? Math.max(RULES.crumbleMin, ISLAND_R + 0.4 - (el - RULES.crumbleFrom) * RULES.crumbleRate) : ISLAND_R + 1;
        const s = steer(me, meteors, hp, doom, rim, react);
        return { mx: s.mx * sk.speed, mz: s.mz * sk.speed, b: s.hop ? A : 0 };
      });
    },
  };
}
