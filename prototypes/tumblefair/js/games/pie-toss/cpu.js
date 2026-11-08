// Pie Toss CPU: looks only at cut-outs that are up on the booth right now, picks one (gold if it can, never Granny on
// purpose — a slip can still splat her), and throws where it will be when the pie lands, off by a few booth units of
// aim. Skill sets how quickly it throws again, how well it leads a moving face and how often it chases gold.
import { by, gauss, clamp, slip, pickBest } from '../cpu-kit.js';
import { targetAt } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = { next: 0 }, I = c.init || {}, flight = I.flight ?? 0.5, reload = I.reload ?? 0.6;
  const gap = by(sk, [1.12, 1.05, 0.98]), miss = by(sk, [6, 5.5, 4.9]), leadOk = by(sk, [0.85, 0.9, 0.95]);
  const val = { face: 1, gold: 3, granny: -3 };
  return {
    tick(v) {
      const g = v.g; if (!g || g.phase !== 'play') { mem.t0 = null; return; }
      if (mem.t0 == null) { mem.t0 = v.t - 0.05; mem.next = sk.react; }
      const el = v.t - mem.t0; if (el < mem.next || el > (I.play ?? 45)) return;
      const hitIds = new Set((g.hit || []).map(h => h[0]));
      const up = (I.targets || []).filter(t => !hitIds.has(t.id) && el - t.t0 > by(sk, [0.38, 0.32, 0.27]) && targetAt(t, el)?.up >= 1);
      const T = el + flight, ok = up.filter(t => targetAt(t, T)?.up >= 0.75 && (t.kind !== 'granny' || slip(sk, c.rng, 0.4)));
      if (!ok.length) { mem.next = el + 0.15; return; }
      const tgt = pickBest(ok, t => val[t.kind] * 2 + t.rail - Math.abs(targetAt(t, T).x - (I.bw ?? 160) / 2) / 80 + c.rng() * 2, sk, c.rng);
      const now = targetAt(tgt, el), then = targetAt(tgt, T), led = c.rng() < leadOk ? then.x : now.x + (then.x - now.x) * 0.4;
      const x = clamp(led + gauss(c.rng) * miss, 0, I.bw ?? 160), y = clamp(then.y + gauss(c.rng) * miss * 0.5, 0, I.bh ?? 100);
      v.act('throw', { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, t: Math.round(el * 100) / 100 });
      mem.next = el + Math.max(reload + 0.05, gap * (0.7 + c.rng() * 0.6));
    },
  };
}
