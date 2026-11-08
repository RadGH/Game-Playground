// Wagon Trail CPU: plays each challenge on its own clock, the way a phone does — taps GO as the river marker swings
// into the calm water, shoots critters it can see (leading them a little), taps the lit bolts in order, grabs a moment
// after each lightning flash and buys when the price needle sits low. Skill sets its timing error, its reaction to a
// flash, its shooting pace and aim, and how bold a crossing it picks (Family the shallow ford, Tricky the deep swim).
import { by, gauss, clamp, slip } from '../cpu-kit.js';
import { riverAt, critterAt, priceAt, CROSS, SHOT_GAP, FLASH_WIN, VOTE_S, SLOTS } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, I = c.init || {}, L = I.level || { river: 1.35, band: 1, hunt: 7, post: 2.1 }, mem = {};
  const tap = () => gauss(c.rng) * by(sk, [0.15, 0.12, 0.09]);
  // the first moment at or after `from` that f(t) says yes (searching in 10 ms steps up to `to`)
  const when = (from, to, f) => { for (let t = from; t <= to; t += 0.01) if (f(t)) return t; return null; };
  function plan(ch) {
    const p = { ch, fired: false };
    if (ch === 'river') {
      const r = c.rng(), k = r < by(sk, [0.4, 0.55, 0.75]) ? (r < by(sk, [0.05, 0.15, 0.35]) ? 2 : 1) : 0;
      const tc = when(0.8 + sk.react, 7.5, t => Math.abs(riverAt(t, L) - I.river.c) < 0.01);
      p.k = k; p.at = tc == null ? 6 : tc + tap();
    } else if (ch === 'post') {
      const want = c.rng() < by(sk, [0.6, 0.75, 0.9]) ? 1 : 2;
      const tc = when(0.6 + sk.react, 6.5, t => priceAt(t, L) <= want && priceAt(t + 0.08, L) <= want);
      p.at = tc == null ? 5.5 : tc + 0.06 + Math.abs(tap()) * 0.6;
    } else if (ch === 'storm') p.vote = c.rng() < 0.6 ? 0 : 1, p.voteAt = 1 + sk.react * (1 + c.rng() * 2), p.grabbed = new Set();
    p.next = sk.react;
    return p;
  }
  return {
    tick(v) {
      const g = v.g; if (!g) return;
      if (g.ph !== 'go') { mem.p = null; return; }
      if (!mem.p || mem.p.ci !== g.ci) { mem.p = plan(g.c); mem.p.ci = g.ci; mem.p.t0 = v.t - 0.05; }
      const P = mem.p, t = v.t - P.t0, phone = Math.round((g.t0 + t) * 100) / 100, done = g.dn?.includes(c.pid);
      if (g.c === 'river' && !done && t >= P.at) v.act('ford', { c: P.k, t: Math.round((g.t0 + P.at) * 100) / 100 }), P.at = 99;
      else if (g.c === 'post' && !done && t >= P.at) {
        const price = priceAt(P.at, L), it = g.hp < 3 && g.food >= price ? 0 : 1;
        v.act('buy', { it, t: Math.round((g.t0 + P.at) * 100) / 100 }); P.at = 99;
      } else if (g.c === 'hunt' && t >= P.next) {
        const hit = new Set(g.hit || []), seen = (I.critters || []).filter(cr => !hit.has(cr.i) && t - cr.s > sk.react * 0.6).map(cr => [cr, critterAt(cr, t + 0.1)]).filter(([, p]) => p && p.x > 4 && p.x < 96);
        if (seen.length) {
          const [cr, p] = seen.sort((a, b) => b[0].gold - a[0].gold || Math.abs(a[1].x - 50) - Math.abs(b[1].x - 50))[0];
          const spread = by(sk, [4, 3.8, 3.1]);
          v.act('shot', { x: p.x + gauss(c.rng) * spread, y: p.y + gauss(c.rng) * spread * 0.6, t: phone });
          void cr; P.next = t + Math.max(SHOT_GAP + 0.05, by(sk, [0.92, 0.85, 0.72]) * (0.7 + c.rng() * 0.6));
        } else P.next = t + 0.15;
      } else if (g.c === 'wheel' && g.pr && !done && t >= P.next) {
        const prog = g.pr[c.pid] ?? 0, right = I.seq[prog];
        v.act('bolt', { i: slip(sk, c.rng, 0.4) ? (right + 1) % SLOTS : right });
        P.next = t + Math.max(0.2, by(sk, [0.58, 0.52, 0.44]) * (0.7 + c.rng() * 0.6));
      } else if (g.c === 'storm') {
        if (t < VOTE_S && !P.voted && t >= P.voteAt) { P.voted = true; v.act('vote', { r: P.vote }); }
        if (g.rt && I.flashes?.[g.rt]) I.flashes[g.rt].forEach((f, k) => {
          const rt = Math.max(0.12, by(sk, [0.45, 0.42, 0.34]) * (0.75 + c.rng() * 0.5));
          if (!P.grabbed.has(k) && t >= f + rt) { P.grabbed.add(k); if (t - f <= FLASH_WIN && !slip(sk, c.rng, 0.5)) v.act('grab', { t: phone }); }
        });
      }
    },
  };
}
