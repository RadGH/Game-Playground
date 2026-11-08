// Cauldron Bobbing CPU: watches its eyeball, spots the next moment it will be both under the face and up top (a
// person reads the drift and the bob), and bites for the middle of that moment, off by a person's timing error. It
// leaves the toad alone, except Family now and then bites him by mistake. Family's timing is loose (more "Too deep!"
// and splashes); Tricky's is tight.
import { by, gauss } from '../cpu-kit.js';
import { newLane, settle, bite, biteable } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  const spread = by(sk, [0.13, 0.085, 0.066]), toadSlip = by(sk, [0.25, 0.08, 0.03]);
  function plan(init, L, t) {                       // the middle of the next bite window after a reaction
    const e = init.eyes[L.k]; if (!e) return Infinity;
    if (e.kind === 'toad') return c.rng() < toadSlip ? Math.max(t, L.from) + sk.react + c.rng() * 0.8 : Infinity;
    let s = Math.max(t, L.from, L.stun) + sk.react * (0.6 + c.rng() * 0.5) - L.from, a = null;
    for (let i = 0; i < 1200; i++, s += 0.01) {
      const ok = biteable(e, s, init.zone);
      if (ok && a == null) a = s;
      if (!ok && a != null) { if (s - a > 0.06) return L.from + (a + s) / 2 + gauss(c.rng) * spread; a = null; }
    }
    return Infinity;
  }
  return {
    tick(v) {
      const g = v.g, init = v.init; if (!g || g.phase !== 'play' || !init) return;
      if (mem.t0 == null) { mem.t0 = v.t; mem.L = newLane(); }
      const t = v.t - mem.t0, L = mem.L; if (t > init.play) return;
      settle(L, init.eyes, t);
      const key = L.k + ':' + L.stun;
      if (mem.key !== key) { mem.key = key; mem.at = plan(init, L, t); }
      if (t < mem.at) return;
      const at = Math.ceil(Math.max(mem.at, L.last, L.stun, 0) * 1000) / 1000, k = L.k;
      if (at > init.play) return;
      settle(L, init.eyes, at);
      if (L.k !== k) return;                         // the toad paddled off meanwhile
      bite(L, init.eyes, at, init.zone);
      v.act('bite', { k, t: at });
    },
  };
}
