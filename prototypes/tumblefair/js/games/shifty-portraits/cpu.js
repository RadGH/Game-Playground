// Shifty Portraits CPU: looks at the lit wall and keeps each portrait in mind with a chance set by skill (a whole new
// face is easy to notice, a portrait turned the other way is easy to miss); when the lights come back it taps the ones
// it noticed changed, then — if it still owes taps — guesses (Family nearly always, Tricky only sometimes, as a wrong
// tap costs a point).
import { by, gauss } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  const keep = by(sk, [0.55, 0.75, 0.88]), guess = by(sk, [0.85, 0.55, 0.35]);
  const notice = [1, 0.8, 0.85, 0.6];                       // subject, hat, frame, facing: how eye-catching a change is
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.phase === 'study' && g.wall && mem.sr !== g.round) { mem.sr = g.round; mem.wall = g.wall.map(p => c.rng() < keep ? p.slice() : null); }
      if (g.phase !== 'guess' || !g.wall || mem.gr === g.round) return;
      if (mem.at == null || mem.atR !== g.round) {
        mem.atR = g.round; mem.at = v.t + 0.5 + sk.react * (1 + c.rng() * 2);
        const seen = [];
        g.wall.forEach((p, i) => {
          const m = mem.wall?.[i]; if (!m) return;
          const diff = p.map((x, k) => x !== m[k] ? notice[k] : 0), hit = Math.max(...diff);
          if (hit && c.rng() < hit) seen.push(i);
        });
        const rest = g.wall.map((_, i) => i).filter(i => !seen.includes(i)).sort(() => c.rng() - 0.5);
        mem.taps = seen.slice(0, g.need);
        while (mem.taps.length < g.need && rest.length && c.rng() < guess) mem.taps.push(rest.shift());
        mem.gap = by(sk, [0.9, 0.6, 0.45]);
      }
      if (v.t < mem.at) return;
      const i = mem.taps.shift();
      if (i == null) { mem.gr = g.round; return; }
      v.act('tap', i); mem.at = v.t + mem.gap * (0.7 + Math.abs(gauss(c.rng)) * 0.5);
    },
  };
}
