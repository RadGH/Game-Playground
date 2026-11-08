// Claw Machine CPU: looks over its heap, picks a prize worth going for (points against how well it grips), drags the
// claw over it with its own claw (the same swing a phone simulates) and drops once the swing has calmed down enough
// for its patience. Family aims loosely, picks so-so prizes and drops while it still swings; Tricky lines up close to
// the middle and waits for the swing to settle.
import { by, noisy, pickBest } from '../cpu-kit.js';
import { newClaw, stepClaw, swingOf, headOf, KINDS } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = { claw: null };
  const calm = by(sk, [4, 2, 0.9]), patience = by(sk, [1.2, 2.2, 3]), spread = by(sk, [3.6, 2.6, 1.6]);
  return {
    tick(v) {
      const g = v.g, init = v.init; if (!g || g.phase !== 'play' || !init) return;
      mem.claw ||= newClaw();
      const L = init.level, heap = g.hp?.[c.pid] || [];
      if ((g.gl?.[c.pid] ?? 0) <= 0 || g.gr?.[c.pid]) { mem.target = null; stepClaw(mem.claw, null, v.dt, L); return; }
      if (!mem.target) {
        if (mem.wait == null) mem.wait = v.t + sk.react * (0.8 + c.rng() * 0.6);
        if (v.t < mem.wait) { stepClaw(mem.claw, null, v.dt, L); return; }
        const p = pickBest(heap, ([, k]) => KINDS[k].pts * KINDS[k].grip, sk, c.rng); if (!p) return;
        mem.target = { x: noisy(p[2], spread, sk, c.rng), y: noisy(p[3], spread, sk, c.rng) }; mem.since = null; mem.wait = null;
      }
      stepClaw(mem.claw, mem.target, v.dt, L);
      const h = headOf(mem.claw), there = Math.hypot(mem.claw.x - mem.target.x, mem.claw.y - mem.target.y) < 1.5;
      if (!there) return;
      mem.since ??= v.t;
      if (swingOf(mem.claw) > calm && v.t - mem.since < patience) return;
      v.act('drop', { x: Math.round(h.x * 10) / 10, y: Math.round(h.y * 10) / 10 });
      mem.target = null;
    },
  };
}
