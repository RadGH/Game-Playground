// Pattern Impostor CPU: works the puzzle out from the pictures on screen (the one that breaks an "all the same" or
// "each X has its own Y" rule), taking longer on the sneaky later rounds. Skill sets how long it stares and how often
// it gives up and taps a wrong-but-plausible picture: Family is slow and often fooled, Tricky quick and usually right.
import { by, gauss } from '../cpu-kit.js';
import { decode, KEYS } from './sim.js';

/** The picture that breaks a rule the others all keep (same value, or a clean a -> b pairing), or -1. */
export function solve(items) {
  const n = items.length;
  for (let i = 0; i < n; i++) {
    const rest = items.filter((_, j) => j !== i), me = items[i];
    for (const k of KEYS) if (rest.every(it => it[k] === rest[0][k]) && me[k] !== rest[0][k]) return i;
    for (const a of KEYS) for (const b of KEYS) {
      if (a === b) continue;
      const map = new Map(); let ok = true;
      for (const it of rest) { if (map.has(it[a]) && map.get(it[a]) !== it[b]) { ok = false; break; } map.set(it[a], it[b]); }
      if (ok && map.size > 1 && new Set(map.values()).size === map.size && map.has(me[a]) && map.get(me[a]) !== me[b]) return i;
    }
  }
  return -1;
}

export function createCpu(c) {
  const sk = c.skill, mem = {};
  return {
    tick(v) {
      const g = v.g; if (!g || g.phase !== 'play' || !g.items) return;
      if (mem.r !== g.round) {
        const items = g.items.split(',').map(decode), lv = g.round < 2 ? 1 : g.round < 4 ? 2 : 3;
        const base = by(sk, [3.2, 2.3, 1.9]) * [1, 1.5, 2.3][lv - 1];
        const odd = solve(items), wrongP = by(sk, [0.22, 0.12, 0.06]) * lv;
        mem.r = g.round; mem.at = v.t + Math.max(0.9, base * (1 + gauss(c.rng) * 0.4));
        mem.pick = odd >= 0 && c.rng() >= wrongP ? odd : Math.floor(c.rng() * items.length);
        if (mem.pick === odd && mem.at > v.t + 9.3) mem.pick = Math.floor(c.rng() * items.length);  // ran out of time: a hurried guess
        mem.at = Math.min(mem.at, v.t + 9.3);
      }
      if (mem.at != null && v.t >= mem.at) { mem.at = null; v.act('tap', mem.pick); }
    },
  };
}
