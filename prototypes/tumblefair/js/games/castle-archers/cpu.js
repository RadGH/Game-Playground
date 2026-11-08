// Castle Archers CPU (co-op): picks the goblin that is closest to the gate (with a teammate, it shares them out by
// place in line), lines the dotted arc up on it the way a person drags the bow — trying a few angles and pulls with
// the wind it can see on the flag — then lets go with a skill-sized wobble in angle and pull. Family takes longer to
// line up and wobbles more; Tricky leads the runners and shoots quickly.
import { by, gauss } from '../cpu-kit.js';
import { launch, stepArrow, goblinAt, KINDS, A_MIN, A_MAX } from './sim.js';

/** A decent (angle, pull) whose arc meets goblin gb, searching a coarse grid (`fine` = a finer grid). */
function aim(gb, from, el, wind, L, fine) {
  let best = null;
  const da = fine ? 0.05 : 0.1, dp = fine ? 0.03 : 0.05;
  for (let a = A_MIN; a <= 1.2; a += da) for (let p = 0.05; p <= 1.001; p += dp) {
    const A = launch(a, p, from); let miss = Infinity;
    for (let k = 0; k < 90 && A.y > -0.5; k++) {
      stepArrow(A, wind, 1 / 30); const at = goblinAt(gb, el + A.t, L), K = KINDS[gb.k];
      const dx = Math.abs(A.x - at.x); if (dx < 0.7) miss = Math.min(miss, dx + Math.abs(A.y - (at.y + K.h / 2)));
    }
    if (miss < 0.8 && (!best || miss < best.miss)) best = { a, p, miss };
  }
  return best;
}

export function createCpu(c) {
  const sk = c.skill, I = c.init || {}, mem = { next: 0 };
  const me = I.archers?.[c.pid] || { x: 2, y: 7.9 }, rank = c.players.findIndex(p => p.pid === c.pid), n = c.players.length;
  return {
    tick(v) {
      const g = v.g; if (g?.phase !== 'play' || !I.goblins) return;
      const t = g.el; if (t < mem.next) return;
      const live = (g.gb || []).map(r => ({ r, gb: I.goblins[r[0]] })).sort((a, b) => a.r[1] - b.r[1]);
      if (!live.length) return;
      const pickI = Math.min(live.length - 1, c.rng() < sk.q ? rank % Math.min(n, live.length) : 0);
      const { gb } = live[pickI], wind = (I.winds || [])[g.w] || 0;
      const sol = aim(gb, me, t + by(sk, [0.15, 0.08, 0.05]), wind * by(sk, [0.5, 0.85, 1]), I.level, sk.level >= 2);
      mem.next = t + (I.cool ?? 0.55) + by(sk, [1.25, 0.8, 0.55]) * (0.75 + c.rng() * 0.5);
      if (!sol) return;
      const a = Math.max(A_MIN, Math.min(A_MAX, sol.a + gauss(c.rng) * by(sk, [0.07, 0.04, 0.025])));
      const p = Math.max(0, Math.min(1, sol.p + gauss(c.rng) * by(sk, [0.06, 0.035, 0.022])));
      v.act('shoot', { a: Math.round(a * 1000) / 1000, p: Math.round(p * 1000) / 1000 });
    },
  };
}
