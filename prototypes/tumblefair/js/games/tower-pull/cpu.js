// Tower Pull CPU: on its turn it looks the tower over, grabs a block (the safest when the wobble meter is high; when it
// is calm, Tricky goes for the risky +2 blocks and Family just takes any decent one), then taps PULL as the marker
// swings through the middle, off by its timing error — so a sloppy pull shakes the tower more, just like a person's.
import { by, gauss, pickBest } from '../cpu-kit.js';
import { legal } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, L = c.init?.level || { period: 1.15, zone: 1 };
  const r2 = x => Math.round(x * 100) / 100;
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.phase === 'count') return;
      if (mem.t0 == null) mem.t0 = v.t - Math.max(0, g.el || 0);
      const el = v.t - mem.t0;
      if (g.phase !== 'turn' || g.who !== c.pid) { mem.k = null; return; }
      if (mem.k !== g.k) { mem.k = g.k; mem.at = el + 0.6 + sk.react * (1 + c.rng() * 2); mem.pulled = false; mem.pullAt = null; }
      if (!g.pk && el >= mem.at && !mem.picked) {
        const tower = g.tw.split('').map(Number), opts = legal(tower), calm = g.w < by(sk, [55, 45, 40]);
        const o = pickBest(opts, ([, , risk]) => calm && risk < 24 ? (risk >= 18 ? by(sk, [0, 5, 10]) : 0) - risk * 0.1 : -risk, sk, c.rng);
        mem.picked = g.k; v.act('pick', { lv: o[0], s: o[1], t: r2(el) });
        return;
      }
      if (mem.picked !== g.k) mem.picked = false;
      if (g.pk && !mem.pulled) {
        if (mem.pullAt == null) {
          const t0 = g.pk[2], P = L.period, ready = el + 0.3 + sk.react * (0.5 + c.rng());
          let k = 0, ideal; do ideal = t0 + P / 4 + k * P / 2, k++; while (ideal < ready);   // the marker crosses the middle every half swing
          mem.pullAt = Math.min(ideal + gauss(c.rng) * sk.tapMs / 1000 * by(sk, [1, 1, 0.95]), g.pk[2] + 7.5);
        }
        if (el >= mem.pullAt) { mem.pulled = true; v.act('pull', { t: r2(Math.max(mem.pullAt, g.pk[2])) }); }
      }
    },
  };
}
