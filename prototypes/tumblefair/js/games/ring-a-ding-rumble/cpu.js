// Ring-a-Ding Rumble CPU: closes on the nearest fighter, circles at arm's length, jabs, now and then winds up a big
// swing, blocks (or dodges) a wind-up it notices and backs off when out of puff. Family notices late, mashes and gasses
// out; Tricky spaces its punches by its puff, swings at a fighter who is busy, and reads wind-ups.
import { stickTo, by, slip, A, B } from '../cpu-kit.js';
import { MODE, RULES } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = { next: 0, hold: 0, bits: 0, strafe: c.rng() < 0.5 ? 1 : -1, stick: null };
  return {
    tick(v) {
      const me = v.me, g = v.g; if (!me || !g?.f) return null;
      const mine = g.f[c.pid]; if (!mine || mine[3] === MODE.OUT || mine[3] === MODE.DOWN) return null;
      if (mem.hold > 0) { mem.hold -= v.dt; return { ...(mem.stick || { mx: 0, mz: 0 }), b: mem.bits }; }
      if (v.t < mem.next) return { ...(mem.stick || { mx: 0, mz: 0 }), b: 0 };
      mem.next = v.t + by(sk, [0.3, 0.22, 0.16]) * (0.8 + c.rng() * 0.6);
      const foes = [];
      for (const [p, b] of v.bodies) { const f = g.f[p]; if (p !== c.pid && f && f[3] !== MODE.OUT && f[3] !== MODE.DOWN) foes.push({ b, mode: f[3] }); }
      if (g.cpu) { const f = g.f[-1]; if (f && f[3] !== MODE.OUT && f[3] !== MODE.DOWN) foes.push({ b: { x: g.cpu[0], z: g.cpu[1] }, mode: f[3] }); }
      if (!foes.length) return (mem.stick = { mx: 0, mz: 0 }, { mx: 0, mz: 0, b: 0 });
      foes.forEach(f => { f.d = Math.hypot(f.b.x - me.x, f.b.z - me.z) + c.rng() * 0.1; });   // the jitter: two foes about as near are a coin toss, not "the lower seat"
      foes.sort((a, b) => a.d - b.d);
      const t = foes[0], dx = t.b.x - me.x, dz = t.b.z - me.z, d = t.d || 1, nx = dx / d, nz = dz / d, puff = mine[1];
      const face = { mx: nx * 0.25, mz: nz * 0.25 };
      // a wind-up or a swing coming at me: block it, or (Tricky) dodge sideways
      if ((t.mode === MODE.CHARGE || t.mode === MODE.SWING) && d < 2.2 && c.rng() < by(sk, [0.25, 0.45, 0.75])) {
        if (puff > RULES.dodgeCost + 10 && c.rng() < by(sk, [0.1, 0.25, 0.4])) { mem.stick = { mx: -nz * mem.strafe, mz: nx * mem.strafe }; mem.hold = 0.1; mem.bits = B; return { ...mem.stick, b: B }; }
        mem.stick = face; mem.hold = 0.35 + c.rng() * 0.3; mem.bits = B; return { ...face, b: B };
      }
      if (puff < by(sk, [12, 25, 18])) { mem.stick = stickTo(me, me.x - nx * 3, me.z - nz * 3, sk); return { ...mem.stick, b: 0 }; }
      if (d < 1.5) {
        if (c.rng() < 0.25) mem.strafe *= -1;
        if (slip(sk, c.rng)) { mem.stick = { mx: -nz * mem.strafe * 0.6, mz: nx * mem.strafe * 0.6 }; return { ...mem.stick, b: 0 }; }
        const big = c.rng() < (t.mode === MODE.BLOCK ? by(sk, [0.1, 0.2, 0.6]) : 0.15);    // a big swing drains a guard
        if (big && puff > RULES.hay.cost + 5) { mem.stick = face; mem.hold = RULES.hayFull * (0.6 + c.rng() * 0.45); mem.bits = A; return { ...face, b: A }; }
        if (t.mode === MODE.BLOCK && c.rng() < by(sk, [0, 0.3, 0.3])) { mem.stick = { mx: -nz * mem.strafe * 0.7, mz: nx * mem.strafe * 0.7 }; return { ...mem.stick, b: 0 }; }   // circle round a guard
        mem.stick = face; return { ...face, b: A };
      }
      mem.stick = stickTo(me, t.b.x - nx * 1.1, t.b.z - nz * 1.1, sk, { arrive: 0.3 });
      return { ...mem.stick, b: 0 };
    },
  };
}
