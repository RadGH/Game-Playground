// Steady Hand CPU: drags its own dot toward the middle of the path a few points ahead, one finger movement per tick,
// slowing down where the path pinches. Skill sets its pace and how shaky its finger is: Family dawdles and wobbles
// into the edge now and then, Tricky moves briskly and steadily (but it still has to slow down for the pinches).
import { by, clamp } from '../cpu-kit.js';
import { buildPath, traceStep } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, I = c.init || {}, mem = {};
  const pace = by(sk, [34, 37, 40]), shake = by(sk, [0.95, 0.8, 0.68]), careful = by(sk, [0.5, 0.75, 0.9]);
  return {
    tick(v) {
      const g = v.g, me = v.priv; if (!g || g.phase !== 'go' || !me?.tr) return;
      if (mem.r !== me.r) { mem.r = me.r; mem.path = buildPath(I.specs[me.r], I.level); mem.go = v.t + sk.react * (0.7 + c.rng() * 0.6); mem.form = 0.85 + c.rng() * 0.3; }
      const tr = me.tr; if (v.t < mem.go || tr.done >= 0 || tr.frz > 0) return;
      const P = mem.path, w = P.w[Math.min(P.n - 1, tr.prog + 3)];
      const speed = pace * mem.form * clamp(1 - careful * (1 - w / 6), 0.45, 1);
      const [dx, dy] = traceStep(P, tr, { speed, look: 3, wobble: shake * (0.6 + 2.2 / w), rnd: c.rng });
      v.act('tr', { k: tr.k, d: [[dx, dy]] });
    },
  };
}
