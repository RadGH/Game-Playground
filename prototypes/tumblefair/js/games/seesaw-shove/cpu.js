// Seesaw Shove CPU: keeps to the middle of the plank's width and leans toward the HIGH end (uphill), the way a person
// fights the slide; shoves anyone right in front of it who is near an edge; hops a barrel rolling at it (Tricky
// usually, Family rarely). Family drifts too far downhill now and then.
import { thinker, stickTo, by, noisy, slip, A, B } from '../cpu-kit.js';
import { meta } from './sim.js';

const STUN = 2, OUT = 1, AIR = 16;
export function createCpu(c) {
  const think = thinker(c), sk = c.skill, mem = {}, AR = meta.arena;
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g || g.cd || (me.flags & (STUN | OUT))) return null;
      // a barrel coming at me: hop
      for (const [id, x, z] of g.bl || []) {
        const dx = me.x - x, prev = mem.bx?.[id] ?? x, vx = (x - prev) / Math.max(0.05, v.dt || 0.05);
        if (Math.abs(z - me.z) < 0.8 && Math.abs(dx) < 1.6 && Math.sign(vx) === Math.sign(dx) && Math.abs(vx) > 1.2 && !(me.flags & AIR)) {
          if (mem.hopFor !== id) { mem.hopFor = id; mem.hop = c.rng() < by(sk, [0.3, 0.6, 0.85]); }
          if (mem.hop) { mem.hop = false; return { mx: 0, mz: 0, b: B }; }
        }
      }
      mem.bx = Object.fromEntries((g.bl || []).map(r => [r[0], r[1]]));
      return think(v, () => {
        const th = g.th || 0;
        // somebody in front of me near an edge: shove them
        for (const [p, b] of v.bodies || []) {
          if (p === c.pid || (b.flags & (OUT | AIR))) continue;
          const d = Math.hypot(b.x - me.x, b.z - me.z), nearEdge = Math.abs(b.z) > 0.5 || Math.abs(b.x) > AR.hw - 2.5;
          if (d < 1.4 && nearEdge && c.rng() < by(sk, [0.35, 0.6, 0.8])) {
            const s = stickTo(me, b.x, b.z, sk); return { ...s, b: A };
          }
        }
        // where to stand: a little uphill of the middle, on the centre line (Family sometimes wanders)
        const lean = -Math.sign(th) * Math.min(1, Math.abs(th) / 0.15) * by(sk, [1.2, 2, 2.4]);
        let tx = lean + (me.x * 0.15), tz = 0;
        if (slip(sk, c.rng, 0.6)) tx = me.x + Math.sign(th) * 1.5;
        return stickTo(me, noisy(tx, 0.8, sk, c.rng), noisy(tz, 0.25, sk, c.rng), sk, { arrive: 0.6 });
      });
    },
  };
}
