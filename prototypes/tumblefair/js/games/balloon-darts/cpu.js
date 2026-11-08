// Balloon Darts CPU: picks a balloon that is on the board (worth more if it continues its colour chain, never the
// black BOOM on purpose), aims where it will be when the dart lands — off by a skill-sized wobble — and throws, then
// takes a moment to line up the next one. Family aims loosely, ignores chains and throws slower; Tricky leads its
// target well and keeps chains going.
import { by, gauss, pickBest } from '../cpu-kit.js';
import { balloonAt, COLOURS, BW, BH } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, init = c.init || {}, balloons = init.balloons || [], fly = init.fly ?? 0.25, cool = init.cool ?? 0.45, mem = { next: 0 };
  return {
    tick(v) {
      const g = v.g; if (g?.phase !== 'play') return;
      const t = g.el; if (t < mem.next) return;
      const popped = new Set((g.p || []).map(p => p[0])), chain = g.ch?.[c.pid] || 0;
      const lead = fly + by(sk, [0.1, 0.06, 0.04]);
      const live = balloons.filter(b => b.t0 <= t && !popped.has(b.id) && balloonAt(b, t) && balloonAt(b, t + lead) && balloonAt(b, t + lead)[1] > 6);
      const score = b => (b.c === 'boom' ? -20 : COLOURS[b.c].pts * (chain && chain[0] === b.c ? chain[1] + 1 : 1) * by(sk, [0.8, 1, 1]) / (COLOURS[b.c].speed * by(sk, [1.3, 1, 0.9])));
      const b = pickBest(live.filter(x => x.c !== 'boom' || c.rng() < by(sk, [0.04, 0.01, 0])), score, sk, c.rng);
      mem.next = t + cool + by(sk, [0.36, 0.3, 0.25]) * (0.7 + c.rng() * 0.6);
      if (!b) return;
      const p = balloonAt(b, t + lead);
      const spread = by(sk, [4.3, 3.8, 3.2]);
      const x = Math.max(0, Math.min(BW, p[0] + gauss(c.rng) * spread)), y = Math.max(0, Math.min(BH, p[1] + gauss(c.rng) * spread));
      v.act('throw', { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, t });
    },
  };
}
