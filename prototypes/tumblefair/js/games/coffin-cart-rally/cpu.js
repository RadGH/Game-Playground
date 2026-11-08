// Coffin Cart Rally CPU: drives the racing line a few metres ahead along the crypt (the track is on screen), hops a
// glowing or raised hand in its lane when it is about to roll over it, and BOOs a cart right beside it now and then.
// Family drives a little slower, wobbles off the line and hops late (it gets grabbed more); Tricky hops on time.
import { by, noisy, gauss, slip, A, B } from '../cpu-kit.js';
import { makeTrack } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = { k: -1, hopAt: null, wob: 0, wobT: 0 };
  let T = null;
  const pace = by(sk, [0.93, 0.93, 0.95]), look = by(sk, [3, 4, 5]);
  return {
    tick(v) {
      const me = v.me, g = v.g; if (!me || !g || !g.rs) return null;
      T ||= makeTrack(v.init.track.variant);
      const { loop } = T, N = loop.N;
      if (mem.k < 0) { let bd = Infinity; for (let k = 0; k < N; k++) { const d = (me.x - loop.cx[k]) ** 2 + (me.z - loop.cz[k]) ** 2; if (d < bd) { bd = d; mem.k = k; } } }
      else { let bk = mem.k, bd = Infinity; for (let d = -5; d <= 5; d++) { const k = ((mem.k + d) % N + N) % N, dd = (me.x - loop.cx[k]) ** 2 + (me.z - loop.cz[k]) ** 2; if (dd < bd) { bd = dd; bk = k; } } mem.k = bk; }
      if (g.cd || (me.flags & (2 | 8))) return null;
      const k = mem.k;
      if (v.t >= mem.wobT) { mem.wob = noisy(0, 0.7, sk, c.rng); mem.wobT = v.t + 0.6 + c.rng(); }
      const [x, z] = T.at(k + look, Math.max(-1.1, Math.min(1.1, mem.wob)));
      let mx = x - me.x, mz = z - me.z; const m = Math.hypot(mx, mz) || 1; mx = mx / m * pace; mz = mz / m * pace;
      let b = 0;
      // a hand ahead in my lane, glowing or up: hop as I reach it (a person times it by eye)
      const lat = (me.x - loop.cx[k]) * -loop.tz[k] + (me.z - loop.cz[k]) * loop.tx[k], sp = Math.hypot(me.vx, me.vz);
      v.init.track.spots.forEach((s, i) => {
        let d = s.k - k; if (d < 0) d += N; if (d > 4 || d < 0.2) return;
        const spot = T.spots[i]; if (Math.abs(lat - spot.lat) > 1.3 || g.h[i] === '0') return;
        if (mem.hopFor === i + ':' + Math.floor(g.t / 2)) return;
        const eta = d * (loop.L / N) / Math.max(1.5, sp);
        if (eta < 0.3 + (sk.level === 0 ? 0.15 : 0)) { mem.hopFor = i + ':' + Math.floor(g.t / 2); if (!slip(sk, c.rng, 0.8)) mem.hopAt = v.t + Math.max(0, gauss(c.rng) * sk.tapMs / 1000 + (sk.level === 0 ? 0.04 : 0)); }
      });
      if (mem.hopAt != null && v.t >= mem.hopAt) { b |= A; mem.hopAt = null; }
      const beside = [...v.bodies].some(([p, o]) => p !== c.pid && Math.hypot(o.x - me.x, o.z - me.z) < 1.4) || (g.cpu || []).some(o => Math.hypot(o[1] - me.x, o[2] - me.z) < 1.4);
      if (beside && !g.rs[c.pid]?.[3] && c.rng() < by(sk, [0.01, 0.02, 0.03])) b |= B;
      return { mx, mz, b };
    },
  };
}
