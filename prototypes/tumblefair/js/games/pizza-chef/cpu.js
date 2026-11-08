// Pizza Pronto CPU: reads each ticket and builds it at a person's pace (a beat for the sauce, the cheese and every
// topping), sometimes one topping too many or too few or on the wrong half, slides it in, then pulls it out aiming for
// the middle of the golden band, off by a person's timing. Family is slower and sloppier on both; Tricky is quick and
// usually golden.
import { by, gauss } from '../cpu-kit.js';
import { perfectPizza } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  const per = by(sk, [0.42, 0.38, 0.36]), miscount = by(sk, [0.15, 0.12, 0.1]), pullSd = by(sk, [0.31, 0.27, 0.25]);
  function build(o) {
    const p = perfectPizza(o), tp = [];
    for (const ln of o.lines) {
      let mine = p.tp.filter(t => t[0] === ln.k);
      if (c.rng() < miscount) mine = c.rng() < 0.5 ? mine.slice(1) : [...mine, [ln.k, mine[0]?.[1] ?? 0.3, -0.5]];
      if (ln.where !== 'all' && c.rng() < miscount * 0.6 && mine.length) mine = [[ln.k, -mine[0][1], mine[0][2]], ...mine.slice(1)];
      tp.push(...mine);
    }
    return { s: c.rng() < miscount * 0.2 ? (o.sauce === 'red' ? 'white' : 'red') : o.sauce, c: o.cheese, tp };
  }
  return {
    tick(v) {
      const g = v.g, init = v.init; if (!g || g.phase !== 'play' || !init) return;
      if (mem.t0 == null) mem.t0 = v.t;
      const t = Math.round((v.t - mem.t0) * 100) / 100, k = g.k?.[c.pid]; if (k == null || k >= init.orders.length) return;
      const o = init.orders[k];
      if (mem.k !== k) {                                           // a new ticket: read it, then build
        mem.k = k; mem.state = 'build';
        const items = 2 + o.lines.reduce((a, ln) => a + ln.n, 0);
        mem.at = t + 1 + items * per * (0.8 + c.rng() * 0.4);
      }
      if (t < mem.at) return;
      if (mem.state === 'build') {
        v.act('oven', { p: build(o), t }); mem.state = 'bake'; mem.oven = t;
        mem.at = t + init.bakeT * 0.74 + gauss(c.rng) * pullSd;
      } else if (mem.state === 'bake') { v.act('pull', { t: Math.max(t, mem.oven + 0.05) }); mem.state = 'done'; }
    },
  };
}
