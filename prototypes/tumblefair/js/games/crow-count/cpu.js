// Crow Count CPU: watches the field and keeps a running count — crows sitting at the start, +1 for each landing, -1 for
// each that leaves — losing track of some events (more at Family, and more in the busy late rounds) and now and then
// counting a fly-over as a landing. Then it nudges its guess in with the buttons and locks it.
import { by, clamp } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  const lose = by(sk, [0.2, 0.09, 0.045]), fooled = by(sk, [0.35, 0.15, 0.07]);
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.phase === 'watch' && g.script && mem.r !== g.round) {
        mem.r = g.round; mem.done = false;
        const busy = 1 + g.round * 0.25;
        let n = g.script.start.length;
        if (c.rng() < lose * busy) n += c.rng() < 0.5 ? 1 : -1;                    // miscounted the first glance
        for (const [, k] of g.script.ev) {
          if (k === 'p') { if (c.rng() < fooled) n++; continue; }
          if (c.rng() < lose * busy) continue;                                      // missed that one
          n += k === 'i' ? 1 : -1;
        }
        mem.guess = clamp(n, 0, 30);
      }
      if (g.phase !== 'guess' || mem.r !== g.round || mem.done) return;
      if (mem.at == null || mem.atR !== g.round) { mem.atR = g.round; mem.at = v.t + 0.6 + sk.react * (1 + c.rng() * 3); }
      if (v.t < mem.at) return;
      mem.done = true; v.act('guess', { n: mem.guess ?? 3, ok: true });
    },
  };
}
