// Twinkle Tree CPU: watches the tree blink (the pattern is shown to everyone), then taps it back at a person's pace.
// Its memory slips now and then, more on longer patterns: Family loses track around five or six lights, Tricky
// usually makes it to the end. A slip is a wrong light, which ends its round like anyone's.
import { by } from '../cpu-kit.js';
import { LIGHTS } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  const gap = by(sk, [0.8, 0.6, 0.46]), slipAt = len => by(sk, [0.05 + 0.022 * len, 0.025 + 0.012 * len, 0.012 + 0.007 * len]);
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.phase === 'show' && g.pat && mem.r !== g.r) { mem.r = g.r; mem.pat = g.pat; mem.sent = -1; mem.next = null; mem.lost = false; }
      if (g.phase !== 'play' || !mem.pat || mem.r !== g.r) return;
      const row = g.p?.[c.pid]; if (!row || row[1] !== 0) return;
      const pos = row[0]; if (pos <= mem.sent) return;   // wait for the last tap to land
      mem.next ??= v.t + 0.5 + c.rng() * gap;
      if (v.t < mem.next) return;
      mem.next = v.t + gap * (0.7 + c.rng() * 0.6);
      if (!mem.lost && c.rng() < slipAt(mem.pat.length)) mem.lost = true;
      const want = +mem.pat[pos];
      mem.sent = pos;
      v.act('tap', mem.lost ? (want + 1 + Math.floor(c.rng() * (LIGHTS.length - 1))) % LIGHTS.length : want);
    },
  };
}
