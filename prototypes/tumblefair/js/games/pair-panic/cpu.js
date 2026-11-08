// Pair Panic CPU: remembers what it saw in the peek and every card anyone flips (as a person watching the table
// would), flips a pair it knows, snatches a card a rival holds up when it matches, else tries a card it has not seen.
// Family takes in little of the peek, forgets fast and taps slowly; Tricky takes in most of it and taps briskly.
import { by } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = new Map(), st = { b: -1, peeked: -1, next: 0 };
  const gap = by(sk, [0.68, 0.62, 0.6]), keep = by(sk, [0.38, 0.45, 0.5]), forget = by(sk, [0.045, 0.035, 0.03]);
  return {
    tick(v) {
      const g = v.g, init = v.init; if (!g || !init) return;
      if (g.b !== st.b) { st.b = g.b; mem.clear(); }
      if (g.phase === 'peek' && st.peeked !== g.b) { st.peeked = g.b; g.peek.forEach((p, i) => { if (c.rng() < keep) mem.set(i, p); }); }
      if (g.phase !== 'play') { st.next = v.t + sk.react; return; }
      for (const [i, p] of g.up) mem.set(i, p);
      for (const i of g.gone) mem.delete(i);
      for (const i of [...mem.keys()]) if (c.rng() < forget * v.dt) mem.delete(i);
      if (g.lock.includes(c.pid) || v.t < st.next) return;
      st.next = v.t + gap * (0.75 + c.rng() * 0.5);
      const n = init.cols * init.rows, mine = g.up.filter(u => u[2] === c.pid), busy = new Set(g.up.map(u => u[0])), gone = new Set(g.gone);
      const free = [...Array(n).keys()].filter(i => !busy.has(i) && !gone.has(i));
      const unknown = free.filter(i => !mem.has(i)), guess = () => { const l = unknown.length ? unknown : free; return l[Math.floor(c.rng() * l.length)]; };
      if (mine.length === 1) {
        const want = mine[0][1], held = g.up.filter(u => u[2] !== c.pid && u[1] === want && !g.lock.includes(u[2]) && g.up.filter(w => w[2] === u[2]).length === 1);
        const hit = held[0]?.[0] ?? free.find(i => mem.get(i) === want);
        if (hit == null && !free.length) return;
        v.act('flip', hit ?? guess()); return;
      }
      if (mine.length || !free.length) return;
      const byPic = new Map();
      for (const i of free) if (mem.has(i)) { const p = mem.get(i); if (byPic.has(p)) { v.act('flip', byPic.get(p)); return; } byPic.set(p, i); }
      v.act('flip', guess());
    },
  };
}
