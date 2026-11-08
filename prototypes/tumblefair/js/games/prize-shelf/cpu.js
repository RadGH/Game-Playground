// Gone Missing! CPU: takes in the shelf while it is shown (each prize sticks with a skill-sized chance), then taps the
// tray prizes it remembers seeing that are not on the shelf now; when its memory runs out it guesses among the rest.
// One tap at a time at a person's pace. Family remembers fewer prizes and taps slowly; Tricky remembers most.
import { by, pick } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.phase === 'study' && g.shelf && mem.r !== g.round) { mem.r = g.round; mem.seen = new Set(g.shelf.filter(() => c.rng() < by(sk, [0.64, 0.78, 0.85]) - (g.shelf.length - 6) * 0.03)); mem.plan = null; }
      const mine = v.priv?.picks || [];
      if (g.phase !== 'pick' || !g.tray || mine.length >= g.need) return;
      if (!mem.plan || mem.plan.r !== g.round) {
        const rest = new Set(g.rest || []), seen = mem.r === g.round ? mem.seen : new Set();
        const sure = g.tray.map((p, i) => i).filter(i => seen.has(g.tray[i]) && !rest.has(g.tray[i]));
        const maybe = g.tray.map((p, i) => i).filter(i => !sure.includes(i) && !rest.has(g.tray[i]));
        mem.plan = { r: g.round, list: sure, maybe, next: v.t + 0.8 + sk.react * 1.5 };
      }
      const P = mem.plan; if (v.t < P.next) return;
      P.next = v.t + by(sk, [0.95, 0.75, 0.64]) * (0.7 + c.rng() * 0.6);
      let i = P.list.find(x => !mine.includes(x));
      if (i == null) { const left = P.maybe.filter(x => !mine.includes(x)); if (!left.length) return; i = pick(left, c.rng); }
      v.act('pick', i);
    },
  };
}
