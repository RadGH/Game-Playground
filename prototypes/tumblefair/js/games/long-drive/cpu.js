// Long Drive CPU: stops the power bar near the top and the accuracy needle near the middle with a timing error the size
// of its skill (converted through the game's own meter speeds, so a faster meter is harder for it too), and aims into
// the crosswind (Family often forgets the wind). It waits like a person between drives.
import { by, gauss, clamp, slip } from '../cpu-kit.js';
import { AIM_STEP, AIM_MAX } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, L = c.init?.level || { power: 1.3, acc: 1.05 }, winds = c.init?.winds || [];
  const err = () => gauss(c.rng) * sk.tapMs * by(sk, [0.95, 1, 1.05]) / 1000;           // seconds off the ideal moment
  return {
    tick(v) {
      const g = v.g; if (!g || !g.go) return;
      const n = g.n?.[c.pid] ?? 0;
      if (n >= 3 || g.busy?.[c.pid]) { mem.at = null; return; }
      if (mem.at == null) mem.at = v.t + 1 + sk.react * (1 + c.rng() * 2) + L.power * 0.6 + L.acc * 0.6;   // reads the wind, watches the meters
      if (v.t < mem.at) return;
      mem.at = null;
      const w = winds[n] || { mph: 0, dir: 0 }, cross = w.mph * Math.sin(w.dir);
      const p = clamp(1 - Math.abs(err()) / (L.power / 2) - 0.02, 0, 1);
      const a = clamp(err() / (L.acc / 2), -1, 1);
      const readWind = !slip(sk, c.rng, 1.5);
      const deg = readWind ? -cross * 1.5 / 250 * 180 / Math.PI * (0.8 + c.rng() * 0.4) : 0;
      const aim = clamp(Math.round(deg / AIM_STEP), -AIM_MAX, AIM_MAX);
      v.act('swing', { p: Math.round(p * 1000) / 1000, a: Math.round(a * 1000) / 1000, aim });
    },
  };
}
