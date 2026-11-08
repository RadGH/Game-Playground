// Memory Heist CPU: looks at the open vault (everyone sees it) and keeps each question it can "remember" with a chance
// set by skill (Family about half, Tricky most of them); a remembered one is worked out from the vault it saw, the rest
// are guesses. It answers after reading the question — slower at Family, which also costs speed points.
import { by, later, readDelay, pick } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  const recall = by(sk, [0.42, 0.66, 0.82]);
  function answer(q, vault) {
    const cnt = new Map(); vault.forEach(([k]) => cnt.set(k, (cnt.get(k) || 0) + 1));
    const w = c.init?.w || 4, find = k => vault.find(v => v[0] === k);
    const idx = (() => {
      switch (q.kind) {
        case 'spot': { const s = q.text; for (let i = 0; i < q.opts.length; i++) if (mem.spotOf?.(s) === q.opts[i].k) return i; return -1; }
        case 'count': return q.opts.findIndex(o => o.n === cnt.get(q.k));
        case 'colour': return q.opts.findIndex(o => o.c === find(q.k)?.[1]);
        case 'missing': return q.opts.findIndex(o => !cnt.has(o.k));
        case 'most': { const top = Math.max(...cnt.values()); return q.opts.findIndex(o => cnt.get(o.k) === top); }
        case 'beside': { const i = vault.findIndex(v => v[0] === q.k), x = i % w, j = /LEFT/.test(q.text) ? (x > 0 ? i - 1 : -1) : (x < w - 1 ? i + 1 : -1); return i < 0 || j < 0 ? -1 : q.opts.findIndex(o => o.k === vault[j][0]); }
      }
      return -1;
    })();
    return idx;
  }
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.vault && g.phase === 'study' && !mem.vault) {
        mem.vault = g.vault;
        const W = c.init?.w || 4, H = mem.vault.length / W;
        const names = { 'top-left corner': 0, 'top-right corner': W - 1, 'bottom-left corner': (H - 1) * W, 'bottom-right corner': H * W - 1,
          'middle of the top row': (W - 1) / 2, 'middle of the bottom row': (H - 1) * W + (W - 1) / 2, 'middle of the left side': ((H - 1) / 2) * W,
          'middle of the right side': ((H - 1) / 2) * W + W - 1, 'very middle': ((H - 1) / 2) * W + (W - 1) / 2 };
        mem.spotOf = text => { const m = /the (.+)\?$/.exec(text); const i = m ? names[m[1]] : undefined; return i == null ? undefined : mem.vault[i]?.[0]; };
      }
      if (g.phase !== 'q' || !g.q) return;
      later(mem, v, 'q' + g.qi, () => {
        let i = mem.vault && c.rng() < recall ? answer(g.q, mem.vault) : -1;
        if (i < 0) i = Math.floor(c.rng() * g.q.opts.length);
        v.act('ans', i);
      }, readDelay(sk, c.rng, by(sk, [2.2, 1.6, 1.1])) + c.rng() * 1.5);
    },
  };
}
