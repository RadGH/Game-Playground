// Fairway Golf CPU: when its ball is ready it studies the hole it is shown (the layout, its lie, the wind flag) and
// picks a club, an aim and a strength the way a careful golfer would, then works the two meters like a phone — the
// power tap and the accuracy needle each land a little off by its skill, which is where hooks, slices and short shots
// come from. Family's taps wander and it ignores the wind half the time; Tricky taps close to the marks.
import { by, gauss, readDelay } from '../cpu-kit.js';
import { planShot, clubsFor } from './sim.js';
import { hydrate, LIES } from './course.js';

export function createCpu(c) {
  const sk = c.skill, I = c.init || {}, H = I.layout ? hydrate(JSON.parse(JSON.stringify(I.layout))) : null, mem = {};
  return {
    tick(v) {
      const g = v.g; if (!g?.go || !H) return;
      const row = g.b?.find(r => r[0] === c.pid); if (!row || row[3] !== 0) return;
      const key = row[4] + ':' + row[1] + ':' + row[2];
      if (mem.key !== key) { mem.key = key; mem.at = v.t + readDelay(sk, c.rng, by(sk, [2.6, 1.8, 1.4])); mem.sent = false; }   // look, then the two meter taps
      if (v.t < mem.at || (mem.sent && v.t < mem.retry)) return;               // (a swing that did not take: try again)
      mem.sent = true; mem.retry = v.t + 3;
      const lie = LIES[row[5]] || 'fairway', wind = I.wind && c.rng() < by(sk, [0.5, 0.85, 1]) ? I.wind : { mph: 0, dir: 0 };
      const plan = planShot(H, { x: row[1], y: row[2] }, lie, wind, I.level);
      if (!plan || !clubsFor(lie).includes(plan.c)) return;
      const putt = plan.c === 'pt';
      const p = Math.max(0, Math.min(1, plan.p * (1 + gauss(c.rng) * (putt ? by(sk, [0.14, 0.08, 0.05]) : by(sk, [0.09, 0.05, 0.03])))));
      const a = putt ? 0 : Math.max(-1, Math.min(1, gauss(c.rng) * by(sk, [0.3, 0.15, 0.08])));
      const aim = plan.aim + gauss(c.rng) * (putt ? by(sk, [0.05, 0.03, 0.02]) : by(sk, [0.02, 0.01, 0.006]));
      v.act('swing', { c: plan.c, p: Math.round(p * 1000) / 1000, a: Math.round(a * 100) / 100, aim: Math.round(aim * 10000) / 10000 });
    },
  };
}
