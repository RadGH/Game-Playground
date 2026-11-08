// Witch's Sweep CPU: walks to the best nearby sweet (a lollipop is worth a detour) and watches the broom — from where
// the arm is and how fast it turns it judges when it will reach it and jumps just before, early or late by its timing
// error. A flip (the broom shaking) catches Family out; Tricky waits out a flip warning and times jumps tightly.
import { A, by, stickTo, gauss } from '../cpu-kit.js';
import { RULES } from './sim.js';

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export function createCpu(c) {
  const sk = c.skill, mem = { jumped: -9 };
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me || (me.flags & 8)) return null;
      // candy: value over distance, ignoring ones still landing
      let best = null, bs = -Infinity;
      for (const k of g.c || []) { const d = Math.hypot(k[1] - me.x, k[2] - me.z); const rival = [...v.bodies].some(([p, b]) => p !== c.pid && Math.hypot(k[1] - b.x, k[2] - b.z) < d - 0.5);   // someone gets there first
        const s = (k[3] ? 3 : 1) * by(sk, [1, 1.2, 1.4]) - d * 0.45 - (k[4] ? 0.6 : 0) - (rival ? by(sk, [0, 1.2, 0.6]) : 0); if (s > bs) { bs = s; best = k; } }
      if (v.t > (mem.at ?? 0) || !best || mem.id !== best[0]) { mem.id = best?.[0]; mem.at = v.t + sk.think * 2; mem.off = [gauss(c.rng) * 0.4 * sk.aim, gauss(c.rng) * 0.4 * sk.aim]; }
      const st = best ? stickTo(me, best[1] + mem.off[0], best[2] + mem.off[1], sk, { arrive: 0, mag: by(sk, [0.86, 0.9, 0.96]) }) : stickTo(me, 0, 4, sk, { mag: 0.3 });
      // the broom: time until an arm reaches my angle at its present speed
      // (the arm is thick: near the cauldron it covers a wide angle, so the edge arrives sooner)
      const phi = Math.atan2(me.x, me.z), w = g.w || 0, half = Math.atan2(RULES.armHalf + 0.45, Math.max(0.5, Math.hypot(me.x, me.z)));
      let soon = Infinity;
      for (const a of g.br || []) {
        if (Math.abs(w) < 0.05) continue;
        let gap = wrap(phi - a) * Math.sign(w); if (gap < -half) gap += Math.PI * 2;
        soon = Math.min(soon, Math.max(0, gap - half) / Math.abs(w));
      }
      if (mem.plan == null || v.t > mem.planT) { mem.plan = 0.22 + gauss(c.rng) * sk.tapMs / 1000 * by(sk, [0.45, 1, 1]); mem.planT = v.t + 0.5; }
      const fooled = g.fw && c.rng() < by(sk, [0.03, 0.01, 0]);              // jumps at the shaking broom for nothing
      if ((soon <= Math.max(0.02, mem.plan) || fooled) && v.t - mem.jumped > RULES.jumpTime + 0.2) { mem.jumped = v.t; mem.plan = null; return { ...st, b: A }; }
      return st;
    },
  };
}
