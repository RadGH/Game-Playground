// Order Up! CPU: reads the bubbles while they are up and remembers each customer's order by their hat, item by item —
// with a chance to forget an item or mix it up that grows with the length of the line (Family forgets a lot, Tricky
// rarely). Then it builds each tray and serves, taking a moment per order and a little more per item.
import { by, gauss } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, foods = c.init?.foods ?? 6;
  const keep = by(sk, [0.8, 0.9, 0.94]), fade = by(sk, [0.05, 0.035, 0.02]), pace = by(sk, [2.1, 1.6, 1.3]);
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.phase === 'show' && g.orders && mem.r !== g.round) {
        mem.r = g.round; const k = keep - fade * (g.n - 2);
        mem.book = new Map(g.who.map((cu, i) => [cu, g.orders[i].flatMap(f => {
          if (c.rng() < k) return [f];
          return c.rng() < 0.5 ? [] : [(f + 1 + Math.floor(c.rng() * (foods - 1))) % foods];   // forgot it, or mixed it up
        })]));
      }
      if (g.phase !== 'serve' || !g.k || mem.r !== g.round) { mem.at = null; return; }
      const kk = g.k[c.pid]; if (kk >= g.n) return;
      const cu = g.who[g.queue[kk]], items = mem.book.get(cu) || [];
      if (mem.at == null || mem.atK !== kk) { mem.atK = kk; mem.at = v.t + (kk === 0 ? sk.react : 0) + Math.max(0.6, pace + items.length * 0.3 + gauss(c.rng) * 0.3); }
      if (v.t < mem.at) return;
      mem.at = Infinity;
      v.act('serve', { r: g.round, k: kk, items: items.length ? items : [Math.floor(c.rng() * foods)] });
    },
  };
}
