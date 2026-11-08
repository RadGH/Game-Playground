// Dirt Dash CPU: rides like a person watching the gauge: holds GAS, taps LEAN when the front wheel climbs too far,
// and in the air works out (from its own bike, as the phone does) whether a flip fits before touching down, then
// holds GAS or LEAN for about as long as it takes to line the bike up with the ground and lets go. Its eye and hands
// are a little off each time, so it lands crooked now and then. Family flips rarely and reacts late; Tricky goes for
// flips on the big jumps and catches the gauge early.
import { by, gauss } from '../cpu-kit.js';
import { buildTrack, stepBike, slopeAt, BIKE } from './sim.js';

const TAU = Math.PI * 2;
export function createCpu(c) {
  const sk = c.skill, mem = { inp: { g: 1, l: 0 }, next: 0, sent: -9, until: 0 };
  const lean = by(sk, [0.72, 0.66, 0.62]), flipWill = by(sk, [0.25, 0.45, 0.58]), margin = by(sk, [0.5, 0.32, 0.22]);
  const tol = by(sk, [0.3, 0.22, 0.16]), err = by(sk, [0.32, 0.24, 0.2]);
  function airPlan(b, H, L) {                         // how long until touchdown if I keep still, and the slope there
    const s = { ...b }; let t = 0;
    while (s.air && t < 4) { stepBike(s, { g: 0, l: 0 }, H, L); t += 0.05; }
    return { t, slope: slopeAt(H, s.x) };
  }
  return {
    tick(v) {
      const g = v.g, init = v.init, p = v.priv; if (!g || g.phase !== 'play' || !init || !p?.b) return;
      mem.H ||= buildTrack(init.features);
      const b = p.b, L = init.level, k = Math.round(g.el / 0.05);
      if (b.air && v.t >= mem.until && (mem.inp.g || mem.inp.l)) mem.inp = { g: 0, l: 0 };   // let go of the spin
      if (v.t >= mem.next) {
        mem.next = v.t + sk.think * (0.8 + c.rng() * 0.5);
        if (b.crash > 0 || b.done) mem.inp = { g: 0, l: 0 };
        else if (!b.air) { mem.flip = null; mem.inp = b.w > lean * BIKE.loop ? { g: 0, l: 1 } : { g: 1, l: 0 }; }
        else {
          const plan = airPlan(b, mem.H, L), pred = b.ang + b.av / BIKE.follow;
          if (mem.flip == null) mem.flip = plan.t > TAU / BIKE.spin + margin + 0.2 && c.rng() < flipWill;
          let target = plan.slope + TAU * Math.round((pred - plan.slope) / TAU);
          if (mem.flip && target - pred < 1 && plan.t > (target + TAU - pred) / BIKE.spin + margin) target += TAU;   // room for a whole turn
          const off = target - pred;
          if (Math.abs(off) > tol) { mem.inp = off > 0 ? { g: 1, l: 0 } : { g: 0, l: 1 }; mem.until = v.t + Math.abs(off) / BIKE.spin * Math.max(0.3, 1 + gauss(c.rng) * err); }
          else mem.inp = { g: 0, l: 0 };
        }
      }
      const key = mem.inp.g * 2 + mem.inp.l;
      if (key !== mem.key || k - mem.sent >= 4) { mem.key = key; mem.sent = k; v.act('in', { k, ...mem.inp }); }
    },
  };
}
